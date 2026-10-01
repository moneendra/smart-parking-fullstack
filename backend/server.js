require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const locationRoutes = require('./routes/locations');
const slotRoutes = require('./routes/slots');
const bookingRoutes = require('./routes/bookings');
const userRoutes = require('./routes/users');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('io', io);
app.use(cors());
app.use(express.json());

// --- API routes -------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api', slotRoutes); // exposes /api/locations/:id/slots and /api/slots/:id/status
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// --- Frontend (static) -------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// --- Socket.io: just a broadcast channel; clients only listen for 'slotUpdate' --
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Smart Parking backend running at http://localhost:${PORT}`);
  console.log(`Customer site:  http://localhost:${PORT}/index.html`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
});
