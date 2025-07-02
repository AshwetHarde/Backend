import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import tokenService from './tokenService.js';

// RPC Connection setup
const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

// Payment configuration
const PAYMENT_CONFIG = {
  RECEIVER_WALLET: process.env.PAYMENT_RECEIVER_WALLET,
  USDT_MINT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  
  // Minimum amounts in respective tokens
  MIN_SOL: 0.05,
  MIN_USDT: 1,
  MIN_USDC: 1,
  
  // Maximum amounts in respective tokens
  MAX_SOL: 1000,
  MAX_USDT: 50000,
  MAX_USDC: 50000
};

// Validate payment amount
function validatePaymentAmount(amount, tokenType) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Invalid payment amount');
  }
  
  switch (tokenType.toUpperCase()) {
    case 'SOL':
      if (numAmount < PAYMENT_CONFIG.MIN_SOL || numAmount > PAYMENT_CONFIG.MAX_SOL) {
        throw new Error(`SOL amount must be between ${PAYMENT_CONFIG.MIN_SOL} and ${PAYMENT_CONFIG.MAX_SOL}`);
      }
      break;
    case 'USDT':
      if (numAmount < PAYMENT_CONFIG.MIN_USDT || numAmount > PAYMENT_CONFIG.MAX_USDT) {
        throw new Error(`USDT amount must be between ${PAYMENT_CONFIG.MIN_USDT} and ${PAYMENT_CONFIG.MAX_USDT}`);
      }
      break;
    case 'USDC':
      if (numAmount < PAYMENT_CONFIG.MIN_USDC || numAmount > PAYMENT_CONFIG.MAX_USDC) {
        throw new Error(`USDC amount must be between ${PAYMENT_CONFIG.MIN_USDC} and ${PAYMENT_CONFIG.MAX_USDC}`);
      }
      break;
    default:
      throw new Error('Invalid token type');
  }
  
  return true;
}

// Create SOL payment transaction
export async function createSolPayment(fromWallet, solAmount) {
  try {
    validatePaymentAmount(solAmount, 'SOL');
    
    const fromPublicKey = new PublicKey(fromWallet);
    const toPublicKey = new PublicKey(PAYMENT_CONFIG.RECEIVER_WALLET);
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = fromPublicKey;
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: fromPublicKey,
        toPubkey: toPublicKey,
        lamports: Math.floor(solAmount * 1e9)
      })
    );
    
    return {
      transaction: transaction.serialize({ requireAllSignatures: false }),
      expectedCgt: tokenService.calculateCgtAmount(solAmount, 'SOL')
    };
  } catch (error) {
    throw new Error(`Failed to create SOL payment: ${error.message}`);
  }
}

// Create SPL token (USDT/USDC) payment transaction
export async function createSplTokenPayment(fromWallet, amount, tokenType) {
  try {
    validatePaymentAmount(amount, tokenType);
    
    const fromPublicKey = new PublicKey(fromWallet);
    const toPublicKey = new PublicKey(PAYMENT_CONFIG.RECEIVER_WALLET);
    
    const mintAddress = tokenType === 'USDT' ? 
      PAYMENT_CONFIG.USDT_MINT : 
      PAYMENT_CONFIG.USDC_MINT;
    
    const mint = new PublicKey(mintAddress);
    const fromTokenAccount = await getAssociatedTokenAddress(mint, fromPublicKey);
    const toTokenAccount = await getAssociatedTokenAddress(mint, toPublicKey);
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = fromPublicKey;
    
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPublicKey,
        Math.floor(amount * 1e6), // USDT/USDC have 6 decimals
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    return {
      transaction: transaction.serialize({ requireAllSignatures: false }),
      expectedCgt: tokenService.calculateCgtAmount(amount, tokenType)
    };
  } catch (error) {
    throw new Error(`Failed to create ${tokenType} payment: ${error.message}`);
  }
}

// Verify transaction
export async function verifyTransaction(signature) {
  try {
    const result = await connection.confirmTransaction(signature, 'confirmed');
    if (result.value.err) {
      throw new Error('Transaction failed');
    }
    return true;
  } catch (error) {
    throw new Error(`Transaction verification failed: ${error.message}`);
  }
}

export default {
  createSolPayment,
  createSplTokenPayment,
  verifyTransaction,
  PAYMENT_CONFIG
}; 