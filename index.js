import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import api from './server/secure-api.js';
import app from './app.js';
import tokenService from './server/services/tokenService.js';

// Load environment variables
dotenv.config();

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;

// Initialize services
async function initializeServer() {
  try {
    // Initialize token service (RPC connection, etc.)
    await tokenService.initializeConnection();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('✅ Token service initialized');
      console.log(`💫 CGT Mint: ${process.env.CGT_MINT_ADDRESS}`);
      console.log(`🏦 Payment Receiver: ${process.env.PAYMENT_RECEIVER_WALLET}`);
      console.log(`⏰ Presale Start: ${new Date(tokenService.TOKEN_CONFIG.PRESALE_START).toLocaleString()}`);
      console.log(`⏰ Presale End: ${new Date(tokenService.TOKEN_CONFIG.PRESALE_END).toLocaleString()}`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

// Start server with initialization
initializeServer();

// Basic middleware
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', api);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV
  });
});

// Welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to CoinGuard API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/health',
      api: '/api/*'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404
    }
  });
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n🛑 Initiating graceful shutdown...');
  app.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
