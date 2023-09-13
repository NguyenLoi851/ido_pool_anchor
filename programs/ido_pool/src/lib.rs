use anchor_lang::prelude::*;
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod states;

use instructions::*;

declare_id!("BRFToHyskhgosAcNDCGRF7v5ENwheanfSSvdUVAqpSi1");

#[program]
pub mod ido_pool {
    use super::*;

    pub fn initialize(
        ctx: Context<InitializePool>,
        num_ido_tokens: u64,
        start_ido_ts: i64,
        end_deposits_ts: i64,
        end_ido_ts: i64,
    ) -> Result<()> {
        instructions::initialize_pool(
            ctx,
            num_ido_tokens,
            start_ido_ts,
            end_deposits_ts,
            end_ido_ts,
        )?;
        Ok(())
    }

    pub fn exchange_usdc_for_redeemable(
        ctx: Context<ExchangeUsdcForRedeemable>,
        amount: u64,
    ) -> Result<()> {
        instructions::exchange_usdc_for_redeemable(ctx, amount)?;
        Ok(())
    }

    pub fn exchange_redeemable_for_usdc(
        ctx: Context<ExchangeRedeemableForUsdc>,
        amount: u64,
    ) -> Result<()> {
        instructions::exchange_redeemable_for_usdc(ctx, amount)?;
        Ok(())
    }

    pub fn exchange_redeemable_for_watermelon(
        ctx: Context<ExchangeRedeemableForWatermelon>,
        amount: u64,
    ) -> Result<()> {
        instructions::exchange_redeemable_for_watermelon(ctx, amount)?;
        Ok(())
    }

    pub fn withdraw_pool_usdc(ctx: Context<WithdrawPoolUsdc>) -> Result<()> {
        instructions::withdraw_pool_usdc(ctx)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
