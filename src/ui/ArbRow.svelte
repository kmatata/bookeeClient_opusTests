<script>
  import { nowMs } from './time.js';
  import { EXPIRY_LIVE_S, EXPIRY_LAST_SEEN_LIVE_S, EXPIRY_UPCOMING_S } from '@sync/protocol.js';

  export let arb;
  export let expired = false;

  $: margin = (arb.profit_margin_bps / 100).toFixed(2);

  const EXPIRY_S = { live: EXPIRY_LIVE_S, upcoming: EXPIRY_UPCOMING_S };

  function fmtTime(s) {
    if (!s) return '—';
    const [, , day, hm] = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/) ?? [];
    return day && hm ? `${day} ${hm}` : s;
  }

  // Extract HH:MM:SS from an ISO 8601 or "YYYY-MM-DD HH:MM:SS" timestamp.
  // Timestamps are stored in EAT (+03:00) so the time component is directly readable.
  function fmtHms(ts) {
    if (!ts) return '—';
    // "2024-05-10T07:35:42+03:00" → "07:35:42"
    const mT = ts.match(/T(\d{2}:\d{2}:\d{2})/);
    if (mT) return mT[1];
    // "2024-05-10 07:35:42" → "07:35:42"
    const mS = ts.match(/ (\d{2}:\d{2}:\d{2})/);
    return mS ? mS[1] : ts;
  }

  function fmtOdd(v)   { return Number(v).toFixed(2); }
  function fmtStake(v) { return Number(v).toFixed(2); }

  // "expired 4m ago" label shown on expired cards
  function fmtExpiredAgo(ts) {
    if (!ts) return '';
    const secs = Math.floor((Date.now() - Date.parse(ts + 'Z')) / 1000);
    if (secs < 60)   return `expired ${secs}s ago`;
    if (secs < 3600) return `expired ${Math.floor(secs / 60)}m ago`;
    return `expired ${Math.floor(secs / 3600)}h ago`;
  }

  // For live arbs: count down to zero — meaningful because the 15 s disappearance
  // window means the countdown races to zero if the scanner stops detecting the arb.
  // For upcoming arbs: "expires in ~10m" is always ~10m because the scanner
  // refreshes last_seen_at every 5 s → show "seen X ago" instead, which
  // actually decreases between scanner passes and resets clearly on each upsert.
  $: seenAgoSecs = (() => {
    const lastMs = arb.last_seen_at ? Date.parse(arb.last_seen_at) : null;
    if (!lastMs) return null;
    return Math.floor(($nowMs - lastMs) / 1000);
  })();

  $: seenAgoText = (() => {
    if (seenAgoSecs === null) return '—';
    if (seenAgoSecs < 60) return `${seenAgoSecs}s ago`;
    return `${Math.floor(seenAgoSecs / 60)}m ${seenAgoSecs % 60}s ago`;
  })();

  $: expiresInSecs = (() => {
    if (expired || arb.source_type !== 'live') return null;
    const lastMs = arb.last_seen_at ? Date.parse(arb.last_seen_at) : null;
    const oddMs = arb.oldest_odd_updated_at ? Date.parse(arb.oldest_odd_updated_at) : null;
    if (!lastMs || !oddMs) return null;
    // Live expiry is whichever window hits first:
    //   - data freshness:  oldest_odd_updated_at + 45 s
    //   - disappearance:   last_seen_at + 15 s
    const lastSeenExpiry = lastMs + EXPIRY_LAST_SEEN_LIVE_S * 1000;
    const oddExpiry = oddMs + EXPIRY_LIVE_S * 1000;
    return Math.floor((Math.min(lastSeenExpiry, oddExpiry) - $nowMs) / 1000);
  })();

  $: expiresText = (() => {
    if (expiresInSecs === null) return null;
    if (expiresInSecs <= 0) return 'expiring…';
    return `${Math.max(0, expiresInSecs)}s`;
  })();

  $: isUrgent = expiresInSecs !== null && expiresInSecs <= 5;
</script>

<div
  class="arb-row"
  class:live={arb.source_type === 'live'}
  class:upcoming={arb.source_type === 'upcoming'}
  class:expired
