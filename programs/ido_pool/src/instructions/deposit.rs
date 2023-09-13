use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, TokenAccount, Transfer};
use anchor_lang::solana_program::program_option::COption;

use crate::states::PoolAccount;
use crate::errors::ErrorCode;

#[access_control(unrestricted_phase(&ctx))]
pub fn exchange_usdc_for_redeemable(
    ctx: Context<ExchangeUsdcForRedeemable>,
    amount: u64,
) -> Result<()> {
    // While token::transfer will check this, we prefer a verbose err msg.
    if ctx.accounts.user_usdc.amount < amount {
        return Err(ErrorCode::LowUsdc.into());
    }

    // Transfer user's USDC to pool USDC account.
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_usdc.to_account_info(),
        to: ctx.accounts.pool_usdc.to_account_info(),
        authority: ctx.accounts.user_authority.clone(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Mint Redeemable to user Redeemable account.
    let seeds = &[
        ctx.accounts.pool_account.watermelon_mint.as_ref(),
        &[ctx.accounts.pool_account.nonce],
    ];
    let signer = &[&seeds[..]];
    let cpi_accounts = MintTo {
        mint: ctx.accounts.redeemable_mint.to_account_info(),
        to: ctx.accounts.user_redeemable.to_account_info(),
        authority: ctx.accounts.pool_signer.clone(),
    };
    let cpi_program = ctx.accounts.token_program.clone();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::mint_to(cpi_ctx, amount)?;

    Ok(())
}

#[derive(Accounts)]
pub struct ExchangeUsdcForRedeemable<'info> {
    #[account(has_one = redeemable_mint, has_one = pool_usdc)]
    pub pool_account: Account<'info, PoolAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(seeds = [pool_account.watermelon_mint.as_ref()], bump)]
    pool_signer: AccountInfo<'info>,
    #[account(
        mut,
        constraint = redeemable_mint.mint_authority == COption::Some(*pool_signer.key)
    )]
    pub redeemable_mint: Account<'info, Mint>,
    #[account(mut, constraint = pool_usdc.owner == *pool_signer.key)]
    pub pool_usdc: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    #[account(mut, constraint = user_usdc.owner == *user_authority.key)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_redeemable.owner == *user_authority.key)]
    pub user_redeemable: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

// Asserts the IDO is in the first phase.
fn unrestricted_phase<'info>(ctx: &Context<ExchangeUsdcForRedeemable<'info>>) -> Result<()> {
    if !(ctx.accounts.pool_account.start_ido_ts < ctx.accounts.clock.unix_timestamp) {
        return Err(ErrorCode::StartIdoTime.into());
    } else if !(ctx.accounts.clock.unix_timestamp < ctx.accounts.pool_account.end_deposits_ts) {
        return Err(ErrorCode::EndDepositsTime.into());
    }
    Ok(())
}
