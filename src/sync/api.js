export async function fetchMeta() {
  const r = await fetch('/meta');
  if (!r.ok) throw new Error(`/meta ${r.status}`);
  return r.json();
}

/**
 * fetchSnapshot — returns { cursor, bytes }.
 * The backend sends gzip Content-Encoding; the browser decompresses automatically.
 */
export async function fetchSnapshot(bucket) {
  const r = await fetch(`/snapshot/${bucket}`);
  if (!r.ok) throw new Error(`/snapshot/${bucket} ${r.status}`);
  const cursor = parseInt(r.headers.get('X-Cursor'), 10);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { cursor, bytes };
}

/**
 * openStream — opens an SSE connection and wires the three event types.
 * Returns the EventSource so the caller can close it on snapshot_stale.
 *
 * @param {string}   bucket
 * @param {number}   cursor
 * @param {object}   handlers  { onUpsert, onDelete, onStale }
 */
export function openStream(bucket, cursor, { onUpsert, onDelete, onStale }) {
  const es = new EventSource(`/stream/${bucket}?cursor=${cursor}`);

  es.addEventListener('upsert', (e) => onUpsert(JSON.parse(e.data)));
  es.addEventListener('delete', (e) => onDelete(JSON.parse(e.data)));
  es.addEventListener('snapshot_stale', (e) => {
    es.close();
    onStale(JSON.parse(e.data));
  });

  es.onerror = (e) => console.warn('[sse] connection error', e);

  return es;
}
