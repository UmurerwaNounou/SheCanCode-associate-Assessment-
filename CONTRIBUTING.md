# Contributing to IgirePay Idempotency Gateway

Thank you for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/UmurerwaNounou/SheCanCode-associate-Assessment-.git
cd SheCanCode-associate-Assessment-
npm install
npm start
```

## Project Structure
src/
db.js          → Database adapter (lowdb JSON store)
middleware.js  → Core idempotency logic
server.js      → Express app, routes, cleanup job
public/
index.html     → Interactive browser dashboard
## How the Idempotency Logic Works

1. Every request must include an `Idempotency-Key` header
2. The key is looked up in the JSON store
3. If new → mark `IN_FLIGHT`, process, save result, return response
4. If duplicate → return cached response instantly with `X-Cache-Hit: true`
5. If same key but different body → return `422 Conflict`
6. If in-flight (race condition) → poll every 150ms until complete

## Key Design Principles

- **Idempotency**: Same request = same result, always
- **Auditability**: Every key stores timestamps for dispute resolution
- **Safety**: SHA-256 body hashing detects payload tampering
- **Expiry**: Keys older than 24 hours are automatically cleaned up

## Testing

Start the server and open `http://localhost:3000` to use
the interactive dashboard. Test all three scenarios:

- New payment (takes 2 seconds)
- Duplicate payment (instant, cached)
- Conflict (same key, different amount → 422)