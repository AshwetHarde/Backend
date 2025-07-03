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
const PORT = process.env.PORT || 10000;

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use(api);

// Health check for Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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

app.get('/',(req,res)=>{
  res.send('welcome.....')
})

// // Start server
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// }); 

