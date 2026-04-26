<script>
  import { onDestroy } from 'svelte';

  // conn: { low: 'connecting'|'live'|'error', mid: ..., high: ..., moon: ... }
  // lastUpdate: { low: Date|null, mid: ..., high: ..., moon: ... }
  export let conn = {};
  export let lastUpdate = {};
  export let activeBucket = 'low';
  export let count = 0;

  let now = Date.now();
  const tick = setInterval(() => { now = Date.now(); }, 10_000);
  onDestroy(() => clearInterval(tick));

  $: agoText = (() => {
    const ts = lastUpdate[activeBucket];
    if (!ts) return '—';
    const secs = Math.floor((now - ts) / 1000);
    if (secs < 60)  return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  })();

  $: status = conn[activeBucket] ?? 'connecting';
</script>

<div class="status-bar">
  <span class="dot {status}" title={status}></span>
  <span class="bucket-label">{activeBucket}</span>
  <span class="count">{count} arb{count !== 1 ? 's' : ''}</span>
  <span class="updated">updated {agoText}</span>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
    border-bottom: 1px solid var(--border, #e2e8f0);
    background: var(--surface, #fff);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot.connecting { background: var(--color-warning, #f59e0b); }
  .dot.live       { background: var(--color-success, #22c55e); }
  .dot.error      { background: var(--color-error,   #ef4444); }

  .bucket-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--bucket-accent, var(--text-primary, #1e293b));
  }

  .count { margin-left: auto; }
  .updated { color: var(--text-tertiary, #aaa); }
</style>
