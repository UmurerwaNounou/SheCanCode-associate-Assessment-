const express = require('express');
const db = require('./db');
const idempotencyMiddleware = require('./middleware');

const app = express();
app.use(express.json());

// Initialize database before starting
db.read().then(() => {
  db.data ||= { keys: {} };
  return db.write();
}).then(() => {

  app.use(idempotencyMiddleware);

  app.post('/process-payment', async (req, res) => {
    const { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: 'amount and currency are required.',
      });
    }

    // Simulate 2 second processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return res.status(201).json({
      status: 'success',
      message: `Charged ${amount} ${currency}`,
      transactionId: `txn_${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', (_, res) => {
    res.json({ status: 'ok' });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`IgirePay Idempotency Gateway running on port ${PORT}`);
  });

});