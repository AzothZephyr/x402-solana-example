# x402 Deep Thought Server

A demonstration of the x402 payment protocol using Solana. Pay 0.0042 WSOL to ask Deep Thought the Answer to the Ultimate Question of Life, the Universe, and Everything.

## What is x402?

x402 is a payment protocol that uses HTTP 402 (Payment Required) responses. When a client requests a protected resource:

1. Server returns 402 with payment requirements in the `PAYMENT-REQUIRED` header
2. Client signs a payment transaction
3. Client retries with the signed transaction in the `PAYMENT-SIGNATURE` header
4. Server verifies and settles the payment via a facilitator
5. Server returns the resource

## Prerequisites

- Node.js 18+
- A Solana wallet with SOL (for the client)
- A Solana keypair file at `~/.config/solana/id.json` (or specify path via `KEYPAIR_PATH`)

## Setup

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
```

Edit `.env` and set `SVM_PAYEE_ADDRESS` to your Solana wallet address where payments will be received.

## Running the Server

```bash
npm run dev
```

The server starts at `http://localhost:4021` with two endpoints:

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /meaning-of-life` | 0.0042 WSOL | Returns the Answer (requires payment) |
| `GET /health` | Free | Health check |

## Running the CLI Client

The client automatically wraps SOL to WSOL if needed.

```bash
npm run client:cli
```

Example output:

```
============================================================
x402 CLI Client - The Meaning of Life
============================================================
Wallet: ExampleWa11etAddressXXXXXXXXXXXXXXXXXXXXXXX
WSOL Balance: 0.005 SOL

Querying Deep Thought at http://localhost:4021/meaning-of-life...
(This may take 7.5 million years... or about 4 seconds)

============================================================
DEEP THOUGHT RESPONSE:
============================================================
{
  "answer": 42,
  "question": "Unknown",
  "computeTime": "7.5 million years",
  "note": "The supercomputer Deep Thought originally took 7.5 million years to compute this. Your payment expedited the process significantly.",
  "disclaimer": "Unfortunately, no one actually knew what the Question was. Perhaps you need an even bigger computer for that."
}
============================================================

Response Headers:
  X-Deep-Thought: Computation complete
  X-Compute-Time: 7500000 years (discounted for payment)
  X-Towel: Don't panic
  X-Vogon-Poetry: Spared

Payment Settlement:
  Success: true
  Transaction: https://solscan.io/tx/...
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SVM_PAYEE_ADDRESS` | Solana address to receive payments | Required |
| `PORT` | Server port | 4021 |
| `KEYPAIR_PATH` | Path to Solana keypair for client | `~/.config/solana/id.json` |
| `SERVER_URL` | Server URL for client | `http://localhost:4021` |
| `RPC_URL` | Solana RPC URL | `https://api.mainnet-beta.solana.com` |

## Important Notes

1. **WSOL Token Account**: The payee address must have a WSOL token account. Create one with:
   ```bash
   spl-token create-account So11111111111111111111111111111111111111112 --owner YOUR_PAYEE_ADDRESS
   ```

2. **Network**: This runs on Solana mainnet by default. The price is real (0.0042 SOL).

3. **Facilitator**: Uses the PayAI facilitator (`https://facilitator.payai.network`) which handles payment verification and settlement.

