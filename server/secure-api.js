import express from 'express'
import cors from 'cors'
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token'
import bs58 from 'bs58'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import tokenService from './services/tokenService.js'
import paymentService from './services/paymentService.js'

const app = express()

// Get allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://app.coinguard.ai', 'https://coinguard.ai', 'http://localhost:5173'];

// SECURITY: Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "http://localhost:*", "https:", "wss:", "ws:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false
}))

// SECURITY: Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/', limiter)

// SECURITY: CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      console.warn('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24 hours
}))

app.use(express.json({ limit: '1mb' }))

// SECURE SERVER-SIDE CONFIGURATION (Private keys never leave server)
const SERVER_CONFIG = {
  CGT_MINT: process.env.CGT_MINT_ADDRESS,
  TREASURY_PUBLIC_KEY: process.env.CGT_TREASURY_PUBLIC_KEY,
  TREASURY_PRIVATE_KEY: process.env.CGT_TREASURY_PRIVATE_KEY,
  PAYMENT_RECEIVER: process.env.PAYMENT_RECEIVER_WALLET,
  CGT_DECIMALS: parseInt(process.env.CGT_DECIMALS) || 9,
  
  // Validation
  MAX_TRANSFER_AMOUNT: 1000000, // Maximum CGT per transaction
  MIN_TRANSFER_AMOUNT: 1, // Minimum CGT per transaction
  
  // Allowed wallets (if needed for extra security)
  ALLOWED_RECIPIENTS: process.env.ALLOWED_RECIPIENTS?.split(',') || []
}

// Validate server configuration on startup
function validateServerConfig() {
  const required = ['CGT_MINT', 'TREASURY_PUBLIC_KEY', 'TREASURY_PRIVATE_KEY', 'PAYMENT_RECEIVER']
  
  for (const key of required) {
    if (!SERVER_CONFIG[key]) {
      throw new Error(`Missing required server configuration: ${key}`)
    }
  }
  
  // Validate private key format
  try {
    bs58.decode(SERVER_CONFIG.TREASURY_PRIVATE_KEY)
  } catch (error) {
    throw new Error('Invalid treasury private key format')
  }
}

// RPC Connection with fallbacks
const RPC_ENDPOINTS = [
  process.env.SOLANA_RPC_PRIMARY || 'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana'
]

let connection = new Connection(RPC_ENDPOINTS[0], 'confirmed')

async function getSecureConnection() {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const testConnection = new Connection(endpoint, 'confirmed')
      await testConnection.getLatestBlockhash('confirmed')
      connection = testConnection
      return testConnection
    } catch (error) {
      continue
    }
  }
  throw new Error('All RPC endpoints failed')
}

// SECURE: Get treasury keypair (server-side only)
function getTreasuryKeypair() {
  try {
    return Keypair.fromSecretKey(bs58.decode(SERVER_CONFIG.TREASURY_PRIVATE_KEY))
  } catch (error) {
    throw new Error('Invalid treasury private key')
  }
}

// SECURE: Validate wallet address
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

// SECURE: CGT Token Transfer API (server-side only)
app.post('/api/transfer-cgt', async (req, res) => {
  try {
    const { recipientWallet, amount, timestamp } = req.body
    
    // SECURITY: Input validation
    if (!recipientWallet || !amount || !timestamp) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters' 
      })
    }
    
    // SECURITY: Validate wallet address
    if (!isValidSolanaAddress(recipientWallet)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid wallet address' 
      })
    }
    
    // SECURITY: Validate amount
    const transferAmount = parseFloat(amount)
    if (isNaN(transferAmount) || transferAmount < SERVER_CONFIG.MIN_TRANSFER_AMOUNT || transferAmount > SERVER_CONFIG.MAX_TRANSFER_AMOUNT) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid transfer amount' 
      })
    }
    
    // SECURITY: Check timestamp (prevent replay attacks)
    const requestTime = parseInt(timestamp)
    const currentTime = Date.now()
    if (Math.abs(currentTime - requestTime) > 300000) { // 5 minutes
      return res.status(400).json({ 
        success: false, 
        error: 'Request expired' 
      })
    }
    
    // SECURITY: Optional whitelist check
    if (SERVER_CONFIG.ALLOWED_RECIPIENTS.length > 0 && !SERVER_CONFIG.ALLOWED_RECIPIENTS.includes(recipientWallet)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Recipient not authorized' 
      })
    }
    
    // Execute secure transfer
    const result = await executeSecureCgtTransfer(recipientWallet, transferAmount)
    res.json(result)
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    })
  }
})

