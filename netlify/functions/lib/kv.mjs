// Key-value adapters. Each one stores JSON values and supports
// "write only if nobody changed it since I read it" through a version tag.
//
//   read(key)                 -> { value, tag } or null
//   write(key, value)         -> unconditional write
//   writeIf(key, value, tag)  -> true if written; false if the key changed since `tag`
//                                (tag null means "only if the key doesn't exist yet")

/** Netlify Blobs store (from getStore). */
export function blobsKV(store) {
  return {
    async read(key) {
      const r = await store.getWithMetadata(key, { type: 'json' });
      return r ? { value: r.data, tag: r.etag } : null;
    },
    async write(key, value) { await store.setJSON(key, value); },
    async writeIf(key, value, tag) {
      // Use set(), not setJSON(): in @netlify/blobs 10.3.0 setJSON() drops the
      // onlyIfMatch/onlyIfNew condition and always overwrites.
      const r = await store.set(key, JSON.stringify(value), tag ? { onlyIfMatch: tag } : { onlyIfNew: true });
      return r.modified;
    },
  };
}

/** In-memory store for local development and tests. */
export function memoryKV() {
  const m = new Map();
  let version = 0;
  return {
    async read(key) {
      const e = m.get(key);
      return e ? { value: structuredClone(e.value), tag: e.tag } : null;
    },
    async write(key, value) { m.set(key, { value: structuredClone(value), tag: String(++version) }); },
    async writeIf(key, value, tag) {
      const cur = m.get(key);
      if ((cur?.tag ?? null) !== (tag ?? null)) return false;
      m.set(key, { value: structuredClone(value), tag: String(++version) });
      return true;
    },
  };
}
