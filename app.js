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

// Let Render assign the port
const PORT = process.env.PORT || 8080;

// Configure CORS for production
app.use(cors({
  origin: ['https://app.coinguard.ai', 'https://coinguard.ai'],
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

// Simple error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error'
  });
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Start server - bind to 0.0.0.0 for Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
}); 