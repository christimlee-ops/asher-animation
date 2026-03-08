// Passenger-compatible entry point for Plesk Node.js hosting
// .cjs extension required because root package.json has "type": "module"

const path = require('path');
const fs = require('fs');

// Load .env from server/ or project root
const serverEnv = path.join(__dirname, 'server', '.env');
const rootEnv = path.join(__dirname, '.env');
require('dotenv').config({ path: fs.existsSync(serverEnv) ? serverEnv : rootEnv });

const express = require('express');
const cors = require('cors');
const dbReady = require('./server/db');

const app = express();

// CORS — only needed in dev
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  }));
}

// Body parsing with 50mb limit for project data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security / meta headers
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Static file serving for uploaded assets
app.use('/uploads', express.static(path.join(__dirname, 'server', 'uploads')));

// MIME type map
const mimeTypes = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// Serve Vite-built frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
  },
}));

// Wait for DB, then mount API routes
dbReady.then((db) => {
  app.use((req, res, next) => {
    req.db = db;
    next();
  });

  app.use('/api/auth', require('./server/routes/auth'));
  app.use('/api/projects', require('./server/routes/projects'));
  app.use('/api/assets', require('./server/routes/assets'));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.setHeader('Content-Type', 'text/html');
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server — use PORT from Passenger or fallback
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
