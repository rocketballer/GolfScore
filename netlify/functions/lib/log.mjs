// A "newest entry wins" record stored as one tiny blob per change, with the
// data in the key itself:
//
//   <root>/<group>/<item>/<stamp>.<payload>     e.g.  s/t3/7/0mhb2k1xq-a81f.4.2.U2xhdGVy
//
// Each save writes a brand-new key, so two people saving at the same moment
// can never overwrite each other (the storage service doesn't offer a fully
// reliable "only save if unchanged", so we avoid needing one). Reading all
// current values is a single list call; for each item the newest stamp wins.
// Superseded entries are deleted after each save to keep the list short.
//
// Payloads must not contain "/" (they are part of the key); keep them short.

// Strictly increasing within one server instance, so back-to-back saves keep their order.
let lastTime = 0;
function stamp() {
  lastTime = Math.max(Date.now(), lastTime + 1);
  return lastTime.toString(36).padStart(9, '0') + '-' + Math.random().toString(36).slice(2, 6);
}
const stampTime = (st) => new Date(parseInt(st.split('-')[0], 36)).toISOString();

export function createLog(kv, root) {
  const parse = (key) => {
    const [, group, item, entry] = key.split('/');
    const dot = entry.indexOf('.');
    return { key, group, item, stamp: entry.slice(0, dot), payload: entry.slice(dot + 1) };
  };

  return {
    /** Records `payload` as the newest value for (group, item). */
    async put(group, item, payload) {
      const st = stamp();
      await kv.write(`${root}/${group}/${item}/${st}.${payload}`, {});
      const older = (await kv.list(`${root}/${group}/${item}/`)).map(parse).filter((e) => e.stamp < st);
      await Promise.all(older.map((e) => kv.remove(e.key).catch(() => {})));
    },

    /**
     * The newest entry for every item, as { group: { item: { payload, at } } }.
     * Pass a group to read just that group.
     */
    async latest(group) {
      const keys = await kv.list(group ? `${root}/${group}/` : `${root}/`);
      const out = {};
      for (const e of keys.map(parse)) {
        const g = (out[e.group] ||= {});
        if (!g[e.item] || g[e.item].stamp < e.stamp) g[e.item] = { stamp: e.stamp, payload: e.payload, at: stampTime(e.stamp) };
      }
      return out;
    },

    /** Deletes every entry in a group (or everything when no group is given). */
    async clear(group) {
      const keys = await kv.list(group ? `${root}/${group}/` : `${root}/`);
      await Promise.all(keys.map((k) => kv.remove(k)));
    },
  };
}
