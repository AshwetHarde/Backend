import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import api from './server/secure-api.js';

// Load environment variables
dotenv.config();

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CRITICAL: Strict port handling for Render
if (!process.env.PORT) {
  console.error('❌ Fatal: No PORT environment variable provided');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT, 10);
if (isNaN(PORT)) {
  console.error('❌ Fatal: PORT environment variable is not a valid number');
  process.exit(1);
}

// Basic middleware
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

// Start server with strict error handling
try {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('----------------------------------------');
    console.log(`✅ Server successfully started`);
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('----------------------------------------');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Fatal: Port ${PORT} is already in use`);
      console.error('This is likely because another instance is already running');
      process.exit(1);
    }
    console.error('❌ Fatal: Server error:', error.message);
    process.exit(1);
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
  console.error('❌ Fatal: Failed to start server:', error.message);
  process.exit(1);
}

export default app;
