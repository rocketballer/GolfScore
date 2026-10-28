// Safe-by-default HTML templates.
//
//   html`<b>${name}</b>`   escapes `name`, so user text can never become markup.
//   Nested html`` results and arrays of them are inserted as-is.
//   raw(str) marks a string as trusted markup (use only for constants).
//   null, undefined, true and false render as nothing, so `${cond && html`...`}` works.

class Html {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function piece(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Html) return v.text;
  if (Array.isArray(v)) return v.map(piece).join('');
  return escape(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += piece(v) + strings[i + 1]; });
  return new Html(out);
}

export const raw = (s) => new Html(String(s));
