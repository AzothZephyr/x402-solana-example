import { config } from "dotenv";
import { readFileSync } from "fs";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  mainnet,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  partiallySignTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  type Address,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";

config();

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4021";
const KEYPAIR_PATH = (process.env.KEYPAIR_PATH || "~/.config/solana/id.json").replace(/^~/, process.env.HOME || "");
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSOL_MINT = "So11111111111111111111111111111111111111112" as Address;
const REQUIRED_WSOL = 4_200_000n; // 0.0042 SOL (matching server price)
const WRAP_AMOUNT = 5_000_000n; // 0.005 SOL buffer

function loadKeypair(path: string): Uint8Array {
  const fileContent = readFileSync(path, "utf-8");
  return new Uint8Array(JSON.parse(fileContent));
}

const rpc = createSolanaRpc(mainnet(RPC_URL));
const signer = await createKeyPairSignerFromBytes(loadKeypair(KEYPAIR_PATH));

async function getWsolBalance(): Promise<bigint> {
  const [ata] = await findAssociatedTokenPda({
    mint: WSOL_MINT,
    owner: signer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  try {
    const accountInfo = await rpc.getAccountInfo(ata, { encoding: "jsonParsed" }).send();
    if (!accountInfo.value) return 0n;

    const parsed = accountInfo.value.data as {
      parsed: { info: { tokenAmount: { amount: string } } };
    };
    return BigInt(parsed.parsed.info.tokenAmount.amount);
  } catch {
    return 0n;
  }
}

async function wrapSol(amount: bigint): Promise<void> {
  console.log(`\nWrapping ${Number(amount) / 1e9} SOL to WSOL...`);

  const [ata] = await findAssociatedTokenPda({
    mint: WSOL_MINT,
    owner: signer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(signer.address, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx =>
      appendTransactionMessageInstructions(
        [
          getCreateAssociatedTokenIdempotentInstruction({
            payer: signer,
            owner: signer.address,
            mint: WSOL_MINT,
            ata,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
          }),
          getTransferSolInstruction({
            source: signer,
            destination: ata,
            amount,
          }),
          getSyncNativeInstruction({ account: ata }),
        ],
        tx,
      ),
  );

  const signed = await partiallySignTransactionMessageWithSigners(tx);
  const wireTransaction = getBase64EncodedWireTransaction(signed);

  const txSignature = await rpc.sendTransaction(wireTransaction, { encoding: "base64" }).send();
  console.log(`Wrap tx: ${txSignature}`);

  for (let i = 0; i < 30; i++) {
    const status = await rpc.getSignatureStatuses([txSignature]).send();
    const confirmation = status.value[0]?.confirmationStatus;
    if (confirmation === "confirmed" || confirmation === "finalized") {
      console.log("Wrap confirmed!");
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error("Wrap transaction not confirmed");
}

async function queryMeaningOfLife(): Promise<void> {
  console.log(`\nQuerying Deep Thought at ${SERVER_URL}/meaning-of-life...`);
  console.log("(This may take 7.5 million years... or about 4 seconds)\n");

  const client = new x402Client();
  registerExactSvmScheme(client, { signer });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(`${SERVER_URL}/meaning-of-life`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  console.log("=".repeat(60));
  console.log("DEEP THOUGHT RESPONSE:");
  console.log("=".repeat(60));
  console.log(JSON.stringify(data, null, 2));
  console.log("=".repeat(60));

  console.log("\nResponse Headers:");
  console.log(`  X-Deep-Thought: ${response.headers.get("X-Deep-Thought")}`);
  console.log(`  X-Compute-Time: ${response.headers.get("X-Compute-Time")}`);
  console.log(`  X-Towel: ${response.headers.get("X-Towel")}`);
  console.log(`  X-Vogon-Poetry: ${response.headers.get("X-Vogon-Poetry")}`);

  const httpClient = new x402HTTPClient(client);
  try {
    const paymentResponse = httpClient.getPaymentSettleResponse(name => response.headers.get(name));
    if (paymentResponse) {
      console.log("\nPayment Settlement:");
      console.log(`  Success: ${paymentResponse.success}`);
      if (paymentResponse.transaction) {
        console.log(`  Transaction: https://solscan.io/tx/${paymentResponse.transaction}`);
      }
    }
  } catch {
    // Payment response header not always present
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("x402 CLI Client - The Meaning of Life");
  console.log("=".repeat(60));
  console.log(`Wallet: ${signer.address}`);

  const balance = await getWsolBalance();
  console.log(`WSOL Balance: ${Number(balance) / 1e9} SOL`);

  if (balance < REQUIRED_WSOL) {
    console.log(`Insufficient WSOL. Need ${Number(REQUIRED_WSOL) / 1e9}, have ${Number(balance) / 1e9}`);
    await wrapSol(WRAP_AMOUNT);
  }

  await queryMeaningOfLife();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
