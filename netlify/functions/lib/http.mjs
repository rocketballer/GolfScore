/** An error whose message is safe to show to the person who made the request. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const badRequest = (message) => new HttpError(400, message);

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
