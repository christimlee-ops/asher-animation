const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// GET / - list projects for current user
router.get('/', async (req, res) => {
  try {
    const [rows] = await req.db.execute(
      'SELECT id, name, thumbnail, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ projects: rows });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /:id - get full project data
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await req.db.execute(
      'SELECT id, user_id, name, data, thumbnail, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project: rows[0] });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST / - create new project
router.post('/', async (req, res) => {
  try {
    const { name, data, thumbnail } = req.body;

    const [result] = await req.db.execute(
      'INSERT INTO projects (user_id, name, data, thumbnail) VALUES (?, ?, ?, ?)',
      [req.user.id, name || 'Untitled', JSON.stringify(data || null), thumbnail || null]
    );

    res.status(201).json({
      project: {
        id: result.insertId,
        name: name || 'Untitled',
        data: data || null,
        thumbnail: thumbnail || null
      }
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /:id - update project
router.put('/:id', async (req, res) => {
  try {
    const { name, data, thumbnail } = req.body;

    const [existing] = await req.db.execute(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (data !== undefined) { updates.push('data = ?'); values.push(JSON.stringify(data)); }
    if (thumbnail !== undefined) { updates.push('thumbnail = ?'); values.push(thumbnail); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(process.env.DB_TYPE === 'mysql' ? "updated_at = NOW()" : "updated_at = datetime('now')");
    values.push(req.params.id, req.user.id);

    await req.db.execute(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    res.json({ message: 'Project updated' });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await req.db.execute(
      'DELETE FROM projects WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
