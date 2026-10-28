// Checks that run without a browser: HTML escaping and action wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { html, raw } from '../public/lib/html.js';

test('html escapes interpolated text by default', () => {
  const name = '<img src=x onerror=alert(1)>"\'&';
  assert.equal(String(html`<b>${name}</b>`), '<b>&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;</b>');
  assert.equal(String(html`<p title="${'a"b'}">x</p>`), '<p title="a&quot;b">x</p>');
});

test('html nests fragments, joins arrays and skips empty values', () => {
  const items = ['a', '<b>'].map((x) => html`<li>${x}</li>`);
  assert.equal(String(html`<ul>${items}</ul>`), '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  assert.equal(String(html`${false}${null}${undefined}${true}|${0}`), '|0');
  assert.equal(String(html`${raw('<hr>')}`), '<hr>');
});

test('every data-action in the UI has exactly one handler', async () => {
  const modules = ['chrome', 'sheets', 'score-entry', 'home', 'players', 'leaderboard', 'team', 'schedule', 'chat', 'admin'];
  const handlers = new Map();
  for (const m of modules) {
    const mod = await import(`../public/views/${m}.js`);
    const actions = mod.actions || mod.default?.actions || {};
    for (const name of Object.keys(actions)) {
      // leaderboard re-exports the games and recap actions it hosts
      if (handlers.has(name) && m !== 'leaderboard') assert.fail(`"${name}" is handled in both ${handlers.get(name)} and ${m}`);
      if (!handlers.has(name)) handlers.set(name, m);
    }
  }
  const sources = ['public/index.html', ...readdirSync('public/views').map((f) => `public/views/${f}`)];
  const used = new Set(sources.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/data-action="([a-z-]+)"/g)].map((m) => m[1])));
  for (const name of ['lb-mode', 'lb-net']) used.add(name); // built by a helper in leaderboard.js
  for (const name of used) assert.ok(handlers.has(name), `no handler for data-action="${name}"`);
  for (const name of handlers.keys()) assert.ok(used.has(name), `handler "${name}" is never used`);
});
