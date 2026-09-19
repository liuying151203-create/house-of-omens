import { DurableObject } from 'cloudflare:workers';

const WINDOW_MS = 60_000;
const LIMITS = Object.freeze({
  create: 8,
  join: 30,
});

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export class RemoteRateLimiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rate_buckets (
      action TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL
    )`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/internal/check')
      return json({ error: '接口不存在。', code: 'not_found' }, 404);

    let input;
    try {
      input = await request.json();
    } catch {
      return json({ error: '请求格式不正确。', code: 'invalid_request' }, 400);
    }
    const action = input?.action,
      limit = LIMITS[action];
    if (!limit)
      return json({ error: '限流类别无效。', code: 'invalid_request' }, 400);

    const now = Date.now(),
      previous = this.sql
        .exec(
          `SELECT window_started_at, request_count
          FROM rate_buckets WHERE action = ?`,
          action,
        )
        .toArray()[0],
      newWindow = !previous || now - previous.window_started_at >= WINDOW_MS,
      windowStartedAt = newWindow ? now : previous.window_started_at,
      requestCount = newWindow ? 1 : previous.request_count + 1,
      retryAfter = Math.max(
        1,
        Math.ceil((windowStartedAt + WINDOW_MS - now) / 1000),
      );

    this.sql.exec(
      `INSERT INTO rate_buckets (action, window_started_at, request_count)
      VALUES (?, ?, ?)
      ON CONFLICT (action) DO UPDATE SET
        window_started_at = excluded.window_started_at,
        request_count = excluded.request_count`,
      action,
      windowStartedAt,
      requestCount,
    );
    await this.ctx.storage.setAlarm(windowStartedAt + WINDOW_MS);

    if (requestCount > limit)
      return json(
        { error: '请求过于频繁，请稍后重试。', code: 'rate_limited' },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    return json({ allowed: true, remaining: limit - requestCount });
  }

  alarm() {
    this.sql.exec(
      'DELETE FROM rate_buckets WHERE window_started_at <= ?',
      Date.now() - WINDOW_MS,
    );
  }
}
