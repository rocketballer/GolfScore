// Turns an HTTP request into a call to one entry in the route table.
// Knows about URLs, JSON, the organizer PIN and errors; nothing about golf.
import { timingSafeEqual, createHash } from 'node:crypto';
import { routes } from './routes.mjs';
import { ConflictError } from './repo.mjs';
import { HttpError, json } from './http.mjs';

const MAX_WRONG_PINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const digest = (s) => createHash('sha256').update(String(s)).digest();
const samePin = (a, b) => timingSafeEqual(digest(a), digest(b));

/**
 * Answers whether this request comes from the organizer.
 * A request that sends a PIN must send the right one: a wrong PIN is an
 * error on every route, and too many wrong PINs lock that address out.
 */
async function checkPin(req, { repo, adminPin, clientIp }) {
  const sent = req.headers.get('x-admin-pin');
  if (sent === null) return false;
  if (!adminPin) throw new HttpError(503, 'Organizer PIN is not set up on the server.');

  const ip = clientIp || 'unknown';
  const now = Date.now();
  let record = await repo.getFailures(ip);
  if (now - record.since > LOCKOUT_MS) record = { count: 0, since: now };
  if (record.count >= MAX_WRONG_PINS) {
    const mins = Math.ceil((record.since + LOCKOUT_MS - now) / 60000);
    throw new HttpError(429, `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  if (samePin(sent, adminPin)) {
    if (record.count) await repo.saveFailures(ip, { count: 0, since: now });
    return true;
  }
  await repo.saveFailures(ip, { count: record.count + 1, since: record.since || now });
  throw new HttpError(401, 'Wrong organizer PIN.');
}

/**
 * @param {Request} req
 * @param {{ repo: ReturnType<import('./repo.mjs').createRepo>, adminPin?: string, clientIp?: string }} ctx
 */
export async function handle(req, ctx) {
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const route = routes[`${req.method.toUpperCase()} ${path}`];
  if (!route) return json(404, { error: 'Not found' });

  try {
    const organizer = await checkPin(req, ctx);
    if (route.access === 'organizer' && !organizer) {
      throw ctx.adminPin ? new HttpError(401, 'Organizer PIN required.') : new HttpError(503, 'Organizer PIN is not set up on the server.');
    }
    let body = {};
    if (req.method.toUpperCase() !== 'GET') {
      try { body = (await req.json()) ?? {}; } catch { throw new HttpError(400, 'Send a JSON body.'); }
      if (typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send a JSON object.');
    }
    return json(200, await route.run({ body, repo: ctx.repo, organizer }));
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    if (e instanceof ConflictError) return json(409, { error: 'Lots of people are saving at once. Try again.' });
    console.error(e);
    return json(500, { error: 'Something went wrong on the server. Try again.' });
  }
}
