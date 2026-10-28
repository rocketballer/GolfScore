import { getStore } from '@netlify/blobs';
import { handle } from './lib/core.mjs';
import { blobsKV } from './lib/kv.mjs';
import { createRepo } from './lib/repo.mjs';
import { TOURNAMENT } from './lib/seed.mjs';

export default async (req, context) => {
  const repo = createRepo(blobsKV(getStore({ name: TOURNAMENT.id, consistency: 'strong' })));
  return handle(req, { repo, adminPin: process.env.ADMIN_PIN, clientIp: context?.ip });
};

export const config = { path: '/api/*' };
