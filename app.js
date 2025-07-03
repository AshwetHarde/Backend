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
const PORT = process.env.PORT || 3001;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

// Parse allowed origins from env
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['https://app.coinguard.ai', 'https://coinguard.ai', 'http://localhost:5173'];

// Configure CORS with environment variables
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.use(api);

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    path: req.file.path
  });
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

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else if (fs.existsSync(distPath)) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Frontend not built' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' ? 
      'Internal server error' : 
      err.message 
  });
});

// Function to start server
function startServer(port) {
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, HOST, () => {
        console.log(`🚀 CoinGuard Backend Server running on http://${HOST}:${port}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
        console.log(`🔒 Allowed Origins: ${ALLOWED_ORIGINS.join(', ')}`);
        console.log('\n📡 Available endpoints:');
        console.log(' Presale statistics');
        console.log('   GET  /api/leaderboard - Top investors');
        console.log('   POST /api/upload - File upload');
        resolve(server);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`⚠️ Port ${port} is busy, trying ${port + 1}...`);
          startServer(port + 1).then(resolve).catch(reject);
        } else {
          console.error('Server error:', error);
          reject(error);
        }
      });

      // Store server instance for graceful shutdown
      global.server = server;
    } catch (error) {
      console.error('Failed to start server:', error);
      reject(error);
    }
  });
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal. Shutting down gracefully...');
  if (global.server) {
    global.server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('Received SIGINT signal. Shutting down gracefully...');
  if (global.server) {
    global.server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Start the server
startServer(PORT).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
}); 