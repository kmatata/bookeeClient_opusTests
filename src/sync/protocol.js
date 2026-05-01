import { createSQLiteAPI } from '../db/init.js';
import { detectVFS, openDB } from './storage.js';
import { fetchSnapshot, openStream } from './api.js';

// Client-side expiry mirrors the backend arb_view thresholds.
//
// Live arbs use a *hybrid* check:
// 1. oldest_odd_updated_at > 45 s  → underlying bookie data is stale
// 2. last_seen_at          > 15 s  → arb disappeared from matched view
//
// The 45 s window covers one full 30 s extractor cycle (reduced from 60 s)
// plus a 15 s grace period for matcher + scanner lag.
// The 15 s disappearance window catches arbs whose odds moved out of arb
// territory — the scanner stops detecting them and they go stale fast.
//
// Upcoming arbs continue to use last_seen_at (600 s) because the extractor
// cycle is still 600 s.
//
// EXPIRED: live fixtures whose start_time is more than 2.5 hours ago are
// considered finished.  start_time is naive EAT text; we convert it to UTC
// (subtract 3 hours) and compare against now minus 2.5 hours:
//   datetime(start_time, '-3 hours') < datetime('now', '-150 minutes')
//
// Soft-deleted rows move to the UI's expired section for 3 hours before
// hard-deletion.
export const EXPIRY_LIVE_S            = 45;
export const EXPIRY_LAST_SEEN_LIVE_S  = 15;
export const EXPIRY_UPCOMING_S        = 600;

export function runExpiryCleanup(db) {
  try {
    // Mark newly stale / expired rows (only those not already expired)
    db.exec(`
      UPDATE arb_opportunities
      SET expired_at = datetime('now')
      WHERE expired_at IS NULL AND (
        (source_type = 'live'
          AND (
            datetime(start_time, '-3 hours') < datetime('now', '-150 minutes')
            OR (unixepoch('now') - unixepoch(oldest_odd_updated_at)) > ${EXPIRY_LIVE_S}
            OR (unixepoch('now') - unixepoch(last_seen_at)) > ${EXPIRY_LAST_SEEN_LIVE_S}
          ))
        OR
        (source_type = 'upcoming'
          AND (unixepoch('now') - unixepoch(last_seen_at)) > ${EXPIRY_UPCOMING_S})
      )
    `);
    const newlyExpired = db.changes();

    // Hard-delete rows that have been in the expired section for 3 hours
    db.exec(`
      DELETE FROM arb_opportunities
      WHERE expired_at IS NOT NULL
        AND (unixepoch('now') - unixepoch(expired_at)) > 10800
    `);
    const hardDeleted = db.changes();

    return newlyExpired + hardDeleted;
  } catch {
    // Table/column not yet available (before first deserialize)
    return 0;
  }
}

export function applyUpsert(db, opp) {
  // Clear existing legs first; ON DELETE CASCADE is not guaranteed in all
  // environments, so we do it explicitly before replacing the parent row.
  db.exec('DELETE FROM arb_legs WHERE opportunity_id = ?', [opp.opportunity_id]);

  db.exec(
    `INSERT OR REPLACE INTO arb_opportunities (
      id, group_id, source_type, market_type, target_date, start_time,
      canonical_home, canonical_away, competition, country, confidence,
      n_legs, leg_signature, inverse_odds_sum, profit_margin_bps,
      total_stake, guaranteed_return, guaranteed_profit,
      oldest_odd_updated_at, latest_odd_updated_at,
      first_seen_at, last_seen_at, last_run_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      opp.opportunity_id,
      opp.group_id,
      opp.source_type,
      opp.market_type,
      opp.target_date,
      opp.start_time,
      opp.canonical_home,
      opp.canonical_away,
      opp.competition       ?? null,
      opp.country           ?? null,
      opp.confidence        ?? null,
      opp.n_legs,
      // leg_signature is not in arb_view / SSE payload — derive it the same
      // way the ETL does: sorted "bookmaker:outcome|..." string.
      opp.leg_signature
        ?? opp.legs.map(l => `${l.bookmaker}:${l.outcome}`).sort().join('|'),
      opp.inverse_odds_sum  ?? null,
      opp.profit_margin_bps,
      opp.total_stake,
      opp.guaranteed_return,
      opp.guaranteed_profit,
      opp.oldest_odd_updated_at ?? null,
      opp.latest_odd_updated_at ?? null,
      opp.first_seen_at,
      opp.last_seen_at,
      opp.last_run_id       ?? null,
    ],
  );

  for (const leg of opp.legs) {
    db.exec(
      `INSERT INTO arb_legs (
        opportunity_id, leg_index, bookmaker, outcome, odd, stake,
        expected_return, event_id, bookmaker_event_id, fetch_url,
        event_active, odd_updated_at, event_updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        opp.opportunity_id,
        leg.leg_index,
        leg.bookmaker,
        leg.outcome,
        leg.odd,
        leg.stake,
        leg.expected_return,
        leg.event_id,
        leg.bookmaker_event_id ?? null,
        leg.fetch_url          ?? null,
        leg.event_active       ?? null,
        leg.odd_updated_at,
        leg.event_updated_at   ?? null,
      ],
    );
  }
}

