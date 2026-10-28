// Chat: the group chat.
import { html } from '../lib/html.js';
import { ago, confirmTap, local, toast } from '../lib/util.js';
import { api, app, isOrganizer, myPlayer, patchData, refresh, rerender } from '../state.js';

// Players post under their own name; spectators choose one (kept on this phone).
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
  const name = chatName();
  return html`${messages()}
    <form class="composer" data-action="chat-send">
      <div class="composer-who small muted">${name
        ? html`Posting as <b>${name}</b>${!myPlayer() && html` · <button type="button" class="link-btn" data-action="chat-rename">change</button>`}`
        : html`<input class="input" name="name" placeholder="Your name" maxlength="40" aria-label="Your name" data-action="chat-name-draft" value="${app.ui.chatNameDraft}">`}</div>
      <div class="row composer-row">
        <textarea class="grow" name="text" rows="2" maxlength="500" placeholder="Message the group" aria-label="Message" data-action="chat-draft">${app.ui.chatDraft}</textarea>
        <button class="btn btn-primary" type="submit">Send</button>
      </div>
    </form>`;
}

let scrolledDown = false;
const scrollToNewest = () => { if (!scrolledDown) { window.scrollTo(0, document.body.scrollHeight); scrolledDown = true; } };

export default {
  render,
  mounted: scrollToNewest,
  leave: () => { scrolledDown = false; },
  actions: {
    // Keep the unsent message if the person switches tabs.
    'chat-draft': (_, el) => { app.ui.chatDraft = el.value; },
    'chat-name-draft': (_, el) => { app.ui.chatNameDraft = el.value; },
    'chat-rename': () => { local.set('chatName', null); rerender(); },
    'chat-send': async (_, form) => {
      const name = form.elements.name ? form.elements.name.value.trim() : chatName();
      const text = form.elements.text.value.trim();
      if (!name) { toast('Add your name first'); form.elements.name?.focus(); return; }
      if (!text) return;
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const out = await api('chat', { name, text });
        if (form.elements.name) { local.set('chatName', out.name); app.ui.chatNameDraft = ''; }
        form.elements.text.value = '';
        app.ui.chatDraft = '';
        form.elements.text.blur();
        scrolledDown = false;
        patchData({ chat: out.chat });
      } catch (e) { toast(e.message); }
      button.disabled = false;
    },
    'chat-delete': (_, el) => confirmTap(el, async () => {
      try { await api('admin/chat-delete', { id: el.dataset.id }); toast('Message deleted'); refresh(); } catch (e) { toast(e.message); }
    }),
  },
};
