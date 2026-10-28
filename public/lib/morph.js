// Updates a live DOM subtree to match new HTML, changing only what differs.
//
// Re-rendering by replacing innerHTML throws away everything the browser was
// holding: scroll positions inside the page, the focused field and its text,
// half-typed input, and loaded iframes (which reload). Morphing keeps every
// node that is still there, so screens can redraw every few seconds without
// the person noticing.
//
// Nodes are matched by position, and by tag and id. Field values the person
// has typed are left alone; only their default value (the HTML attribute) is
// synced. That's deliberate: what someone is typing wins over a redraw.
// Likewise a button waiting for its confirming second tap (data-armed) is left as is.

export function morph(target, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  morphChildren(target, template.content);
}

function sameKind(a, b) {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || a.id === b.id);
}

function morphChildren(oldParent, newParent) {
  const oldNodes = [...oldParent.childNodes];
  const newNodes = [...newParent.childNodes];
  newNodes.forEach((next, i) => {
    const cur = oldNodes[i];
    if (!cur) oldParent.appendChild(next);
    else if (!sameKind(cur, next)) oldParent.replaceChild(next, cur);
    else if (cur.nodeType === Node.ELEMENT_NODE) {
      if (cur.dataset.armed) return;
      syncAttributes(cur, next);
      morphChildren(cur, next);
    } else if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue;
  });
  for (let i = oldNodes.length - 1; i >= newNodes.length; i--) oldNodes[i].remove();
}

function syncAttributes(cur, next) {
  for (const { name } of [...cur.attributes]) if (!next.hasAttribute(name)) cur.removeAttribute(name);
  for (const { name, value } of [...next.attributes]) if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
}
