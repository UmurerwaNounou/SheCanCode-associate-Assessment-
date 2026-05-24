# IgirePay Idempotency Gateway
### The "Pay-Once" Protocol

A production-grade REST API that guarantees payments are processed **exactly once**, no matter how many times a client retries. Built for IgirePay Technologies to solve the double-charging problem caused by network timeouts and automatic retries.

---

## Live Demo

Start the server and open `http://localhost:3000` in your browser to use the interactive dashboard.

![Dashboard](https://i.imgur.com/placeholder.png)

---

## Architecture & Flow
CLIENT                    IDEMPOTENCY LAYER                  JSON STORE
│                               │                               │
│──POST /process-payment──────▶│                               │
│  Idempotency-Key: abc-123    │                               │
│  { amount: 100, currency }   │                               │
│                               │──── Lookup key ────────────▶│
│                               │◀─── Not found ──────────────│
│                               │──── Save IN_FLIGHT ────────▶│
│                               │                               │
│                               │   [Simulate 2s processing]   │
│                               │                               │
│                               │──── Save DONE + response ──▶│
│◀──201 "Charged 100 GHS" ─────│                               │
│                               │                               │
│                               │                               │
│──POST /process-payment──────▶│  ← Duplicate request          │
│  Idempotency-Key: abc-123    │                               │
│                               │──── Lookup key ────────────▶│
│                               │◀─── Found: DONE ────────────│
│◀──201 (cached, instant) ─────│                               │
│   X-Cache-Hit: true          │                               │
│                               │                               │
│──POST /process-payment──────▶│  ← Same key, different body   │
│  Idempotency-Key: abc-123    │                               │
│  { amount: 500 }             │──── Lookup key ────────────▶│
│                               │◀─── Hash mismatch ──────────│
│◀──422 Conflict ──────────────│                               │
│                               │                               │
│  [Race condition]             │                               │
│──POST (Request A) ──────────▶│──── Save IN_FLIGHT ────────▶│
│──POST (Request B) ──────────▶│──── Sees IN_FLIGHT ─────────│
│                               │     polls every 150ms        │
│                               │──── A completes ───────────▶│
│◀──201 Result (A) ────────────│                               │
│◀──201 Result (B, cached) ────│                               │

---

## Setup Instructions

### Prerequisites
- Node.js v18 or higher
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/UmurerwaNounou/SheCanCode-associate-Assessment-.git

# Navigate into the project
cd SheCanCode-associate-Assessment-

# Install dependencies
npm install

# Start the server
npm start
```

Server runs on `http://localhost:3000`

Open `http://localhost:3000` in your browser to use the interactive API tester dashboard.

---

## API Documentation

### POST /process-payment

Processes a payment exactly once per unique `Idempotency-Key`.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | application/json |
| Idempotency-Key | Yes | Unique string, 8–128 characters |

**Request Body**

```json
{
  "amount": 100,
  "currency": "GHS"
}
```

**Success Response (201)**

```json
{
  "status": "success",
  "message": "Charged 100 GHS",
  "transactionId": "txn_a1b2c3d4-...",
  "amount": 100,
  "currency": "GHS",
  "timestamp": "2026-05-20T09:00:00.000Z"
}
```

**Duplicate Request Response (201 + cache header)**
X-Cache-Hit: true
X-Idempotency-Key: abc-123
```json
{
  "status": "success",
  "message": "Charged 100 GHS",
  "transactionId": "txn_a1b2c3d4-...",
  "timestamp": "2026-05-20T09:00:00.000Z"
}
```

**Conflict Response (422)**

```json
{
  "error": "Idempotency key already used for a different request body.",
  "code": "IDEMPOTENCY_KEY_MISMATCH"
}
```

---

### GET /health

Returns server health status.

```json
{
  "status": "ok",
  "uptime": "120s",
  "timestamp": "2026-05-20T09:00:00.000Z"
}
```

---

### GET /keys/:key

Looks up the status of any idempotency key. Useful for debugging and support.

```json
{
  "key": "abc-123",
  "status": "DONE",
  "requested_at": "2026-05-20T09:00:00.000Z",
  "completed_at": "2026-05-20T09:00:02.000Z",
  "status_code": 201
}
```

---

## Response Codes Summary

| Status | Meaning |
|--------|---------|
| 201 Created | Payment processed successfully |
| 201 + X-Cache-Hit: true | Duplicate — cached response returned instantly |
| 400 Bad Request | Missing or invalid amount/currency |
| 422 Unprocessable Entity | Same key reused with different request body |
| 503 Service Unavailable | In-flight request timed out |

---

## Design Decisions

### SHA-256 Body Hashing
Instead of storing the full request body, we store a SHA-256 hash of it. This detects payload tampering when the same key is reused, saves storage, and adds a layer of security.

### Polling for Race Conditions
When two identical requests arrive simultaneously, the second request polls the store every 150ms (instead of failing immediately). Once the first request completes, the second returns the same result. This prevents duplicate processing without needing a message queue or distributed lock.

### Intercepting res.json()
The middleware wraps Express's `res.json()` method. This means any route handler works automatically with idempotency — the route doesn't need to know about it at all. Clean separation of concerns.

### Key Validation
Keys must be 8–128 characters. Too-short keys increase collision risk; too-long keys waste storage. This matches industry standards (Stripe uses a similar limit).

### Audit Timestamps
Every key record stores `requested_at` and `completed_at` timestamps. This enables support teams to audit exactly when a transaction was first attempted and when it completed — critical for Fintech dispute resolution.

---

## Developer's Choice Feature: Audit Trail & Key Inspector

Beyond the core idempotency logic, I added:

**1. `GET /keys/:key` endpoint**
Support and engineering teams can instantly look up any idempotency key to see its status (`IN_FLIGHT` or `DONE`), when it was requested, and when it completed. In a real Fintech company, this saves hours of debugging during payment disputes.

**2. Full audit timestamps**
Every stored key records `requested_at` and `completed_at`. This creates a natural audit trail that can power dashboards, SLA monitoring, and compliance reporting.

**3. Interactive browser dashboard**
A built-in HTML dashboard at `http://localhost:3000` lets anyone test all three scenarios (new payment, duplicate, conflict) without needing Postman or curl. This dramatically improves developer experience and makes the project immediately understandable to reviewers.

**Why this matters for a real Fintech company:**
Payment disputes are expensive. Having a queryable audit trail for every idempotency key means engineers can answer "was this payment attempted twice?" in seconds rather than hours of log-digging.

---

## User Stories Status

| Story | Description | Status |
|-------|-------------|--------|
| 1 | First transaction processed with 2s delay | Done |
| 2 | Duplicate returns cached response + X-Cache-Hit header | Done |
| 3 | Same key + different body returns 422 | Done |
| Bonus | Race condition — second request waits for first | Done |
| Extra | Key audit trail + browser dashboard | Done |

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| Node.js | Runtime |
| Express.js | HTTP framework |
| lowdb | Lightweight JSON persistence |
| uuid | Unique transaction ID generation |
| crypto (built-in) | SHA-256 body hashing |
