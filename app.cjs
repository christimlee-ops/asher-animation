// Passenger-compatible entry point for Plesk Node.js hosting
// .cjs extension required because root package.json has "type": "module"

const path = require('path');
const fs = require('fs');

// Resolve modules from server/node_modules since deps live there
const serverDir = path.join(__dirname, 'server');
const resolve = (mod) => require(require.resolve(mod, { paths: [serverDir] }));

// Load .env from server/ or project root
const serverEnv = path.join(serverDir, '.env');
const rootEnv = path.join(__dirname, '.env');
resolve('dotenv').config({ path: fs.existsSync(serverEnv) ? serverEnv : rootEnv });

const express = resolve('express');
const cors = resolve('cors');
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
console.log('dist path:', distPath, 'exists:', fs.existsSync(distPath));
if (fs.existsSync(distPath)) {
  console.log('dist contents:', fs.readdirSync(distPath).join(', '));
}

app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
  },
}));

// Debug endpoint
let dbError = null;
app.get('/api/debug', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.json({
    distPath,
    distExists: fs.existsSync(distPath),
    indexExists: fs.existsSync(indexPath),
    dirname: __dirname,
    distContents: fs.existsSync(distPath) ? fs.readdirSync(distPath) : [],
    env: process.env.NODE_ENV,
    dbConnected: !!dbRef,
    dbError: dbError ? dbError.message : null,
    dbType: process.env.DB_TYPE || 'sqlite',
    dbHost: process.env.DB_HOST || 'not set',
    dbName: process.env.DB_NAME || 'not set',
    envFile: fs.existsSync(path.join(__dirname, 'server', '.env')) ? 'server/.env' : fs.existsSync(path.join(__dirname, '.env')) ? '.env' : 'none found',
  });
});

// DB-dependent middleware: store db reference once ready
let dbRef = null;
dbReady.then((db) => {
  dbRef = db;
  console.log('Database connected');
}).catch((err) => {
  dbError = err;
  console.error('Failed to initialize database:', err);
});

// Make db available to routes (waits for connection)
app.use((req, res, next) => {
  if (!dbRef && req.path.startsWith('/api')) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  req.db = dbRef;
  next();
});

// Debug: test login flow
app.get('/api/debug-login', async (req, res) => {
  try {
    const [rows] = await dbRef.execute(
      'SELECT id, username, email, password_hash FROM users WHERE LOWER(username) = ?',
      ['asher']
    );
    res.json({
      userFound: rows.length > 0,
      user: rows[0] ? { id: rows[0].id, username: rows[0].username, email: rows[0].email, hashLength: rows[0].password_hash?.length } : null,
      jwtSecretSet: !!process.env.JWT_SECRET,
    });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack });
  }
});

// API routes
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/projects', require('./server/routes/projects'));
app.use('/api/assets', require('./server/routes/assets'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', dbReady: !!dbRef });
});

// SPA fallback — must be after API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html');
      res.sendFile(indexPath);
    } else {
      res.status(404).send('index.html not found at ' + indexPath);
    }
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
