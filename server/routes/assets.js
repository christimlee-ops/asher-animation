const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

const VALID_CATEGORIES = ['sounds', 'characters', 'backgrounds', 'other'];

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

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/webm',
      'audio/x-m4a', 'audio/mp3',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image and audio files are allowed'));
    }
  }
});

// Ensure category column exists (safe migration)
let migrated = false;
async function ensureCategoryColumn(db) {
  if (migrated) return;
  try {
    await db.execute("SELECT category FROM assets LIMIT 1");
  } catch (_) {
    await db.execute("ALTER TABLE assets ADD COLUMN category VARCHAR(50) DEFAULT 'other'");
  }
  migrated = true;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    await ensureCategoryColumn(req.db);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { filename, originalname, mimetype, size } = req.file;
    const category = VALID_CATEGORIES.includes(req.body.category) ? req.body.category : 'other';
    const [result] = await req.db.execute(
      'INSERT INTO assets (user_id, filename, original_name, mime_type, size, category) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, filename, originalname, mimetype, size, category]
    );
    res.status(201).json({
      asset: { id: result.insertId, filename, original_name: originalname, mime_type: mimetype, size, category, url: `/uploads/${filename}` }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureCategoryColumn(req.db);
    const [rows] = await req.db.execute(
      'SELECT id, filename, original_name, mime_type, size, category, created_at FROM assets WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ assets: rows.map(r => ({ ...r, category: r.category || 'other', url: `/uploads/${r.filename}` })) });
  } catch (err) {
    console.error('List assets error:', err);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    await ensureCategoryColumn(req.db);
    const { category } = req.body;
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    const [rows] = await req.db.execute(
      'SELECT id FROM assets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    await req.db.execute('UPDATE assets SET category = ? WHERE id = ? AND user_id = ?', [category, req.params.id, req.user.id]);
    res.json({ message: 'Category updated', category });
  } catch (err) {
    console.error('Update asset error:', err);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await req.db.execute(
      'SELECT id, filename FROM assets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    const filePath = path.join(__dirname, '..', 'uploads', rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await req.db.execute('DELETE FROM assets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    console.error('Delete asset error:', err);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 10MB.' });
    return res.status(400).json({ error: err.message });
  }
  if (err.message && (err.message.includes('Only image') || err.message.includes('Only SVG'))) return res.status(400).json({ error: err.message });
  next(err);
});

module.exports = router;
