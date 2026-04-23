<script>
  import { createEventDispatcher } from 'svelte';

  // counts: { low: number, mid: number, high: number, moon: number }
  export let counts = { low: 0, mid: 0, high: 0, moon: 0 };
  export let active = 'low';

  const dispatch = createEventDispatcher();

  const BUCKETS = [
    { id: 'low',  label: 'Low',  range: '3–5%' },
    { id: 'mid',  label: 'Mid',  range: '5–8%' },
    { id: 'high', label: 'High', range: '8–15%' },
    { id: 'moon', label: 'Moon', range: '≥15%' },
  ];

  function select(id) {
    active = id;
    dispatch('select', id);
  }
</script>

<div class="bucket-tabs" role="tablist">
  {#each BUCKETS as b}
    <button
      role="tab"
      class="tab {b.id}"
      class:active={active === b.id}
      aria-selected={active === b.id}
      on:click={() => select(b.id)}
    >
      <span class="label">{b.label}</span>
      <span class="range">{b.range}</span>
      {#if counts[b.id] > 0}
        <span class="badge">{counts[b.id]}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  div.bucket-tabs {
    display: flex;
    border-bottom: 2px solid var(--border, #e2e8f0);
    background: var(--surface, #fff);
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border: none;
    background: none;
    cursor: pointer;
    position: relative;
    color: var(--text-secondary, #64748b);
    font-size: 0.78rem;
    transition: color 0.15s;
  }

  .tab::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0; right: 0;
    height: 2px;
    background: transparent;
    transition: background 0.15s;
  }

  .tab.active { color: var(--bucket-accent-tab, var(--text-primary, #1e293b)); }
  .tab.active::after { background: var(--bucket-accent-tab, #3b82f6); }

  .tab.low  { --bucket-accent-tab: var(--color-low,  #3b82f6); }
  .tab.mid  { --bucket-accent-tab: var(--color-mid,  #8b5cf6); }
  .tab.high { --bucket-accent-tab: var(--color-high, #f59e0b); }
  .tab.moon { --bucket-accent-tab: var(--color-moon, #ef4444); }

  .label { font-weight: 600; }
  .range { font-size: 0.68rem; opacity: 0.7; }

  .badge {
    position: absolute;
    top: 4px;
    right: 6px;
    background: var(--bucket-accent-tab, #3b82f6);
    color: #fff;
    border-radius: 10px;
    padding: 0 5px;
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1.5;
  }
</style>
