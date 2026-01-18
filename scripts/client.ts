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
  signAndSendTransactionMessageWithSigners,
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
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id.json`;
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSOL_MINT = "So11111111111111111111111111111111111111112" as Address;
const WRAP_AMOUNT = 5_000_000n; // 0.005 SOL in lamports (enough for 0.004 + buffer)

function loadKeypair(path: string): Uint8Array {
  const fileContent = readFileSync(path, "utf-8");
  const parsed = JSON.parse(fileContent);
  return new Uint8Array(parsed);
}

const rpc = createSolanaRpc(mainnet(RPC_URL));
const signer = await createKeyPairSignerFromBytes(loadKeypair(KEYPAIR_PATH));

console.log(`Wallet: ${signer.address}`);

async function getWsolBalance(): Promise<bigint> {
  const [ata] = await findAssociatedTokenPda({
    mint: WSOL_MINT,
    owner: signer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  try {
    const accountInfo = await rpc
      .getAccountInfo(ata, { encoding: "jsonParsed" })
      .send();

    if (!accountInfo.value) return 0n;

    const parsed = accountInfo.value.data as {
      parsed: { info: { tokenAmount: { amount: string } } };
    };
    return BigInt(parsed.parsed.info.tokenAmount.amount);
  } catch {
    return 0n;
  }
}

async function wrapSol(amount: bigint): Promise<string> {
  console.log(`Wrapping ${Number(amount) / 1e9} SOL...`);

  const [ata] = await findAssociatedTokenPda({
    mint: WSOL_MINT,
    owner: signer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(signer.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) =>
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
          getSyncNativeInstruction({
            account: ata,
          }),
        ],
        tx
      )
  );

  const signature = await signAndSendTransactionMessageWithSigners(tx);
  console.log(`Wrap tx: ${signature}`);

  let confirmed = false;
  for (let i = 0; i < 30 && !confirmed; i++) {
    const status = await rpc.getSignatureStatuses([signature]).send();
    if (
      status.value[0]?.confirmationStatus === "confirmed" ||
      status.value[0]?.confirmationStatus === "finalized"
    ) {
      confirmed = true;
    } else {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!confirmed) throw new Error("Wrap transaction not confirmed");
  console.log("Wrap confirmed!");
  return signature;
}

async function callPaidEndpoint(): Promise<void> {
  console.log(`\nCalling ${SERVER_URL}/meaning-of-life...`);

  const client = new x402Client();
  registerExactSvmScheme(client, { signer, rpcUrl: RPC_URL });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const response = await fetchWithPayment(`${SERVER_URL}/meaning-of-life`, {
    method: "GET",
  });

  const data = await response.json();
  const httpClient = new x402HTTPClient(client);
  const paymentResponse = httpClient.getPaymentSettleResponse((name) =>
    response.headers.get(name)
  );

  console.log("\n" + "=".repeat(50));
  console.log("Response:", JSON.stringify(data, null, 2));
  if (paymentResponse) {
    console.log("Payment settled:", paymentResponse.success);
    if (paymentResponse.transaction) {
      console.log("Transaction:", paymentResponse.transaction);
    }
  }
  console.log("=".repeat(50));
}

async function main() {
  const currentBalance = await getWsolBalance();
  console.log(`Current WSOL balance: ${Number(currentBalance) / 1e9} SOL`);

  const requiredAmount = 4_000_000n; // 0.004 SOL
  if (currentBalance < requiredAmount) {
    console.log(`Insufficient WSOL. Need ${Number(requiredAmount) / 1e9}, have ${Number(currentBalance) / 1e9}`);
    await wrapSol(WRAP_AMOUNT);
  }

  await callPaidEndpoint();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
