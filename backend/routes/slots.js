const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const VALID_STATUSES = ['available', 'occupied', 'booked'];

// GET /api/locations/:locationId/slots — public. Current status of every slot.
router.get('/locations/:locationId/slots', (req, res) => {
  const slots = db
    .prepare('SELECT * FROM parking_slots WHERE location_id = ? ORDER BY slot_number')
    .all(req.params.locationId);
  res.json(slots);
});

// POST /api/locations/:locationId/slots — admin only. Add a single slot.
router.post('/locations/:locationId/slots', requireAuth, requireAdmin, (req, res) => {
  const { slotNumber } = req.body;
  if (!slotNumber) return res.status(400).json({ error: 'slotNumber is required.' });

  const { lastInsertRowid } = db
    .prepare('INSERT INTO parking_slots (location_id, slot_number) VALUES (?, ?)')
    .run(req.params.locationId, slotNumber);

  res.status(201).json(db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(lastInsertRowid));
});

// PATCH /api/slots/:id/status — used by BOTH the admin dashboard and the
// Arduino serial bridge (hardware/serial_bridge.js) to report a sensor
// reading. This is the single place slot status changes, and every change
// is broadcast over Socket.io so every open browser tab updates instantly.
router.patch('/slots/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });

  // A sensor reporting "occupied" always wins (a car is physically there).
  // A sensor reporting "available" should NOT clear a manual admin "booked"
  // hold placed for a future reservation — only a booking's own lifecycle
  // (cancel/complete) or an admin should release a booked slot.
  if (req.user.role !== 'admin' && slot.status === 'booked' && status === 'available') {
    return res.status(409).json({ error: 'Slot is booked; cancel the booking to free it.' });
  }

  db.prepare("UPDATE parking_slots SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(req.params.id);
  req.app.get('io').emit('slotUpdate', updated);
  res.json(updated);
});

// DELETE /api/slots/:id — admin only.
router.delete('/slots/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM parking_slots WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Slot not found.' });
  res.status(204).end();
});

module.exports = router;
