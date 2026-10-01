const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — admin only.
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// PATCH /api/users/:id/role — admin only. Promote/demote a user.
router.patch('/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['customer', 'admin'].includes(role)) {
    return res.status(400).json({ error: "role must be 'customer' or 'admin'." });
  }
  const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.params.id));
});

// DELETE /api/users/:id — admin only.
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account while logged in." });
  }
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.status(204).end();
});

module.exports = router;
