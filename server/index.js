require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const dbReady = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Body parsing with 50mb limit for project data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// X-Robots-Tag on all responses
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Static file serving for uploaded assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Wait for DB, then attach to req and mount routes
dbReady.then((db) => {
  // Make db available to routes
  app.use((req, res, next) => {
    req.db = db;
    next();
  });

  // Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/projects', require('./routes/projects'));
  app.use('/api/assets', require('./routes/assets'));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
