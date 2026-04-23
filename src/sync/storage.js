/**
 * detectVFS — returns the appropriate VFS name for the current environment.
 * OPFS requires SharedArrayBuffer (COOP+COEP headers) and sqlite3.opfs support.
 * The Firefox MV2 background page always passes sqlite3 without OPFS, so it
 * falls through to 'memory' automatically.
 */
export function detectVFS(sqlite3) {
  if (sqlite3.opfs && typeof SharedArrayBuffer !== 'undefined') return 'opfs';
  return 'memory';
}

/**
 * openDB — open a database with the given VFS, returning a thin wrapper
 * that exposes exec / selectObjects / changes / deserialize / close.
 *
 * After deserialize() is called the database is effectively in-memory
 * regardless of which VFS was used to open it — sqlite3_deserialize
 * replaces the pager with the snapshot buffer.  The VFS choice mainly
 * determines whether the initial open attempts OPFS-backed storage.
 */
export function openDB(sqlite3, name, vfs) {
  let rawDb;
  try {
    if (vfs === 'opfs' && sqlite3.oo1.OpfsDb) {
      rawDb = new sqlite3.oo1.OpfsDb(`/${name}`);
    } else {
      rawDb = new sqlite3.oo1.DB(':memory:', 'ct');
    }
  } catch {
    rawDb = new sqlite3.oo1.DB(':memory:', 'ct');
  }

  return {
    exec(sql, params) {
      rawDb.exec({ sql, bind: params });
    },

    selectObjects(sql, params) {
      const rows = [];
      rawDb.exec({ sql, bind: params, rowMode: 'object', callback: (r) => rows.push({ ...r }) });
      return rows;
    },

    changes() {
      return sqlite3.capi.sqlite3_changes(rawDb.pointer);
    },

    deserialize(bytes) {
      const p = sqlite3.wasm.allocFromTypedArray(bytes);
      const FREEONCLOSE = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE ?? 1;
      const RESIZEABLE  = sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE  ?? 2;
      const rc = sqlite3.capi.sqlite3_deserialize(
        rawDb.pointer, 'main', p, bytes.length, bytes.length,
        FREEONCLOSE | RESIZEABLE,
      );
      if (rc !== (sqlite3.capi.SQLITE_OK ?? 0)) {
        throw new Error(`sqlite3_deserialize failed (rc=${rc})`);
      }
    },

    close() {
      rawDb.close();
    },
  };
}
