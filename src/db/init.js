import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let _sqlite3 = null;

export async function createSQLiteAPI() {
  if (_sqlite3) return _sqlite3;
  _sqlite3 = await sqlite3InitModule({
    print: () => {},
    printErr: console.error,
    // Resolve wasm + worker assets relative to the document URL.
    // In production (/app/index.html) this becomes /app/sqlite-wasm/*.
    // Under file:// it resolves to dist/web/sqlite-wasm/* — same directory.
    locateFile: (name) => `./sqlite-wasm/${name}`,
  });
  return _sqlite3;
}