export function applyDelete(db, opportunityId) {
  // Soft-expire rather than hard-delete: the row moves to the expired section
  // for 3 hours so users can see arbs that just disappeared from the market.
  // Hard deletion is handled by runExpiryCleanup after the 3-hour window.
  db.exec(
    `UPDATE arb_opportunities SET expired_at = datetime('now') WHERE id = ? AND expired_at IS NULL`,
    [opportunityId],
  );
}

/**
 * boot — full client boot protocol for one bucket.
 *
 * 1. Load sqlite-wasm, detect VFS.
 * 2. Fetch snapshot → deserialize → run expiry cleanup → call onUpdate.
 * 3. Open SSE stream; apply upsert/delete events → call onUpdate after each.
 * 4. On snapshot_stale: re-fetch snapshot, re-deserialize, reconnect SSE.
 * 5. Expiry cleanup runs on a 5-second interval for the lifetime of the page.
 *
 * @param {string}   bucket     'low' | 'mid' | 'high' | 'moon'
 * @param {Function} onUpdate   called with (db) after every state change
 * @param {object}   [opts]     { onError, onOpen } for SSE connection state
 * @returns {Promise<object>} the db wrapper (for callers that need direct access)
 */
export async function boot(bucket, onUpdate, { onError, onOpen } = {}) {
  const sqlite3 = await createSQLiteAPI();
  const vfs = detectVFS(sqlite3);
  const db = openDB(sqlite3, `arb_${bucket}.db`, vfs);

  async function connect() {
    console.info(`[boot:${bucket}] fetching snapshot (vfs=${vfs})`);
    const { cursor, bytes } = await fetchSnapshot(bucket);
    db.deserialize(bytes);
    // expired_at is a client-only column not present in the ETL snapshot
    const cols = db.selectObjects(`PRAGMA table_info(arb_opportunities)`);
    if (!cols.some(c => c.name === 'expired_at')) {
      db.exec(`ALTER TABLE arb_opportunities ADD COLUMN expired_at TEXT`);
    }
    const pruned = runExpiryCleanup(db);
    console.info(`[boot:${bucket}] snapshot loaded — cursor=${cursor} pruned=${pruned}`);
    onUpdate(db);

    openStream(bucket, cursor, {
      onUpsert(opp) {
        applyUpsert(db, opp);
        runExpiryCleanup(db);
        onUpdate(db);
        console.debug(
          `[sse:${bucket}] upsert #${opp.opportunity_id} ` +
          `${opp.canonical_home} v ${opp.canonical_away} ` +
          `(${(opp.profit_margin_bps / 100).toFixed(2)}%)`,
        );
      },
      onDelete({ opportunity_id }) {
        applyDelete(db, opportunity_id);
        onUpdate(db);
        console.debug(`[sse:${bucket}] delete #${opportunity_id}`);
      },
      onStale(reason) {
        console.warn(`[sse:${bucket}] snapshot_stale`, reason);
        connect().catch((err) => console.error(`[boot:${bucket}] reconnect failed`, err));
      },
      onError,
      onOpen,
    });

    console.info(`[boot:${bucket}] SSE stream open (cursor=${cursor})`);
  }

  // Expiry interval starts once and survives snapshot_stale reconnections
  setInterval(() => {
    const n = runExpiryCleanup(db);
    if (n > 0) {
      console.debug(`[expiry:${bucket}] pruned ${n} row(s)`);
      onUpdate(db);
    }
  }, 5_000);

  await connect();
  return db;
}
