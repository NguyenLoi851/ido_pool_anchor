use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Transfer, Mint, TokenAccount};
use anchor_lang::solana_program::program_option::COption;

use crate::states::PoolAccount;
use crate::errors::ErrorCode;

#[access_control(ido_over(&ctx.accounts.pool_account, &ctx.accounts.clock))]
pub fn exchange_redeemable_for_watermelon(
    ctx: Context<ExchangeRedeemableForWatermelon>,
    amount: u64,
) -> Result<()> {
    // While token::burn will check this, we prefer a verbose err msg.
    if ctx.accounts.user_redeemable.amount < amount {
        return Err(ErrorCode::LowRedeemable.into());
    }

    // Calculate watermelon tokens due.
    let watermelon_amount = (amount as u128)
        .checked_mul(ctx.accounts.pool_watermelon.amount as u128)
        .unwrap()
        .checked_div(ctx.accounts.redeemable_mint.supply as u128)
        .unwrap();

    // Burn the user's redeemable tokens.
    let cpi_accounts = Burn {
        mint: ctx.accounts.redeemable_mint.to_account_info(),
        from: ctx.accounts.user_redeemable.to_account_info(),
        authority: ctx.accounts.user_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.clone();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::burn(cpi_ctx, amount)?;

    // Transfer Watermelon from pool account to user.
    let seeds = &[
        ctx.accounts.pool_account.watermelon_mint.as_ref(),
        &[ctx.accounts.pool_account.nonce],
    ];
    let signer = &[&seeds[..]];
    let cpi_accounts = Transfer {
        from: ctx.accounts.pool_watermelon.to_account_info(),
        to: ctx.accounts.user_watermelon.to_account_info(),
        authority: ctx.accounts.pool_signer.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.clone();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::transfer(cpi_ctx, watermelon_amount as u64)?;

    Ok(())
}

#[derive(Accounts)]
pub struct ExchangeRedeemableForWatermelon<'info> {
    #[account(has_one = redeemable_mint, has_one = pool_watermelon)]
    pub pool_account: Account<'info, PoolAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(seeds = [pool_account.watermelon_mint.as_ref()], bump)]
    pool_signer: AccountInfo<'info>,
    #[account(
        mut,
        constraint = redeemable_mint.mint_authority == COption::Some(*pool_signer.key)
    )]
    pub redeemable_mint: Account<'info, Mint>,
    #[account(mut, constraint = pool_watermelon.owner == *pool_signer.key)]
    pub pool_watermelon: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    #[account(mut, constraint = user_watermelon.owner == *user_authority.key)]
    pub user_watermelon: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_redeemable.owner == *user_authority.key)]
    pub user_redeemable: Account<'info, TokenAccount>,
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
