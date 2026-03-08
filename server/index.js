require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const assetRoutes = require('./routes/assets');

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/assets', assetRoutes);

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
  console.log(`Server running on port ${PORT}`);
});
