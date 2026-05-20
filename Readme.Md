# IgirePay Idempotency Gateway

A RESTful API that ensures payments are processed **exactly once**, no matter how many times a client retries the request.

---

## Architecture Diagram
---
                             
## Setup Instructions

### Prerequisites
- Node.js v18 or higher
- npm

### Installation

```bash
git clone https://github.com/UmurerwaNounou/SheCanCode-associate-Assessment-.git
cd SheCanCode-associate-Assessment-
npm install
npm start
```

Server runs on `http://localhost:3000`

---

## API Documentation

### POST /process-payment

Processes a payment. Requires a unique `Idempotency-Key` header.

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | application/json |
| Idempotency-Key | Yes | Unique string per transaction |

**Request Body:**
```json
{
  "amount": 100,
  "currency": "GHS"
}
```

**Responses:**

| Status | Meaning |
|--------|---------|
| 201 Created | Payment processed successfully |
| 200 + X-Cache-Hit: true | Duplicate request, cached response returned |
| 422 Unprocessable Entity | Same key used with different request body |
| 400 Bad Request | Missing amount or currency |
| 503 Service Unavailable | In-flight request timed out |

**Example - First Request:**
```bash
curl -X POST http://localhost:3000/process-payment \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-001" \
  -d '{"amount": 100, "currency": "GHS"}'
```

**Response:**
```json
{
  "status": "success",
  "message": "Charged 100 GHS",
  "transactionId": "txn_1234567890",
  "timestamp": "2026-05-16T09:12:12.927Z"
}
```

**Example - Duplicate Request:**

Same request returns instantly with `X-Cache-Hit: true` header and the exact same response body.

**Example - Conflict:**
```json
{
  "error": "Idempotency key already used for a different request body."
}
```

### GET /health

Returns server status.

```json
{ "status": "ok" }
```

---

## Design Decisions

### Why lowdb (JSON file) instead of Redis or SQLite?
lowdb requires zero native compilation and works instantly on all platforms. For a demonstration of idempotency logic, a JSON file store is perfectly adequate and removes setup friction for reviewers cloning the repo.

### Why SHA-256 body hashing?
Rather than storing the full request body, we store a SHA-256 hash. This saves storage space and allows fast comparison to detect when the same key is reused with a different payload.

### Why polling for in-flight requests?
When two identical requests arrive simultaneously (race condition), the second request polls the database every 200ms until the first request completes, then returns the same result. This avoids duplicate processing without requiring a message queue.

### Why intercept res.json()?
By wrapping Express's `res.json()` method, we save the response automatically after any route handler runs — without the route needing to know about idempotency at all. This keeps the middleware truly transparent.

---

## Developer's Choice: Automatic Key Expiry Tracking

Every idempotency key is stored with a `created_at` timestamp. This enables:

1. **Auditability** — you can see exactly when each transaction was first attempted
2. **Future expiry** — a cleanup job can delete keys older than 24 hours, preventing the database from growing forever
3. **Debugging** — support teams can look up when a payment was originally processed

In a real Fintech system, idempotency keys should expire after 24 hours (matching industry standards like Stripe's implementation). This timestamp field makes that feature straightforward to add.

---

## User Stories Implemented

-  User Story 1: First transaction processed with 2s delay, returns 201
-  User Story 2: Duplicate request returns cached response with X-Cache-Hit: true
-  User Story 3: Same key with different body returns 422
-  Bonus: Race condition handling — second request waits for first to complete
