// api.js — thin wrapper around fetch() that attaches the JWT and centralizes
// error handling, plus a helper to open the Socket.io real-time channel.
// Loaded as a plain <script> (no build step) so the whole frontend can run
// by just opening/serving static files — no bundler needed for a student demo.

const API_BASE = ''; // same-origin: backend serves these files directly

const Auth = {
  getToken: () => localStorage.getItem('sp_token'),
  getUser: () => JSON.parse(localStorage.getItem('sp_user') || 'null'),
  setSession: (token, user) => {
    localStorage.setItem('sp_token', token);
    localStorage.setItem('sp_user', JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem('sp_token');
    localStorage.removeItem('sp_user');
  },
  isLoggedIn: () => !!localStorage.getItem('sp_token'),
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && Auth.getToken()) headers.Authorization = `Bearer ${Auth.getToken()}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) Auth.clearSession();
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function connectSlotSocket(onSlotUpdate) {
  // socket.io client is loaded via <script src="/socket.io/socket.io.js">,
  // served automatically by the Socket.io server — no separate install needed.
  const socket = io();
  socket.on('slotUpdate', onSlotUpdate);
  return socket;
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
