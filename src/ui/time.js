import { readable } from 'svelte/store';

// Shared 1-second tick store. One interval for all subscribers.
export const nowMs = readable(Date.now(), (set) => {
  const id = setInterval(() => set(Date.now()), 1000);
  return () => clearInterval(id);
});
