import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { IdoPool } from "../target/types/ido_pool";
import {
  sleep,
  getTokenAccount,
  createMint,
  createTokenAccount,
  createAssociatedTokenAccount,
  createTokenAccountDirectly,
  mintToAccount,
} from "./utils";
import { expect } from "chai";
import * as spl from "@solana/spl-token";

describe("ido_pool", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env();

  const program = anchor.workspace.IdoPool as Program<IdoPool>;

  // All mints default to 6 decimal places.
  const watermelonIdoAmount = new anchor.BN(5000000);

  // These are all of the variables we assume exist in the world already and
  // are available to the client.
  let usdcMint = null;
  let watermelonMint = null;
  let creatorUsdc = null;
  let creatorWatermelon = null;

  it("Initializes the state-of-the-world", async () => {
    usdcMint = await createMint(provider);
    watermelonMint = await createMint(provider);
    creatorUsdc = await createTokenAccount(
      provider,
      usdcMint,
      provider.wallet.publicKey
    );
    creatorWatermelon = await createTokenAccount(
      provider,
      watermelonMint,
      provider.wallet.publicKey
    );
    // Mint Watermelon tokens the will be distributed from the IDO pool.
    await mintToAccount(
      provider,
      watermelonMint,
      creatorWatermelon,
      Number(watermelonIdoAmount),
      provider.wallet.publicKey
    );
    const creator_watermelon_account = await getTokenAccount(
      provider,
      creatorWatermelon
    );
    expect(Number(creator_watermelon_account.amount)).to.be.equals(
      Number(watermelonIdoAmount)
    );
  });

  // These are all variables the client will have to create to initialize the
  // IDO pool
  let poolSigner = null;
  let redeemableMint = null;
  let poolWatermelon = null;
  let poolUsdc = null;
  let poolAccount = null;

  let startIdoTs = null;
  let endDepositsTs = null;
  let endIdoTs = null;

  it("Initializes the IDO pool", async () => {
    // We use the watermelon mint address as the seed, could use something else though.
    const [_poolSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddressSync(
        [watermelonMint.toBuffer()],
        program.programId
      );
    poolSigner = _poolSigner;

    // Pool doesn't need a Redeemable SPL token account because it only
    // burns and mints redeemable tokens, it never stores them.
    redeemableMint = await createMint(provider, poolSigner);
    poolWatermelon = await createTokenAccount(
      provider,
      watermelonMint,
      poolSigner
    );
    poolUsdc = await createTokenAccount(provider, usdcMint, poolSigner);

    poolAccount = anchor.web3.Keypair.generate();
    const nowBn = new anchor.BN(Date.now() / 1000);
    startIdoTs = nowBn.add(new anchor.BN(5));
    endDepositsTs = nowBn.add(new anchor.BN(10));
    endIdoTs = nowBn.add(new anchor.BN(15));

    // Atomically create the new account and initialize it with the program.
    await program.methods
      .initialize(
        watermelonIdoAmount,
        startIdoTs,
        endDepositsTs,
        endIdoTs
      )
      .accounts({
        poolAccount: poolAccount.publicKey,
        poolSigner,
        distributionAuthority: provider.wallet.publicKey,
        creatorWatermelon,
        redeemableMint,
        usdcMint,
        poolWatermelon,
        poolUsdc,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([poolAccount])
      .rpc();

    const creator_watermelon_account = await getTokenAccount(
      provider,
      creatorWatermelon
    );
    expect(Number(creator_watermelon_account.amount)).to.be.equals(0);
  });

  // We're going to need to start using the associated program account for creating token accounts
  // if not in testing, then definitely in production.

  let userUsdc = null;
  let userRedeemable = null;
  // 10 usdc
  const firstDeposit = new anchor.BN(10_000_349);

  it("Exchanges user USDC for redeemable tokens", async () => {
    // Wait until the IDO has opened.
    if (Date.now() < startIdoTs.toNumber() * 1000) {
      await sleep(startIdoTs.toNumber() * 1000 - Date.now() + 1000);
    }

    userUsdc = await createTokenAccount(
      provider,
      usdcMint,
      provider.wallet.publicKey
    );
    await mintToAccount(
      provider,
      usdcMint,
      userUsdc,
      Number(firstDeposit),
      provider.wallet.publicKey
    );
    userRedeemable = await createTokenAccount(
      provider,
      redeemableMint,
      provider.wallet.publicKey
    );

    try {
      const tx = await program.methods
        .exchangeUsdcForRedeemable(firstDeposit)
        .accounts({
          poolAccount: poolAccount.publicKey,
          poolSigner,
          redeemableMint,
          poolUsdc,
          userAuthority: provider.wallet.publicKey,
          userUsdc,
          userRedeemable,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([])
        .rpc();
    } catch (err) {
      console.log("This is the error message", err.toString());
    }

    const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    expect(Number(poolUsdcAccount.amount)).to.be.equal(Number(firstDeposit));
    const userRedeemableAccount = await getTokenAccount(
      provider,
      userRedeemable
    );
    expect(Number(userRedeemableAccount.amount)).to.be.equal(
      Number(firstDeposit)
    );
  });

  // 23 usdc
  const secondDeposit = new anchor.BN(23_000_672);
  let totalPoolUsdc = null;
  let secondUserRedeemable = null;

  it("Exchanges a second users USDC for redeemable tokens", async () => {
    const secondUserUsdc = await createTokenAccount(
      provider,
      usdcMint,
      provider.wallet.publicKey
    );
    await mintToAccount(
      provider,
      usdcMint,
      secondUserUsdc,
      Number(secondDeposit),
      provider.wallet.publicKey
    );

    secondUserRedeemable = await createTokenAccount(
      provider,
      redeemableMint,
      provider.wallet.publicKey
    );

    await program.methods
      .exchangeUsdcForRedeemable(secondDeposit)
      .accounts({
        poolAccount: poolAccount.publicKey,
        poolSigner,
        redeemableMint,
        poolUsdc,
        userAuthority: provider.wallet.publicKey,
        userUsdc: secondUserUsdc,
        userRedeemable: secondUserRedeemable,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([])
      .rpc(),
      (totalPoolUsdc = firstDeposit.add(secondDeposit));
    const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    expect(Number(poolUsdcAccount.amount)).to.be.equal(Number(totalPoolUsdc));
    const secondUserRedeemableAccount = await getTokenAccount(
      provider,
      secondUserRedeemable
    );
    expect(Number(secondUserRedeemableAccount.amount)).to.be.equal(
      Number(secondDeposit)
    );
  });

  const firstWithdrawal = new anchor.BN(2_000_000);

  it("Exchanges user Redeemable tokens for USDC", async () => {
    await program.methods
      .exchangeRedeemableForUsdc(firstWithdrawal)
      .accounts({
        poolAccount: poolAccount.publicKey,
        poolSigner,
        redeemableMint,
        poolUsdc,
        userAuthority: provider.wallet.publicKey,
        userUsdc,
        userRedeemable,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([])
      .rpc();

    totalPoolUsdc = totalPoolUsdc.sub(firstWithdrawal);
    const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    expect(Number(poolUsdcAccount.amount)).to.be.equal(Number(totalPoolUsdc));
    const userUsdcAccount = await getTokenAccount(provider, userUsdc);
    expect(Number(userUsdcAccount.amount)).to.be.equal(Number(firstWithdrawal));
  });

  it("Exchanges user Redeemable tokens for watermelon", async () => {
    // Wait until the IDO has opened.
    if (Date.now() < endIdoTs.toNumber() * 1000) {
      await sleep(endIdoTs.toNumber() * 1000 - Date.now() + 2000);
    }
    let firstUserRedeemable = firstDeposit.sub(firstWithdrawal);
    const userWatermelon = await createTokenAccount(
      provider,
      watermelonMint,
      provider.wallet.publicKey
    );

    await program.methods
      .exchangeRedeemableForWatermelon(firstUserRedeemable)
      .accounts({
        poolAccount: poolAccount.publicKey,
        poolSigner,
        redeemableMint,
        poolWatermelon,
        userAuthority: provider.wallet.publicKey,
        userWatermelon,
        userRedeemable,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([])
      .rpc();

    const poolWatermelonAccount = await getTokenAccount(
      provider,
      poolWatermelon
    );
    const redeemedWatermelon = firstUserRedeemable
      .mul(watermelonIdoAmount)
      .div(totalPoolUsdc);
    let remainingWatermelon = watermelonIdoAmount.sub(redeemedWatermelon);
    expect(Number(poolWatermelonAccount.amount)).to.be.equal(
      Number(remainingWatermelon)
    );
    const userWatermelonAccount = await getTokenAccount(
      provider,
      userWatermelon
    );
    expect(Number(userWatermelonAccount.amount)).to.be.equal(
      Number(redeemedWatermelon)
    );
  });

  it("Exchanges second users Redeemable tokens for watermelon", async () => {
    const secondUserWatermelon = await createTokenAccount(
      provider,
      watermelonMint,
      provider.wallet.publicKey
    );

    await program.methods
      .exchangeRedeemableForWatermelon(secondDeposit)
      .accounts({
        poolAccount: poolAccount.publicKey,
        poolSigner,
        redeemableMint,
        poolWatermelon,
        userAuthority: provider.wallet.publicKey,
        userWatermelon: secondUserWatermelon,
        userRedeemable: secondUserRedeemable,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([])
      .rpc();

    const poolWatermelonAccount = await getTokenAccount(
      provider,
      poolWatermelon
    );
    expect(Number(poolWatermelonAccount.amount)).to.be.equal(0);
  });

  it("Withdraws total USDC from pool account", async () => {
    await program.methods
      .withdrawPoolUsdc()
      .accounts({
        poolAccount: poolAccount.publicKey,
        poolSigner,
        distributionAuthority: provider.wallet.publicKey,
        creatorUsdc,
        poolUsdc,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([])
      .rpc();

    const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    expect(Number(poolUsdcAccount.amount)).to.be.equal(0);
    const creatorUsdcAccount = await getTokenAccount(provider, creatorUsdc);
    expect(Number(creatorUsdcAccount.amount)).to.be.equal(
      Number(totalPoolUsdc)
    );
  });

  it("Multiple ixs in a tx", async () => {
    const testAcc1 = anchor.web3.Keypair.generate()
    const testAcc2 = anchor.web3.Keypair.generate()
    let tx = new anchor.web3.Transaction();
    tx.add(
      await program.methods.withdrawPoolUsdc().accounts({
        poolAccount: poolAccount.publicKey,
        poolSigner,
        distributionAuthority: provider.wallet.publicKey,
        creatorUsdc,
        poolUsdc,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,        
      }).instruction()
    )
    tx.add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: testAcc1.publicKey,
        space: spl.AccountLayout.span,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          spl.AccountLayout.span
        ),
        programId: spl.TOKEN_PROGRAM_ID,
      }),

      anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: testAcc2.publicKey,
        space: spl.AccountLayout.span,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          spl.AccountLayout.span
        ),
        programId: spl.TOKEN_PROGRAM_ID,
      }),
    );

  await provider.sendAndConfirm(tx, [testAcc1, testAcc2]);


    // const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    // expect(Number(poolUsdcAccount.amount)).to.be.equal(0);
    // const creatorUsdcAccount = await getTokenAccount(provider, creatorUsdc);
    // expect(Number(creatorUsdcAccount.amount)).to.be.equal(
    //   Number(totalPoolUsdc)
    // );
  });
});
