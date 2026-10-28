import { getStore } from '@netlify/blobs';
import { handle } from './lib/core.mjs';

export default async (req) => {
  const blobs = getStore({ name: 'fighter-invitational', consistency: 'strong' });
  const store = {
    getJSON: (key) => blobs.get(key, { type: 'json' }),
    setJSON: (key, value) => blobs.setJSON(key, value),
  };
  return handle(req, store, { ADMIN_PIN: process.env.ADMIN_PIN });
};

export const config = { path: '/api/*' };
