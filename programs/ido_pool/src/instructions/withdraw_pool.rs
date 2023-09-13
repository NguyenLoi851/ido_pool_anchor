use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, TokenAccount};

use crate::states::PoolAccount;
use crate::errors::ErrorCode;

#[access_control(ido_over(&ctx.accounts.pool_account, &ctx.accounts.clock))]
pub fn withdraw_pool_usdc(ctx: Context<WithdrawPoolUsdc>) -> Result<()> {
    // Transfer total USDC from pool account to creator account.
    let seeds = &[
        ctx.accounts.pool_account.watermelon_mint.as_ref(),
        &[ctx.accounts.pool_account.nonce],
    ];
    let signer = &[&seeds[..]];
    let cpi_accounts = Transfer {
        from: ctx.accounts.pool_usdc.to_account_info(),
        to: ctx.accounts.creator_usdc.to_account_info(),
        authority: ctx.accounts.pool_signer.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.clone();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::transfer(cpi_ctx, ctx.accounts.pool_usdc.amount)?;

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawPoolUsdc<'info> {
    #[account(has_one = pool_usdc, has_one = distribution_authority)]
    pub pool_account: Account<'info, PoolAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(seeds = [pool_account.watermelon_mint.as_ref()], bump)]
    pub pool_signer: AccountInfo<'info>,
    #[account(mut, constraint = pool_usdc.owner == *pool_signer.key)]
    pub pool_usdc: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(signer)]
    pub distribution_authority: AccountInfo<'info>,
    #[account(mut)]
    pub creator_usdc: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

// Asserts the IDO sale period has ended, based on the current timestamp.
fn ido_over<'info>(
    pool_account: &Account<'info, PoolAccount>,
    clock: &Sysvar<'info, Clock>,
) -> Result<()> {
    if !(pool_account.end_ido_ts < clock.unix_timestamp) {
        return Err(ErrorCode::IdoNotOver.into());
    }
    Ok(())
}