>
  <!-- Header: teams + margin -->
  <div class="header">
    <span class="teams">{arb.canonical_home} v {arb.canonical_away}</span>
    <span class="margin">+{margin}%</span>
  </div>

  <!-- Meta: tags + kick-off -->
  <div class="meta">
    {#if arb.competition}<span class="tag">{arb.competition}</span>{/if}
    {#if arb.country}<span class="tag">{arb.country}</span>{/if}
    <span class="kick-off">{fmtTime(arb.start_time)}</span>
    {#if expired && arb.expired_at}
      <span class="expired-label">{fmtExpiredAgo(arb.expired_at)}</span>
    {/if}
  </div>

  <!-- Legs: numbered sequence — Betika @1.95, SportPesa @2.10 … -->
  <div class="legs">
    {#each arb.legs as leg, i}
      <div class="leg">
        <span class="leg-num">#{i + 1}</span>
        <span class="bookmaker">{leg.bookmaker}</span>
        <span class="outcome">{leg.outcome}</span>
        <span class="odd">@{fmtOdd(leg.odd)}</span>
        <span class="stake">
          {#if leg.fetch_url}
            <a href={leg.fetch_url} target="_blank" rel="noopener noreferrer">
              {fmtStake(leg.stake)}
            </a>
          {:else}
            {fmtStake(leg.stake)}
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <!-- Footer totals -->
  <div class="footer">
    <span>stake <strong>{arb.total_stake.toFixed(2)}</strong></span>
    <span>return <strong>{arb.guaranteed_return.toFixed(2)}</strong></span>
    <span>profit <strong>{arb.guaranteed_profit.toFixed(2)}</strong></span>
  </div>

  <!-- Freshness row -->
  {#if !expired}
    <div class="freshness">
      <span class="ts" title="oldest bookmaker odd at {fmtHms(arb.oldest_odd_updated_at)}">
        odds {fmtHms(arb.oldest_odd_updated_at)}
      </span>
      {#if arb.source_type === 'live'}
        <!-- Live: countdown to earliest of 45 s (odd age) or 15 s (disappearance) -->
        <span class="ts">seen {fmtHms(arb.last_seen_at)}</span>
        {#if expiresText !== null}
          <span class="expires" class:urgent={isUrgent}>expires {expiresText}</span>
        {/if}
      {:else}
        <!-- Upcoming: scanner refreshes every 5 s so "expires in ~10m" is always
             ~10m — show "seen X ago" which resets clearly on each upsert -->
        <span class="ts seen-ago" class:stale={seenAgoSecs !== null && seenAgoSecs > 30}>
          seen {seenAgoText}
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .arb-row {
    border: 1px solid var(--border, #e2e8f0);
    border-left: 4px solid var(--bucket-accent, #3b82f6);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--surface, #fff);
    font-size: 0.82rem;
  }

  /* Live arbs get a green left border to stand out from upcoming */
  .arb-row.live     { border-left-color: #22c55e; }
  .arb-row.expired  { opacity: 0.55; }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .teams {
    font-weight: 600;
    color: var(--text-primary, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .margin {
    font-weight: 700;
    font-size: 1rem;
    color: var(--bucket-accent, #3b82f6);
    flex-shrink: 0;
  }

  .arb-row.live .margin { color: #22c55e; }

  /* ── Meta ── */
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .tag {
    background: var(--tag-bg, #f1f5f9);
    color: var(--text-secondary, #64748b);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 0.72rem;
  }

  .kick-off {
    margin-left: auto;
    color: var(--text-tertiary, #94a3b8);
    font-size: 0.72rem;
  }

  .expired-label {
    font-size: 0.68rem;
    color: var(--color-error, #ef4444);
    font-style: italic;
  }

  /* ── Legs ── */
  .legs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--bg, #f8fafc);
    border-radius: 4px;
    padding: 6px 8px;
  }

  .leg {
    display: grid;
    /* #N  bookmaker  outcome  @odd  stake */
    grid-template-columns: 1.2rem 1fr 1fr auto auto;
    gap: 6px;
    align-items: baseline;
    font-size: 0.79rem;
    color: var(--text-secondary, #475569);
    padding: 2px 0;
    border-bottom: 1px dashed var(--border, #e2e8f0);
  }

  .leg:last-child { border-bottom: none; }

  .leg-num {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-tertiary, #94a3b8);
  }

  .bookmaker {
    font-weight: 700;
    color: var(--text-primary, #1e293b);
    text-transform: uppercase;
    font-size: 0.74rem;
    letter-spacing: 0.03em;
  }

  .outcome {
    color: var(--text-secondary, #64748b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .odd {
    font-weight: 700;
    color: var(--bucket-accent, #3b82f6);
    white-space: nowrap;
  }

  .arb-row.live .odd { color: #22c55e; }

  .stake {
    text-align: right;
    white-space: nowrap;
    color: var(--text-secondary, #64748b);
  }

  .stake a {
    color: var(--link, #3b82f6);
    text-decoration: none;
    font-weight: 600;
  }

  .stake a:hover { text-decoration: underline; }

  /* ── Footer ── */
  .footer {
    display: flex;
    gap: 14px;
    font-size: 0.72rem;
    color: var(--text-tertiary, #94a3b8);
    border-top: 1px solid var(--border, #e2e8f0);
    padding-top: 4px;
  }

  .footer strong { color: var(--text-secondary, #64748b); }

  /* ── Freshness row ── */
  .freshness {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 0.68rem;
    color: var(--text-tertiary, #94a3b8);
    border-top: 1px dashed var(--border, #e2e8f0);
    padding-top: 4px;
  }

  .ts { font-variant-numeric: tabular-nums; }
  .seen-ago.stale { color: var(--color-warning, #f59e0b); }

  .expires {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--color-success, #22c55e);
  }

  .expires.urgent {
    color: var(--color-error, #ef4444);
    font-weight: 700;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
</style>
