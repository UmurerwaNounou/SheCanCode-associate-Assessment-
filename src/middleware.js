const crypto = require('crypto');
const db = require('./db');

const POLL_INTERVAL = 200;
const POLL_TIMEOUT = 10000;

function hashBody(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForResult(key, deadline) {
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    await db.read();
    const record = db.data.keys[key];
    if (record && record.status === 'DONE') return record;
  }
  return null;
}

async function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) return next();

  const bodyHash = hashBody(req.body);

  await db.read();
  const existing = db.data.keys[idempotencyKey];

  if (existing) {
    if (existing.body_hash !== bodyHash) {
      return res.status(422).json({
        error: 'Idempotency key already used for a different request body.',
      });
    }

    if (existing.status === 'IN_FLIGHT') {
      const deadline = Date.now() + POLL_TIMEOUT;
      const result = await waitForResult(idempotencyKey, deadline);
      if (!result) {
        return res.status(503).json({ error: 'Upstream request timed out.' });
      }
      return res
        .status(result.status_code)
        .set('X-Cache-Hit', 'true')
        .json(JSON.parse(result.response));
    }

    return res
      .status(existing.status_code)
      .set('X-Cache-Hit', 'true')
      .json(JSON.parse(existing.response));
  }

  await db.read();
  db.data.keys[idempotencyKey] = {
    body_hash: bodyHash,
    status: 'IN_FLIGHT',
    created_at: new Date().toISOString(),
  };
  await db.write();

  const originalJson = res.json.bind(res);
  res.json = async function (body) {
    await db.read();
    db.data.keys[idempotencyKey].status = 'DONE';
    db.data.keys[idempotencyKey].status_code = res.statusCode;
    db.data.keys[idempotencyKey].response = JSON.stringify(body);
    await db.write();
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyMiddleware;