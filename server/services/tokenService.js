import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate RPC URL
const rpcUrl = process.env.SOLANA_RPC_URL;
if (!rpcUrl || !rpcUrl.startsWith('http')) {
  throw new Error('Invalid or missing SOLANA_RPC_URL in environment variables');
}

// RPC Connection setup
const connection = new Connection(rpcUrl, 'confirmed');

// Token configuration
const TOKEN_CONFIG = {
  CGT_MINT: process.env.CGT_MINT_ADDRESS,
  TREASURY_PUBLIC_KEY: process.env.CGT_TREASURY_PUBLIC_KEY,
  TREASURY_PRIVATE_KEY: process.env.CGT_TREASURY_PRIVATE_KEY,
  DECIMALS: 9,
  
  // Exchange rates
  SOL_TO_CGT_RATE: 7500,
  USDT_TO_CGT_RATE: 50,
  USDC_TO_CGT_RATE: 50,
  
  // Stablecoin mints
  USDT_MINT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  
  // Presale timing
  PRESALE_START: process.env.PRESALE_START || 1750819200000,
  PRESALE_END: process.env.PRESALE_END || 1756166400000,
};

// Get treasury keypair
function getTreasuryKeypair() {
  try {
    return Keypair.fromSecretKey(bs58.decode(TOKEN_CONFIG.TREASURY_PRIVATE_KEY));
  } catch (error) {
    throw new Error('Invalid treasury private key');
  }
}

// Check if presale is active
export function isPresaleActive() {
  const now = Date.now();
  return now >= TOKEN_CONFIG.PRESALE_START && now <= TOKEN_CONFIG.PRESALE_END;
}

// Calculate CGT amount based on payment token and amount
export function calculateCgtAmount(amount, tokenType) {
  switch (tokenType.toUpperCase()) {
    case 'SOL':
      return amount * TOKEN_CONFIG.SOL_TO_CGT_RATE;
    case 'USDT':
    case 'USDC':
      return amount * TOKEN_CONFIG.USDT_TO_CGT_RATE;
    default:
      throw new Error('Invalid token type');
  }
}

// Create CGT token account for user if it doesn't exist
export async function ensureTokenAccount(userWallet) {
  try {
    const userPublicKey = new PublicKey(userWallet);
    const cgtMint = new PublicKey(TOKEN_CONFIG.CGT_MINT);
    const userTokenAccount = await getAssociatedTokenAddress(cgtMint, userPublicKey);
    
    try {
      await getAccount(connection, userTokenAccount);
      return { success: true, account: userTokenAccount.toString() };
    } catch (error) {
      const treasuryKeypair = getTreasuryKeypair();
      
      const transaction = new Transaction();
      transaction.add(
        createAssociatedTokenAccountInstruction(
          treasuryKeypair.publicKey,
          userTokenAccount,
          userPublicKey,
          cgtMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      
      const signature = await connection.sendTransaction(transaction, [treasuryKeypair]);
      await connection.confirmTransaction(signature, 'confirmed');
      
      return { success: true, account: userTokenAccount.toString(), signature };
    }
  } catch (error) {
    throw new Error(`Failed to ensure token account: ${error.message}`);
  }
}

// Transfer CGT tokens from treasury to user
export async function transferCgtTokens(userWallet, cgtAmount) {
  if (!isPresaleActive()) {
    throw new Error('Presale is not active');
  }

  try {
    const treasuryKeypair = getTreasuryKeypair();
    const userPublicKey = new PublicKey(userWallet);
    const cgtMint = new PublicKey(TOKEN_CONFIG.CGT_MINT);
    
    // Ensure user has a token account
    await ensureTokenAccount(userWallet);
    
    const treasuryTokenAccount = await getAssociatedTokenAddress(cgtMint, treasuryKeypair.publicKey);
    const userTokenAccount = await getAssociatedTokenAddress(cgtMint, userPublicKey);
    
    // Get mint info for accurate decimals
    const mintInfo = await getMint(connection, cgtMint);
    const tokenAmount = Math.floor(cgtAmount * Math.pow(10, mintInfo.decimals));
    
    const transaction = new Transaction();
    transaction.add(
      createTransferInstruction(
        treasuryTokenAccount,
        userTokenAccount,
        treasuryKeypair.publicKey,
        tokenAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    const signature = await connection.sendTransaction(transaction, [treasuryKeypair]);
    await connection.confirmTransaction(signature, 'confirmed');
    
    return {
      success: true,
      signature,
      amount: cgtAmount,
      recipient: userWallet
    };
  } catch (error) {
    throw new Error(`Failed to transfer CGT tokens: ${error.message}`);
  }
}

// Get CGT balance for a wallet
export async function getCgtBalance(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    const cgtMint = new PublicKey(TOKEN_CONFIG.CGT_MINT);
    const tokenAccount = await getAssociatedTokenAddress(cgtMint, publicKey);
    
    try {
      const accountInfo = await getAccount(connection, tokenAccount);
      const mintInfo = await getMint(connection, cgtMint);
      return Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
    } catch (error) {
      return 0;
    }
  } catch (error) {
    throw new Error(`Failed to get CGT balance: ${error.message}`);
  }
}

export default {
  isPresaleActive,
  calculateCgtAmount,
  ensureTokenAccount,
  transferCgtTokens,
  getCgtBalance,
  TOKEN_CONFIG
}; 