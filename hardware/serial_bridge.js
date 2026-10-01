// serial_bridge.js — runs on the computer physically connected to the
// Arduino (over USB). Reads the "SLOT:<n>,<STATUS>" lines the sketch
// prints and PATCHes the backend, which then broadcasts the change to
// every open browser tab over Socket.io.
//
// Run with the backend already up, then: node serial_bridge.js
// Configure via environment variables (see hardware/.env.example).

require('dotenv').config();
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const SERIAL_PORT = process.env.SERIAL_PORT; // e.g. /dev/ttyUSB0 or COM3
const BAUD_RATE = Number(process.env.BAUD_RATE || 9600);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@parking.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Maps the Arduino's own slot number (1, 2, 3...) to the real slot `id`
// in the database. Check these ids with: GET /api/locations/:id/slots
const SLOT_MAP = JSON.parse(process.env.SLOT_MAP || '{"1": 1, "2": 2}');

let authToken = null;

async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  authToken = data.token;
  console.log(`Authenticated as ${data.user.email} (${data.user.role}).`);
}

async function reportStatus(dbSlotId, status) {
  const res = await fetch(`${API_BASE}/api/slots/${dbSlotId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    console.error(`Failed to update slot ${dbSlotId}: ${res.status} ${await res.text()}`);
    return;
  }
  console.log(`Slot ${dbSlotId} -> ${status}`);
}

function parseLine(line) {
  // Expected: "SLOT:1,OCCUPIED" or "SLOT:1,AVAILABLE"
  const match = line.trim().match(/^SLOT:(\d+),(OCCUPIED|AVAILABLE)$/);
  if (!match) return null;
  return { arduinoSlot: match[1], status: match[2].toLowerCase() };
}

async function main() {
  if (!SERIAL_PORT) {
    console.error('Set SERIAL_PORT in hardware/.env (e.g. SERIAL_PORT=/dev/ttyUSB0 or COM3).');
    process.exit(1);
  }

  await login();

  const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.on('open', () => console.log(`Listening on ${SERIAL_PORT} @ ${BAUD_RATE} baud...`));
  port.on('error', (err) => console.error('Serial port error:', err.message));

  parser.on('data', async (rawLine) => {
    const parsed = parseLine(rawLine);
    if (!parsed) {
      console.log(`Ignoring unrecognized line: ${rawLine}`);
      return;
    }
    const dbSlotId = SLOT_MAP[parsed.arduinoSlot];
    if (!dbSlotId) {
      console.log(`No SLOT_MAP entry for Arduino slot ${parsed.arduinoSlot} — skipping.`);
      return;
    }
    try {
      await reportStatus(dbSlotId, parsed.status);
    } catch (err) {
      console.error('Failed to reach backend:', err.message);
    }
  });
}

main();
