const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/locations — public. Includes a live slot-status summary per location
// so the customer site can show "5 available" without a second round trip.
router.get('/', (req, res) => {
  const locations = db.prepare('SELECT * FROM parking_locations ORDER BY name').all();

  const summaryStmt = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
      SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) AS booked
    FROM parking_slots WHERE location_id = ?
  `);

  const withSummary = locations.map((loc) => ({
    ...loc,
    slotSummary: summaryStmt.get(loc.id),
  }));

  res.json(withSummary);
});

// POST /api/locations — admin only. Creates a location and its initial slots.
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, address, slotCount } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'name and address are required.' });
  }

  const count = Math.max(0, Math.min(200, Number(slotCount) || 0));

  const tx = db.transaction(() => {
    const { lastInsertRowid: locationId } = db
      .prepare('INSERT INTO parking_locations (name, address) VALUES (?, ?)')
      .run(name, address);

    const insertSlot = db.prepare('INSERT INTO parking_slots (location_id, slot_number) VALUES (?, ?)');
    for (let i = 1; i <= count; i++) {
      insertSlot.run(locationId, `${String.fromCharCode(64 + Math.ceil(i / 4))}${i}`);
    }

    return locationId;
  });

  const locationId = tx();
  const location = db.prepare('SELECT * FROM parking_locations WHERE id = ?').get(locationId);
  res.status(201).json(location);
});

// PATCH /api/locations/:id — admin only. Rename / re-address a location.
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, address } = req.body;
  const location = db.prepare('SELECT * FROM parking_locations WHERE id = ?').get(req.params.id);
  if (!location) return res.status(404).json({ error: 'Location not found.' });

  db.prepare('UPDATE parking_locations SET name = ?, address = ? WHERE id = ?').run(
    name || location.name,
    address || location.address,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM parking_locations WHERE id = ?').get(req.params.id));
});

// DELETE /api/locations/:id — admin only. Cascades to its slots and bookings.
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM parking_locations WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Location not found.' });
  res.status(204).end();
});

module.exports = router;
