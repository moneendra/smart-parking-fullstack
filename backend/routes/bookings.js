const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/bookings — create a booking for the logged-in user.
//
// Race-condition note: better-sqlite3 runs every statement SYNCHRONOUSLY,
// and Node.js executes JavaScript on a single thread. That means once this
// handler starts its db.transaction(), no other request can interleave and
// read a stale "available" status before this one commits — two people
// tapping "book" on the same slot at the same instant cannot both win.
router.post('/', requireAuth, (req, res) => {
  const { slotId, bookingDate, startTime, endTime } = req.body;
  if (!slotId || !bookingDate || !startTime || !endTime) {
    return res.status(400).json({ error: 'slotId, bookingDate, startTime, and endTime are required.' });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: 'startTime must be before endTime.' });
  }

  const bookSlotTx = db.transaction(() => {
    const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(slotId);
    if (!slot) {
      return { error: 404, message: 'Slot not found.' };
    }
    if (slot.status !== 'available') {
      return { error: 409, message: `Slot ${slot.slot_number} is currently ${slot.status}, not available.` };
    }

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO bookings (user_id, slot_id, booking_date, start_time, end_time, status)
         VALUES (?, ?, ?, ?, ?, 'confirmed')`
      )
      .run(req.user.id, slotId, bookingDate, startTime, endTime);

    db.prepare("UPDATE parking_slots SET status = 'booked', updated_at = datetime('now') WHERE id = ?").run(
      slotId
    );

    return { bookingId: lastInsertRowid };
  });

  const result = bookSlotTx();
  if (result.error) {
    return res.status(result.error).json({ error: result.message });
  }

  const booking = db
    .prepare(
      `SELECT b.*, s.slot_number, l.name AS location_name
       FROM bookings b
       JOIN parking_slots s ON s.id = b.slot_id
       JOIN parking_locations l ON l.id = s.location_id
       WHERE b.id = ?`
    )
    .get(result.bookingId);

  req.app.get('io').emit('slotUpdate', db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(slotId));
  res.status(201).json(booking);
});

// GET /api/bookings/me — the logged-in user's booking history.
router.get('/me', requireAuth, (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, s.slot_number, l.name AS location_name
       FROM bookings b
       JOIN parking_slots s ON s.id = b.slot_id
       JOIN parking_locations l ON l.id = s.location_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.user.id);
  res.json(bookings);
});

// PATCH /api/bookings/:id/cancel — cancel a booking (owner or admin).
router.patch('/:id/cancel', requireAuth, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only cancel your own bookings.' });
  }
  if (booking.status !== 'confirmed') {
    return res.status(409).json({ error: `Booking is already ${booking.status}.` });
  }

  const cancelTx = db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
    // Only free the slot if a sensor hasn't since reported a car physically parked there.
    const slot = db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(booking.slot_id);
    if (slot && slot.status === 'booked') {
      db.prepare("UPDATE parking_slots SET status = 'available', updated_at = datetime('now') WHERE id = ?").run(
        booking.slot_id
      );
    }
  });
  cancelTx();

  req.app.get('io').emit('slotUpdate', db.prepare('SELECT * FROM parking_slots WHERE id = ?').get(booking.slot_id));
  res.json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id));
});

// GET /api/bookings — admin only. Every booking, across all users.
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, u.name AS user_name, u.email AS user_email, s.slot_number, l.name AS location_name
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN parking_slots s ON s.id = b.slot_id
       JOIN parking_locations l ON l.id = s.location_id
       ORDER BY b.created_at DESC`
    )
    .all();
  res.json(bookings);
});

module.exports = router;
