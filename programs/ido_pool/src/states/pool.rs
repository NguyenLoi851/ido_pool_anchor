use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct PoolAccount {
    pub redeemable_mint: Pubkey,
    pub pool_watermelon: Pubkey,
    pub watermelon_mint: Pubkey,
    pub pool_usdc: Pubkey,
    pub distribution_authority: Pubkey,
    pub nonce: u8,
    pub num_ido_tokens: u64,
    pub start_ido_ts: i64,
    pub end_deposits_ts: i64,
    pub end_ido_ts: i64,
}

impl PoolAccount {
    pub const LEN: usize = DISCRIMINATOR_LENGTH
        + PUBLIC_KEY_LENGTH * 5
        + U8_LENGTH
        + U64_LENGTH * 4;
}
