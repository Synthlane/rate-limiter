# rate-limiter

Distributed token-bucket rate limiter demo: **Redis** for shared state (with a Lua script for atomic decrements) and **PostgreSQL** for an audit trail of consume attempts.

## Requirements

- Node.js 18+
- Redis (TLS URL supported, e.g. Upstash with `rediss://`)
- PostgreSQL (e.g. Neon)

## Setup

1. Copy environment template and fill in real URLs:

   ```bash
   cp .env.example .env
   ```

2. Set `REDIS_URL` to a TLS URL when your provider requires it (Upstash: `rediss://default:<token>@<host>:6379`).

3. Set `POSTGRES_URL` (Neon typically includes `?sslmode=require`).

4. Install and run the race test:

   ```bash
   npm install
   npm run test:race
   ```

## Layout

- `core/bucket.js` — `TokenBucket` (init, unsafe vs atomic consume)
- `core/consume.lua` — atomic token decrement in Redis
- `core/db.js` — `rate_limit_events` table helpers
- `tests/test_race.js` — concurrent requests demonstrating the race and the fix

## Scripts

| Script        | Description                                      |
| ------------- | ------------------------------------------------ |
| `npm start`   | Same as `test:race`                              |
| `npm run test:race` | Unsafe then atomic consume rounds + DB events |
| `npm run test:chaos` | Same as `test:race` for now                    |

## Security

Do not commit `.env`; keep secrets in a vault or CI secrets store in production.
