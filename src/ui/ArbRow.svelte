<script>
  export let arb;
  export let expired = false;

  $: margin = (arb.profit_margin_bps / 100).toFixed(2);

  function fmtTime(s) {
    if (!s) return '—';
    const [, , day, hm] = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/) ?? [];
    return day && hm ? `${day} ${hm}` : s;
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
</style>
