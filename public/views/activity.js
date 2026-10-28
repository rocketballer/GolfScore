// Activity: the group chat.
import { html } from '../lib/html.js';
import { $, ago, local, toast } from '../lib/util.js';
import { api, app, isOrganizer, myPlayer, patchData, refresh } from '../state.js';

const chatName = () => myPlayer()?.name || local.get('chatName', '');

function messages() {
  const name = chatName();
  if (!app.data.chat.length) return html`<div class="chat" id="chat"><p class="empty">No messages yet. Say hi to the group, talk trash, or post a rules question for the organizer.</p></div>`;
  return html`<div class="chat" id="chat">${app.data.chat.map((m) => html`
    <div class="msg ${m.name === name && 'mine'}"><div class="meta"><b>${m.name}</b>
      <span>${ago(m.at)}${isOrganizer() && html` · <button class="link-btn inherit" data-action="chat-delete" data-id="${m.id}">delete</button>`}</span></div>
      <div class="text">${m.text}</div></div>`)}</div>`;
}

function render() {
  return html`${messages()}
    <form class="composer" data-action="chat-send">
      ${!chatName() && html`<input class="input chat-name" name="name" placeholder="Your name" maxlength="40" aria-label="Your name">`}
      <textarea name="text" rows="1" maxlength="500" placeholder="Message the group" aria-label="Message" data-action="chat-grow"></textarea>
      <button class="btn btn-primary" type="submit">Send</button>
    </form>`;
}

let scrolledDown = false;
const scrollToNewest = () => { if (!scrolledDown) { window.scrollTo(0, document.body.scrollHeight); scrolledDown = true; } };

export default {
  render,
  mounted: scrollToNewest,
  leave: () => { scrolledDown = false; },
  /** While someone types, refresh only the messages so the draft survives. */
  whileTyping: () => { $('#chat').outerHTML = String(messages()); },
  actions: {
    'chat-grow': (_, el) => { el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px'; },
    'chat-send': async (_, form) => {
      const name = form.elements.name ? form.elements.name.value.trim() : chatName();
      const text = form.elements.text.value.trim();
      if (!name) { toast('Add your name first'); form.elements.name?.focus(); return; }
      if (!text) return;
      if (form.elements.name) local.set('chatName', name);
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const out = await api('chat', { name, text });
        form.elements.text.value = '';
        form.elements.text.blur();
        scrolledDown = false;
        patchData({ chat: out.chat });
      } catch (e) { toast(e.message); }
      button.disabled = false;
    },
    'chat-delete': async ({ id }) => {
      try { await api('admin/chat-delete', { id }); refresh(); } catch (e) { toast(e.message); }
    },
  },
};
