const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.id}-${uniqueSuffix}${ext}`);
  }
});

const allowedMimes = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/gif'
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only SVG, PNG, JPG, and GIF files are allowed'));
    }
  }
});

// POST /upload - upload a file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, originalname, mimetype, size } = req.file;

    const [result] = await pool.execute(
      'INSERT INTO assets (user_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, filename, originalname, mimetype, size]
    );

    res.status(201).json({
      asset: {
        id: result.insertId,
        filename,
        original_name: originalname,
        mime_type: mimetype,
        size,
        url: `/uploads/${filename}`
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET / - list user's assets
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, filename, original_name, mime_type, size, created_at FROM assets WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    const assets = rows.map(row => ({
      ...row,
      url: `/uploads/${row.filename}`
    }));

    res.json({ assets });
  } catch (err) {
    console.error('List assets error:', err);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// DELETE /:id - delete asset
router.delete('/:id', async (req, res) => {
  try {
    // Get asset info first
    const [rows] = await pool.execute(
      'SELECT id, filename FROM assets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = rows[0];

    // Delete file from disk
    const filePath = path.join(__dirname, '..', 'uploads', asset.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await pool.execute(
      'DELETE FROM assets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    res.json({ message: 'Asset deleted' });
  } catch (err) {
    console.error('Delete asset error:', err);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Handle multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Only SVG')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
