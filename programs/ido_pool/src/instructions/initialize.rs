use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Mint, TokenAccount};
use anchor_lang::solana_program::program_option::COption;

use crate::states::PoolAccount;
use crate::errors::ErrorCode;

#[access_control(InitializePool::accounts(&ctx) future_start_time(&ctx, start_ido_ts))]
pub fn initialize_pool(
    ctx: Context<InitializePool>,
    num_ido_tokens: u64,
    start_ido_ts: i64,
    end_deposits_ts: i64,
    end_ido_ts: i64,
) -> Result<()> {
    if !(start_ido_ts < end_deposits_ts && end_deposits_ts < end_ido_ts) {
        return Err(ErrorCode::SeqTimes.into());
    }

    let pool_account = &mut ctx.accounts.pool_account;
    pool_account.redeemable_mint = *ctx.accounts.redeemable_mint.to_account_info().key;
    pool_account.pool_watermelon = *ctx.accounts.pool_watermelon.to_account_info().key;
    pool_account.watermelon_mint = ctx.accounts.pool_watermelon.mint;
    pool_account.pool_usdc = *ctx.accounts.pool_usdc.to_account_info().key;
    pool_account.distribution_authority = *ctx.accounts.distribution_authority.key;
    pool_account.nonce = *ctx.bumps.get("pool_signer").unwrap();
    pool_account.num_ido_tokens = num_ido_tokens;
    pool_account.start_ido_ts = start_ido_ts;
    pool_account.end_deposits_ts = end_deposits_ts;
    pool_account.end_ido_ts = end_ido_ts;

    // Transfer Watermelon from creator to pool account.
    let cpi_accounts = Transfer {
        from: ctx.accounts.creator_watermelon.to_account_info(),
        to: ctx.accounts.pool_watermelon.to_account_info(),
        authority: ctx.accounts.distribution_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.clone();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, num_ido_tokens)?;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(init, payer = sender, space = PoolAccount::LEN)]
    pool_account: Account<'info, PoolAccount>,

    #[account(mut)]
    sender: Signer<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(seeds = [pool_watermelon.mint.as_ref()], bump)]
    pool_signer: AccountInfo<'info>,
    #[account(
        constraint = redeemable_mint.mint_authority == COption::Some(*pool_signer.key),
        constraint = redeemable_mint.supply == 0
    )]
    redeemable_mint: Account<'info, Mint>,
    #[account(constraint = usdc_mint.decimals == redeemable_mint.decimals)]
    usdc_mint: Account<'info, Mint>,
    #[account(mut, constraint = pool_watermelon.owner == *pool_signer.key)]
    pool_watermelon: Account<'info, TokenAccount>,
    #[account(constraint = pool_usdc.owner == *pool_signer.key)]
    pool_usdc: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(signer)]
    distribution_authority: AccountInfo<'info>,
    #[account(mut, constraint = creator_watermelon.owner == *distribution_authority.key)]
    creator_watermelon: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(constraint = token_program.key == &token::ID)]
    token_program: AccountInfo<'info>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
    clock: Sysvar<'info, Clock>,
}

impl<'info> InitializePool<'info> {
    fn accounts(ctx: &Context<InitializePool<'info>>) -> Result<()> {
        let expected_signer = Pubkey::create_program_address(
            &[ctx.accounts.pool_watermelon.mint.as_ref(), &[*ctx.bumps.get("pool_signer").unwrap()]],
            ctx.program_id,
        )
        .map_err(|_| ErrorCode::InvalidNonce)?;
        if ctx.accounts.pool_signer.key != &expected_signer {
            return Err(ErrorCode::InvalidNonce.into());
        }
        Ok(())
    }
}

// Asserts the IDO starts in the future.
fn future_start_time<'info>(ctx: &Context<InitializePool<'info>>, start_ido_ts: i64) -> Result<()> {
    if !(ctx.accounts.clock.unix_timestamp < start_ido_ts) {
        return Err(ErrorCode::IdoFuture.into());
    }
    Ok(())
}
