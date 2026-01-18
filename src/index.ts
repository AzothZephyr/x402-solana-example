import express from "express";
import cors from "cors";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4021;
const SVM_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SVM_PAYEE_ADDRESS = process.env.SVM_PAYEE_ADDRESS;
const FACILITATOR_URL = "https://facilitator.payai.network";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

if (!SVM_PAYEE_ADDRESS) {
  console.error("❌ SVM_PAYEE_ADDRESS environment variable is required");
  console.error("   Set it in .env file or export it directly");
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: true,
  exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-Deep-Thought", "X-Compute-Time", "X-Towel", "X-Vogon-Poetry"],
}));

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);
registerExactSvmScheme(server);

app.use(
  paymentMiddleware(
    {
      "GET /meaning-of-life": {
        accepts: {
          scheme: "exact",
          network: SVM_NETWORK,
          payTo: SVM_PAYEE_ADDRESS,
          price: {
            amount: "4200000",
            asset: WSOL_MINT,
          },
        },
        description:
          "Deep Thought computed for 7.5 million years. You can skip the wait for a small fee. Don't Panic.",
        mimeType: "application/json",
      },
    },
    server,
  ),
);

app.get("/meaning-of-life", async (_req, res) => {
  // Deep Thought computed for 7.5 million years... you get a discount
  res.setHeader("X-Deep-Thought", "Computation complete");
  res.setHeader("X-Compute-Time", "7500000 years (discounted for payment)");
  res.setHeader("X-Towel", "Don't panic");
  res.setHeader("X-Vogon-Poetry", "Spared");

  // Simulate Deep Thought's computation (7.5 million years compressed to 4 seconds)
  await new Promise(resolve => setTimeout(resolve, 4000));

  res.json({
    answer: 42,
    question: "Unknown",
    computeTime: "7.5 million years",
    note: "The supercomputer Deep Thought originally took 7.5 million years to compute this. Your payment expedited the process significantly.",
    disclaimer: "Unfortunately, no one actually knew what the Question was. Perhaps you need an even bigger computer for that.",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    network: SVM_NETWORK,
    payee: SVM_PAYEE_ADDRESS,
    price: "0.0042 WSOL",
  });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          x402 "Meaning of Life" Server                    ║
╠═══════════════════════════════════════════════════════════╣
║  Server:      http://localhost:${PORT}                       ║
║  Network:     Solana Mainnet                              ║
║  Facilitator: PayAI                                       ║
║  Price:       0.0042 WSOL (42, obviously)                 ║
║  Payee:       ${SVM_PAYEE_ADDRESS?.slice(0, 8)}...${SVM_PAYEE_ADDRESS?.slice(-6)}                       ║
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║  • GET /meaning-of-life  (0.0042 WSOL)                    ║
║  • GET /health           (free)                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
