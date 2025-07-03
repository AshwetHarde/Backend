import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import api from './server/secure-api.js';

// Load environment variables
dotenv.config();

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CRITICAL: Strict port handling for Render
if (!process.env.PORT) {
  console.error('❌ Fatal: No PORT environment variable provided by Render');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT, 10);
if (isNaN(PORT)) {
  console.error('❌ Fatal: PORT environment variable is not a valid number');
  process.exit(1);
}

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use(api);

// Health check endpoint required by Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    port: PORT,
    env: process.env.NODE_ENV
  });
});

// Basic routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

app.get('/api/presale/stats', (req, res) => {
  res.json({
    raised: 1200000,
    target: 4000000,
    price: 0.01,
    participants: 1250,
    timeLeft: {
      days: 180,
      hours: 12,
      minutes: 30,
      seconds: 45
    }
  });
});

app.get('/api/leaderboard', (req, res) => {
  const mockLeaderboard = [];
  
  const generateSolanaAddress = () => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const start = Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const end = Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${start}...${end}`;
  };
  
  for (let i = 1; i <= 50; i++) {
    let amount;
    if (i <= 10) {
      amount = 85000 - (i - 1) * 7000; 
    } else {
      amount = 19500 - (i - 11) * 350; 
    }
    
    mockLeaderboard.push({
      rank: i,
      address: generateSolanaAddress(),
      amount: amount
    });
  }
  
  res.json(mockLeaderboard);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server with strict error handling and retry logic
const startServer = async (retryCount = 0) => {
  try {
    // Check if port is available
    const net = await import('net');
    const tester = new net.Socket();
    
    await new Promise((resolve, reject) => {
      tester.once('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          // Port is available
          resolve();
        } else {
          reject(err);
        }
      });
      
      tester.once('connect', () => {
        tester.end();
        reject(new Error('Port is in use'));
      });
      
      tester.connect({ port: PORT, host: '0.0.0.0' });
    });

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('----------------------------------------');
      console.log(`✅ Server successfully started`);
      console.log(`🚀 Running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('----------------------------------------');
    });

    server.on('error', async (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        if (retryCount < 3) {
          console.log(`⏳ Waiting 10 seconds before retry attempt ${retryCount + 1}/3...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          await startServer(retryCount + 1);
        } else {
          console.error('❌ Fatal: Maximum retry attempts reached');
          process.exit(1);
        }
      } else {
        console.error('❌ Fatal: Server error:', error.message);
        process.exit(1);
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('\n🛑 Initiating graceful shutdown...');
      server.close(() => {
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

  } catch (error) {
    if (retryCount < 3) {
      console.error(`❌ Failed to start server: ${error.message}`);
      console.log(`⏳ Waiting 10 seconds before retry attempt ${retryCount + 1}/3...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      await startServer(retryCount + 1);
    } else {
      console.error('❌ Fatal: Failed to start server after maximum retries:', error.message);
      process.exit(1);
    }
  }
};

// Start the server
startServer().catch(error => {
  console.error('❌ Fatal: Unhandled error during server startup:', error.message);
  process.exit(1);
}); 