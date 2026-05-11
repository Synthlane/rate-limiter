const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new Error('POSTGRES_URL is not set');
}

const pool = new Pool({
  connectionString: postgresUrl,
});

async function setupTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id UUID PRIMARY KEY,
      client_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      allowed BOOLEAN NOT NULL,
      tokens_left INTEGER NOT NULL,
      retries INTEGER NOT NULL,
      is_race BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await pool.query(query);
}

async function saveEvent({
  clientId,
  workerId,
  requestId,
  allowed,
  tokensLeft,
  retries,
  isRace,
}) {
  const query = `
    INSERT INTO rate_limit_events (
      id,
      client_id,
      worker_id,
      request_id,
      allowed,
      tokens_left,
      retries,
      is_race,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
  `;

  const values = [
    uuidv4(),
    clientId,
    workerId,
    requestId,
    Boolean(allowed),
    Number(tokensLeft),
    Number(retries),
    Boolean(isRace),
  ];

  await pool.query(query, values);
}

async function getEvents(limit = 100) {
  const query = `
    SELECT
      id,
      client_id,
      worker_id,
      request_id,
      allowed,
      tokens_left,
      retries,
      is_race,
      created_at
    FROM rate_limit_events
    ORDER BY created_at DESC
    LIMIT $1
  `;
  const result = await pool.query(query, [Number(limit)]);
  return result.rows;
}

async function getMetrics() {
  const query = `
    SELECT
      COUNT(*)::INT AS total_requests,
      SUM(CASE WHEN allowed THEN 1 ELSE 0 END)::INT AS allowed_requests,
      SUM(CASE WHEN NOT allowed THEN 1 ELSE 0 END)::INT AS denied_requests,
      SUM(CASE WHEN is_race THEN 1 ELSE 0 END)::INT AS race_requests,
      AVG(tokens_left)::FLOAT8 AS avg_tokens_left
    FROM rate_limit_events
  `;
  const result = await pool.query(query);
  return result.rows[0] || {
    total_requests: 0,
    allowed_requests: 0,
    denied_requests: 0,
    race_requests: 0,
    avg_tokens_left: 0,
  };
}

async function disconnect() {
  await pool.end();
}

module.exports = {
  setupTable,
  saveEvent,
  getEvents,
  getMetrics,
  disconnect,
};
