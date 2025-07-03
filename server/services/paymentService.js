import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
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

// Get token mint address for payment token
function getTokenMint(tokenType) {
  switch (tokenType.toUpperCase()) {
    case 'USDT':
      return new PublicKey(tokenService.TOKEN_CONFIG.USDT_MINT);
    case 'USDC':
      return new PublicKey(tokenService.TOKEN_CONFIG.USDC_MINT);
    default:
      throw new Error('Invalid token type');
  }
}

// Create payment transaction
export async function createPayment(wallet, amount, tokenType) {
  try {
    if (!tokenService.isPresaleActive()) {
      throw new Error('Presale is not active');
    }

    const userPublicKey = new PublicKey(wallet);
    const receiverPublicKey = new PublicKey(tokenService.TOKEN_CONFIG.PAYMENT_RECEIVER);
    
    // Calculate CGT amount
    const cgtAmount = tokenService.calculateCgtAmount(amount, tokenType);
    
    // Create appropriate transaction based on token type
    let transaction;
    if (tokenType.toUpperCase() === 'SOL') {
      transaction = await createSolPayment(userPublicKey, receiverPublicKey, amount);
    } else {
      transaction = await createSplTokenPayment(userPublicKey, receiverPublicKey, amount, tokenType);
    }
    
    // Convert transaction to base64 for transport
    const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
    
    return {
      transaction: serializedTransaction,
      cgtAmount,
      paymentAmount: amount,
      paymentToken: tokenType
    };
  } catch (error) {
    throw new Error(`Failed to create payment: ${error.message}`);
  }
}

// Create SOL payment transaction
async function createSolPayment(fromPubkey, toPubkey, amount) {
  const connection = new Connection(tokenService.RPC_ENDPOINTS[0], 'confirmed');
  const transaction = new Transaction();
  
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: amount * LAMPORTS_PER_SOL
    })
  );
  
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;
  
  return transaction;
}

// Create SPL token payment transaction
async function createSplTokenPayment(fromPubkey, toPubkey, amount, tokenType) {
  const connection = new Connection(tokenService.RPC_ENDPOINTS[0], 'confirmed');
  const tokenMint = getTokenMint(tokenType);
  
  // Get token accounts
  const fromTokenAccount = await getAssociatedTokenAddress(tokenMint, fromPubkey);
  const toTokenAccount = await getAssociatedTokenAddress(tokenMint, toPubkey);
  
  const transaction = new Transaction();
  
  // Create receiver's token account if it doesn't exist
  try {
    await connection.getAccountInfo(toTokenAccount);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        fromPubkey,
        toTokenAccount,
        toPubkey,
        tokenMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  
  // Add transfer instruction
  const decimals = tokenType.toUpperCase() === 'USDT' ? 6 : 6; // Both USDT and USDC use 6 decimals
  const tokenAmount = Math.floor(amount * Math.pow(10, decimals));
  
  transaction.add(
    createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      fromPubkey,
      tokenAmount,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;
  
  return transaction;
}

// Verify payment transaction
export async function verifyPayment(signature, wallet, amount, tokenType) {
  try {
    const connection = new Connection(tokenService.RPC_ENDPOINTS[0], 'confirmed');
    
    // Wait for transaction confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    if (!confirmation?.value?.err) {
      // Calculate CGT amount to transfer
      const cgtAmount = tokenService.calculateCgtAmount(amount, tokenType);
      
      // Transfer CGT tokens
      const transferResult = await tokenService.transferCgtTokens(wallet, cgtAmount);
      
      return {
        success: true,
        signature: transferResult.signature,
        cgtAmount,
        recipient: wallet
      };
    }
    
    throw new Error('Transaction verification failed');
  } catch (error) {
    throw new Error(`Payment verification failed: ${error.message}`);
  }
}

export default {
  createPayment,
  verifyPayment,
  PAYMENT_CONFIG
}; 