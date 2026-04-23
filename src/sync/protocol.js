import { createSQLiteAPI } from '../db/init.js';
import { detectVFS, openDB } from './storage.js';
import { fetchSnapshot, openStream } from './api.js';

// Client-side expiry mirrors the backend arb_view thresholds exactly.
// start_time is NOT used for expiry — the ETL schema explicitly documents
// that it is only a fixture context field (denormalized from the matcher).
// Bookmakers stop quoting upcoming odds once a match kicks off, so the
// scanner naturally stops seeing the arb and last_seen_at goes stale.
//
// Expired rows are soft-deleted: expired_at is set and the row moves to
// the UI's expired section for 3 hours before hard-deletion.
export function runExpiryCleanup(db) {
  try {
    // Mark newly stale rows as expired (only those not already expired)
    db.exec(`
      UPDATE arb_opportunities
      SET expired_at = datetime('now')
      WHERE expired_at IS NULL AND (
        (source_type = 'live'
          AND (unixepoch('now') - unixepoch(last_seen_at)) > 10)
        OR
        (source_type = 'upcoming'
          AND (unixepoch('now') - unixepoch(last_seen_at)) > 600)
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
      opp.leg_signature     ?? null,
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
  db.exec('DELETE FROM arb_opportunities WHERE id = ?', [opportunityId]);
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
 * @param {string}   bucket   'low' | 'mid' | 'high' | 'moon'
 * @param {Function} onUpdate called with (db) after every state change
 * @returns {Promise<object>} the db wrapper (for callers that need direct access)
 */
export async function boot(bucket, onUpdate) {
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