// SECURE: Execute CGT transfer (server-side private key operations)
async function executeSecureCgtTransfer(recipientWallet, cgtAmount) {
  try {
    const secureConnection = await getSecureConnection()
    const treasuryKeypair = getTreasuryKeypair()
    const recipientPublicKey = new PublicKey(recipientWallet)
    const cgtMint = new PublicKey(SERVER_CONFIG.CGT_MINT)
    
    // Get mint info for accurate decimals
    const mintInfo = await getMint(secureConnection, cgtMint)
    const actualDecimals = mintInfo.decimals
    
    // Get token accounts
    const treasuryTokenAccount = await getAssociatedTokenAddress(cgtMint, treasuryKeypair.publicKey)
    const recipientTokenAccount = await getAssociatedTokenAddress(cgtMint, recipientPublicKey)
    
    // Ensure recipient token account exists
    const transaction = new Transaction()
    
    try {
      await getAccount(secureConnection, recipientTokenAccount)
    } catch (error) {
      // Create associated token account if it doesn't exist
      transaction.add(
        createAssociatedTokenAccountInstruction(
          treasuryKeypair.publicKey,
          recipientTokenAccount,
          recipientPublicKey,
          cgtMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )
    }
    
    // Add transfer instruction
    const transferAmount = Math.floor(cgtAmount * Math.pow(10, actualDecimals))
    transaction.add(
      createTransferInstruction(
        treasuryTokenAccount,
        recipientTokenAccount,
        treasuryKeypair.publicKey,
        transferAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    )
    
    // Execute transaction
    const signature = await sendAndConfirmTransaction(
      secureConnection,
      transaction,
      [treasuryKeypair],
      { commitment: 'confirmed' }
    )
    
    return {
      success: true,
      signature,
      amount: cgtAmount,
      recipient: recipientWallet,
      timestamp: Date.now()
    }
    
  } catch (error) {
    return {
      success: false,
      error: 'Transfer execution failed'
    }
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'secure', timestamp: Date.now() })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start server
const PORT = process.env.PORT || 3001

// Validate configuration before starting
try {
  validateServerConfig()
  // Server configuration validated
} catch (error) {
  console.error('❌ Server configuration error:', error.message)
  process.exit(1)
}

app.listen(PORT, '127.0.0.1', () => {
  // Secure API server started
})

// API Routes

// Get presale status
app.get('/api/presale/status', (req, res) => {
  try {
    const isActive = tokenService.isPresaleActive()
    const now = Date.now()
    const start = tokenService.TOKEN_CONFIG.PRESALE_START
    const end = tokenService.TOKEN_CONFIG.PRESALE_END
    
    let status = 'upcoming'
    let message = 'Presale has not started yet'
    let timeLeft = start - now
    
    if (now > end) {
      status = 'ended'
      message = 'Presale has ended'
      timeLeft = 0
    } else if (isActive) {
      status = 'active'
      message = 'Presale is active'
      timeLeft = end - now
    }
    
    res.json({ success: true, status, message, timeLeft })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// Get presale stats
app.get('/api/presale/stats', async (req, res) => {
  try {
    const isActive = tokenService.isPresaleActive();
    const now = Date.now();
    const timeLeft = tokenService.TOKEN_CONFIG.PRESALE_END - now;
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    res.json({
      active: isActive,
      raised: 1200000,
      target: 4000000,
      price: 0.01,
      participants: 1250,
      timeLeft: {
        days,
        hours,
        minutes,
        seconds
      }
    });
  } catch (error) {
    console.error('Error getting presale stats:', error);
    res.status(500).json({ error: 'Failed to get presale stats' });
  }
});

// Get CGT balance
app.get('/api/balance/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const balance = await tokenService.getCgtBalance(wallet);
    res.json({ balance });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Create payment transaction
app.post('/api/payment/create', async (req, res) => {
  try {
    const { wallet, amount, tokenType } = req.body;
    
    if (!wallet || !amount || !tokenType) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const paymentData = await paymentService.createPayment(wallet, amount, tokenType);
    res.json(paymentData);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Verify payment
app.post('/api/payment/verify', async (req, res) => {
  try {
    const { signature, wallet, amount, tokenType } = req.body;
    
    if (!signature || !wallet || !amount || !tokenType) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const verificationResult = await paymentService.verifyPayment(signature, wallet, amount, tokenType);
    res.json(verificationResult);
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Get conversion rates
app.get('/api/rates', async (req, res) => {
  try {
    const rates = {
      SOL: {
        rate: tokenService.TOKEN_CONFIG.SOL_TO_CGT_RATE,
        min: 0.1,
        max: 100
      },
      USDT: {
        rate: tokenService.TOKEN_CONFIG.USDT_TO_CGT_RATE,
        min: 10,
        max: 50000
      },
      USDC: {
        rate: tokenService.TOKEN_CONFIG.USDC_TO_CGT_RATE,
        min: 10,
        max: 50000
      }
    };
    
    res.json(rates);
  } catch (error) {
    console.error('Error getting rates:', error);
    res.status(500).json({ error: 'Failed to get conversion rates' });
  }
});

export default app 