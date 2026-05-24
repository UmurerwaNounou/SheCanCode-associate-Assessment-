const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./db');
const idempotencyMiddleware = require('./middleware');

const app = express();

app.use(express.json());

// Serve the HTML tester page
app.use(express.static(path.join(__dirname, '../public')));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const cached = res.getHeader('X-Cache-Hit') ? ' [CACHED]' : '';
    console.log(`${req.method} ${req.path} → ${res.statusCode}${cached} (${duration}ms)`);
  });
  next();
});

app.use(idempotencyMiddleware);

app.post('/process-payment', async (req, res) => {
  const { amount, currency } = req.body;

  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: 'amount is required.', code: 'MISSING_AMOUNT' });
  }
  if (!currency) {
    return res.status(400).json({ error: 'currency is required.', code: 'MISSING_CURRENCY' });
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number.', code: 'INVALID_AMOUNT' });
  }
  if (typeof currency !== 'string' || currency.length !== 3) {
    return res.status(400).json({ error: 'currency must be a valid 3-letter code e.g. GHS, USD.', code: 'INVALID_CURRENCY' });
  }

  console.log(`[PAYMENT] Processing ${amount} ${currency.toUpperCase()}...`);
  await new Promise(resolve => setTimeout(resolve, 2000));

  const transactionId = `txn_${uuidv4()}`;
  console.log(`[PAYMENT] Success — ${transactionId}`);

  return res.status(201).json({
    status: 'success',
    message: `Charged ${amount} ${currency.toUpperCase()}`,
    transactionId,
    amount,
    currency: currency.toUpperCase(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
  });
});

app.get('/keys/:key', async (req, res) => {
  await db.read();
  const record = db.data.keys[req.params.key];
  if (!record) {
    return res.status(404).json({ error: 'Key not found.' });
  }
  res.json({
    key: req.params.key,
    status: record.status,
    requested_at: record.requested_at,
    completed_at: record.completed_at,
    status_code: record.status_code,
  });
});
/**
 * GET /stats
 * Returns a summary of all idempotency keys in the system.
 * Great for monitoring dashboards.
 */
app.get('/stats', async (req, res) => {
  await db.read();
  const keys = Object.values(db.data.keys);

  const stats = {
    total: keys.length,
    done: keys.filter(k => k.status === 'DONE').length,
    in_flight: keys.filter(k => k.status === 'IN_FLIGHT').length,
    timestamp: new Date().toISOString(),
  };

  res.json(stats);
});
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

async function start() {
  await db.read();
  db.data ||= { keys: {} };
  await db.write();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('');
    console.log('  IgirePay Idempotency Gateway');
    console.log(`  Running on http://localhost:${PORT}`);
    console.log('');
    console.log('  Open http://localhost:3000 in your browser to use the tester');
    console.log('');
  });
}
// Auto-cleanup: delete keys older than 24 hours every hour
// In production Fintech systems, idempotency keys expire after 24 hours
// This prevents the database from growing forever
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

setInterval(async () => {
  await db.read();
  const now = Date.now();
  let cleaned = 0;

  for (const [key, record] of Object.entries(db.data.keys)) {
    const age = now - new Date(record.requested_at).getTime();
    if (age > TWENTY_FOUR_HOURS) {
      delete db.data.keys[key];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    await db.write();
    console.log(`[CLEANUP] Removed ${cleaned} expired idempotency key(s).`);
  }
}, 60 * 60 * 1000); // runs every hour
start();