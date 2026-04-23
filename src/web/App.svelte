<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { boot } from '@sync/protocol.js';
  import { liveArbs, expiredArbs } from '@db/queries.js';
  import { applyTheme } from '@ui/theme.js';
  import BucketTabs from '@ui/BucketTabs.svelte';
  import StatusBar from '@ui/StatusBar.svelte';
  import ArbTable from '@ui/ArbTable.svelte';

  const BUCKETS = ['low', 'mid', 'high', 'moon'];

  const low  = writable([]);
  const mid  = writable([]);
  const high = writable([]);
  const moon = writable([]);

  const lowExp  = writable([]);
  const midExp  = writable([]);
  const highExp = writable([]);
  const moonExp = writable([]);

  const stores    = { low, mid, high, moon };
  const expStores = { low: lowExp, mid: midExp, high: highExp, moon: moonExp };

  let activeBucket = 'low';
  let conn = { low: 'connecting', mid: 'connecting', high: 'connecting', moon: 'connecting' };
  let lastUpdate = { low: null, mid: null, high: null, moon: null };

  $: counts = { low: $low.length, mid: $mid.length, high: $high.length, moon: $moon.length };

  $: activeArbs = activeBucket === 'low'  ? $low
                : activeBucket === 'mid'  ? $mid
                : activeBucket === 'high' ? $high
                : $moon;

  $: activeExpired = activeBucket === 'low'  ? $lowExp
                   : activeBucket === 'mid'  ? $midExp
                   : activeBucket === 'high' ? $highExp
                   : $moonExp;

  function onUpdate(bucket, db) {
    stores[bucket].set(liveArbs(db));
    expStores[bucket].set(expiredArbs(db));
    conn = { ...conn, [bucket]: 'live' };
    lastUpdate = { ...lastUpdate, [bucket]: Date.now() };
  }

  onMount(() => {
    applyTheme();
    for (const b of BUCKETS) {
      boot(b, (db) => onUpdate(b, db)).catch((err) => {
        console.error(`[App] boot failed for ${b}:`, err);
        conn = { ...conn, [b]: 'error' };
      });
    }
  });
</script>

<div class="app">
  <BucketTabs {counts} active={activeBucket} on:select={(e) => activeBucket = e.detail} />
  <StatusBar
    {conn}
    {lastUpdate}
    activeBucket={activeBucket}
    count={activeArbs.length}
  />
  <ArbTable arbs={activeArbs} expired={activeExpired} bucket={activeBucket} />
</div>

<style>
  :global(*) { box-sizing: border-box; margin: 0; padding: 0; }

  :global(:root) {
    --color-low:  #3b82f6;
    --color-mid:  #8b5cf6;
    --color-high: #f59e0b;
    --color-moon: #ef4444;

    --color-success: #22c55e;
    --color-warning: #f59e0b;
    --color-error:   #ef4444;

    --text-primary:   #1e293b;
    --text-secondary: #64748b;
    --text-tertiary:  #94a3b8;
    --border:         #e2e8f0;
    --surface:        #ffffff;
    --bg:             #f8fafc;
    --tag-bg:         #f1f5f9;
    --link:           #3b82f6;
  }

  :global(.dark) {
    --text-primary:   #f1f5f9;
    --text-secondary: #94a3b8;
    --text-tertiary:  #64748b;
    --border:         #334155;
    --surface:        #1e293b;
    --bg:             #0f172a;
    --tag-bg:         #334155;
    --link:           #60a5fa;
  }

  :global(body) {
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text-primary);
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    max-width: 600px;
    margin: 0 auto;
  }
</style>
