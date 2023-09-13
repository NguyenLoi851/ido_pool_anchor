import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getTokenAccount(
  provider: anchor.AnchorProvider,
  addr: anchor.web3.PublicKey
) {
  return await spl.getAccount(provider.connection, addr);
}

export async function createMint(
  provider: anchor.AnchorProvider,
  authority?: anchor.web3.PublicKey
) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = anchor.web3.Keypair.generate();
  const instructions = await createMintInstructions(
    provider,
    authority,
    mint.publicKey
  );

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.sendAndConfirm(tx, [mint]);

  return mint.publicKey;
}

async function createMintInstructions(
  provider: anchor.AnchorProvider,
  authority: anchor.web3.PublicKey,
  mintPubKey: anchor.web3.PublicKey
) {
  let instructions = [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mintPubKey,
      space: spl.MintLayout.span,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(
        spl.MintLayout.span
      ),
      programId: spl.TOKEN_PROGRAM_ID,
    }),

    spl.createInitializeMint2Instruction(
      mintPubKey,
      6,
      authority,
      authority,
      spl.TOKEN_PROGRAM_ID
    ),
  ];
  return instructions;
}

export async function createAssociatedTokenAccount(
  provider: anchor.AnchorProvider,
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey
) {
  const userAssociatedTokenAccount = await spl.getAssociatedTokenAddress(
    mint,
    owner,
    false,
    spl.TOKEN_PROGRAM_ID,
    spl.ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const instructions = await createAssociatedTokenAccountInstructions(
    provider.wallet.publicKey,
    userAssociatedTokenAccount,
    owner,
    mint
  );

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.sendAndConfirm(tx, []);

  return userAssociatedTokenAccount;
}

async function createAssociatedTokenAccountInstructions(
  payer: anchor.web3.PublicKey,
  associatedToken: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey
) {
  let instructions = [
    spl.createAssociatedTokenAccountInstruction(
      payer,
      associatedToken,
      owner,
      mint,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    ),
  ];

  return instructions;
}

export async function createTokenAccount(
  provider: anchor.AnchorProvider,
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey
) {
  const vault = anchor.web3.Keypair.generate();

  const instructions = await createTokenAccountInstrs(
    provider,
    vault.publicKey,
    mint,
    owner
  );
  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.sendAndConfirm(tx, [vault]);
  return vault.publicKey;
}

async function createTokenAccountInstrs(
    provider: anchor.AnchorProvider,
  account: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey
) {
  let instructions = [
    anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: account,
        space: spl.AccountLayout.span,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          spl.AccountLayout.span
        ),
        programId: spl.TOKEN_PROGRAM_ID,
      }),
    spl.createInitializeAccount2Instruction(account, mint, owner),
  ];
  return instructions;
}

export async function createTokenAccountDirectly(
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey
) {
  const newAcccount = await spl.createAccount(provider.connection, payer, mint, owner);
  return newAcccount;
}

export async function mintToAccount(
  provider: anchor.AnchorProvider,
  mint: anchor.web3.PublicKey,
  destination: anchor.web3.PublicKey,
  amount: number,
  mintAuthority: anchor.web3.PublicKey
) {
  const instructions = await createMintToAccountInstrs(
    mint,
    destination,
    amount,
    mintAuthority
  );
  // mint authority is the provider
  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);
  await provider.sendAndConfirm(tx, []);
  return;
}

async function createMintToAccountInstrs(
  mint: anchor.web3.PublicKey,
  destination: anchor.web3.PublicKey,
  amount: number,
  authority: anchor.web3.PublicKey
) {
  let instructions = [
    spl.createMintToInstruction(mint, destination, authority, amount),
  ];
  return instructions;
}
