// db.js — SQLite connection, schema, and optional demo seed data.
// SQLite is used because it needs no separate database server: the whole
// database lives in one file (parking.db) next to this script, which makes
// the project trivial to run on any machine for a demo or submission.

const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'parking.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parking_locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    address    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parking_slots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES parking_locations(id) ON DELETE CASCADE,
    slot_number TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'booked')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (location_id, slot_number)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id      INTEGER NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
    booking_date TEXT NOT NULL,
    start_time   TEXT NOT NULL,
    end_time     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_slots_location ON parking_slots(location_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id);
`);

// --- Optional demo seed: `node db.js --seed` -------------------------------
function seed() {
  const locationCount = db.prepare('SELECT COUNT(*) AS n FROM parking_locations').get().n;
  if (locationCount > 0) {
    console.log('Database already has data — skipping seed.');
    return;
  }

  const insertLocation = db.prepare('INSERT INTO parking_locations (name, address) VALUES (?, ?)');
  const insertSlot = db.prepare('INSERT INTO parking_slots (location_id, slot_number) VALUES (?, ?)');

  const seedTx = db.transaction(() => {
    const locations = [
      { name: 'SRM Tech Park', address: 'SRM IST, Tiruchirappalli', slots: 8 },
      { name: 'City Centre Mall', address: 'Ring Road, Trichy', slots: 6 },
    ];

    for (const loc of locations) {
      const { lastInsertRowid: locationId } = insertLocation.run(loc.name, loc.address);
      for (let i = 1; i <= loc.slots; i++) {
        insertSlot.run(locationId, `${String.fromCharCode(64 + Math.ceil(i / 4))}${i}`);
      }
    }

    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run('Admin', 'admin@parking.local', passwordHash, 'admin');
  });

  seedTx();
  console.log('Seeded 2 locations, 14 slots, and an admin user (admin@parking.local / admin123).');
}

if (require.main === module && process.argv.includes('--seed')) {
  seed();
}

module.exports = db;
