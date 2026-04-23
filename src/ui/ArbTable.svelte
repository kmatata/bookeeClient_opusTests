<script>
  import ArbRow from './ArbRow.svelte';

  export let arbs    = [];   // active (non-expired) rows
  export let expired = [];   // expired rows (shown for 3 h)
  export let bucket  = 'low';

  $: liveSection     = arbs.filter(a => a.source_type === 'live');
  $: upcomingSection = arbs.filter(a => a.source_type === 'upcoming');
</script>

<div class="arb-table" style="--bucket-accent: var(--color-{bucket}, #3b82f6)">

  {#if arbs.length === 0 && expired.length === 0}
    <!-- Empty state -->
    <div class="empty">
      <p>No arbitrage opportunities in <strong>{bucket}</strong> right now.</p>
      <p class="hint">New opportunities appear as soon as the ETL detects them.</p>
    </div>

  {:else}
    <div class="list">

      <!-- ── LIVE ── -->
      {#if liveSection.length > 0}
        <div class="section-head live-head">
          <span class="dot-live"></span> Live
          <span class="section-count">{liveSection.length}</span>
        </div>
        {#each liveSection as arb (arb.id)}
          <ArbRow {arb} />
        {/each}
      {/if}

      <!-- ── UPCOMING ── -->
      {#if upcomingSection.length > 0}
        <div class="section-head upcoming-head">
          Upcoming
          <span class="section-count">{upcomingSection.length}</span>
        </div>
        {#each upcomingSection as arb (arb.id)}
          <ArbRow {arb} />
        {/each}
      {/if}

      <!-- ── EXPIRED (testing — shown for 3 h) ── -->
      {#if expired.length > 0}
        <div class="section-head expired-head">
          Expired
          <span class="section-count">{expired.length}</span>
          <span class="expired-note">kept for 3 h</span>
        </div>
        {#each expired as arb (arb.id)}
          <ArbRow {arb} expired={true} />
        {/each}
      {/if}

    </div>
  {/if}

</div>

<style>
  .arb-table {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px;
    background: var(--bg, #f8fafc);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ── Section headers ── */
  .section-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 2px;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-tertiary, #94a3b8);
    border-bottom: 1px solid var(--border, #e2e8f0);
    margin-top: 4px;
  }

  .section-head:first-child { margin-top: 0; }

  .live-head     { color: #22c55e; border-color: #22c55e44; }
  .upcoming-head { color: var(--text-secondary, #64748b); }
  .expired-head  { color: var(--text-tertiary, #94a3b8); }

  .dot-live {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
  }

  .section-count {
    background: var(--tag-bg, #f1f5f9);
    border-radius: 10px;
    padding: 0 6px;
    font-size: 0.68rem;
    color: var(--text-secondary, #64748b);
  }

  .expired-note {
    margin-left: auto;
    font-size: 0.65rem;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-tertiary, #94a3b8);
    font-style: italic;
  }

  /* ── Empty state ── */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    gap: 6px;
    color: var(--text-secondary, #64748b);
    text-align: center;
  }

  .empty p { margin: 0; }
  .empty .hint { font-size: 0.78rem; color: var(--text-tertiary, #94a3b8); }
</style>
