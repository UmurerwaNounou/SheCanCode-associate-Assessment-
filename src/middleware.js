const crypto = require('crypto');
const db = require('./db');

const POLL_INTERVAL = 150;
const POLL_TIMEOUT = 15000;

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

  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return res.status(400).json({
      error: 'Idempotency-Key must be between 8 and 128 characters.',
      code: 'INVALID_IDEMPOTENCY_KEY',
    });
  }

  const bodyHash = hashBody(req.body);
  const requestedAt = new Date().toISOString();

  await db.read();
  const existing = db.data.keys[idempotencyKey];

  if (existing) {
    if (existing.body_hash !== bodyHash) {
      return res.status(422).json({
        error: 'Idempotency key already used for a different request body.',
        code: 'IDEMPOTENCY_KEY_MISMATCH',
      });
    }

    if (existing.status === 'IN_FLIGHT') {
      console.log(`[IDEMPOTENCY] Key "${idempotencyKey}" is IN_FLIGHT — waiting...`);
      const deadline = Date.now() + POLL_TIMEOUT;
      const result = await waitForResult(idempotencyKey, deadline);

      if (!result) {
        return res.status(503).json({
          error: 'The original request is still processing. Please retry later.',
          code: 'REQUEST_TIMEOUT',
        });
      }

      return res
        .status(result.status_code)
        .set('X-Cache-Hit', 'true')
        .set('X-Idempotency-Key', idempotencyKey)
        .json(JSON.parse(result.response));
    }

    console.log(`[IDEMPOTENCY] Key "${idempotencyKey}" already DONE — returning cache.`);
    return res
      .status(existing.status_code)
      .set('X-Cache-Hit', 'true')
      .set('X-Idempotency-Key', idempotencyKey)
      .json(JSON.parse(existing.response));
  }

  console.log(`[IDEMPOTENCY] New key "${idempotencyKey}" — processing.`);

  await db.read();
  db.data.keys[idempotencyKey] = {
    body_hash: bodyHash,
    status: 'IN_FLIGHT',
    requested_at: requestedAt,
    completed_at: null,
    status_code: null,
    response: null,
  };
  await db.write();

  const originalJson = res.json.bind(res);
  res.json = async function (body) {
    await db.read();
    db.data.keys[idempotencyKey].status = 'DONE';
    db.data.keys[idempotencyKey].status_code = res.statusCode;
    db.data.keys[idempotencyKey].response = JSON.stringify(body);
    db.data.keys[idempotencyKey].completed_at = new Date().toISOString();
    await db.write();
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyMiddleware;