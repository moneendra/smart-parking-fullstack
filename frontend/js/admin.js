// admin.js — operator dashboard. Requires an admin-role account (the seed
// script creates admin@parking.local / admin123).

const state = {
  locations: [],
  monitoredLocationId: null,
  monitoredSlots: [],
  bookings: [],
  users: [],
};

const app = document.getElementById('app');
const authArea = document.getElementById('auth-area');

async function init() {
  renderAuthArea();
  if (!Auth.isLoggedIn() || Auth.getUser()?.role !== 'admin') {
    return renderGate();
  }
  connectSlotSocket(handleSlotUpdate);
  await loadAll();
  render();
}

async function loadAll() {
  state.locations = await api('/api/locations', { auth: false });
  state.bookings = await api('/api/bookings');
  state.users = await api('/api/users');
  if (!state.monitoredLocationId && state.locations.length) {
    state.monitoredLocationId = state.locations[0].id;
  }
  if (state.monitoredLocationId) {
    state.monitoredSlots = await api(`/api/locations/${state.monitoredLocationId}/slots`, { auth: false });
  }
}

function handleSlotUpdate(updatedSlot) {
  if (updatedSlot.location_id === state.monitoredLocationId) {
    const i = state.monitoredSlots.findIndex((s) => s.id === updatedSlot.id);
    if (i >= 0) state.monitoredSlots[i] = updatedSlot;
  }
  const loc = state.locations.find((l) => l.id === updatedSlot.location_id);
  if (loc) {
    api('/api/locations', { auth: false }).then((locs) => { state.locations = locs; renderStats(); });
  }
  renderMonitor();
}

// --- Gate (not logged in / not admin) ---------------------------------------
function renderGate() {
  app.innerHTML = `
    <div class="panel">
      <h2>Admin sign-in</h2>
      <p style="color:#9a9d9f;">Use the seeded admin account, or any account promoted to admin.</p>
      <form id="gate-form">
        <div class="field"><label for="g-email">Email</label><input id="g-email" type="email" value="admin@parking.local" required></div>
        <div class="field"><label for="g-password">Password</label><input id="g-password" type="password" value="admin123" required></div>
        <div id="gate-error" class="error-text"></div>
        <button class="btn primary" type="submit" style="width:100%;justify-content:center;margin-top:6px;">Log in</button>
      </form>
    </div>
  `;
  document.getElementById('gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('gate-error');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: document.getElementById('g-email').value, password: document.getElementById('g-password').value },
      });
      if (data.user.role !== 'admin') throw new Error('That account is not an admin.');
      Auth.setSession(data.token, data.user);
      renderAuthArea();
      init();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// --- Main render ----------------------------------------------------------------
function render() {
  app.innerHTML = `
    <div id="stats"></div>
    <section class="admin-section">
      <div class="section-head"><h2>Locations</h2></div>
      <div class="location-grid" id="locations-grid"></div>
      <form id="add-location-form" style="margin-top:18px;max-width:520px;">
        <div class="form-row">
          <div class="field"><label for="l-name">Name</label><input id="l-name" required></div>
          <div class="field"><label for="l-address">Address</label><input id="l-address" required></div>
          <div class="field" style="max-width:110px;"><label for="l-slots">Slots</label><input id="l-slots" type="number" min="0" max="200" value="8"></div>
        </div>
        <button class="btn primary small" type="submit">Add location</button>
      </form>
    </section>

    <section class="admin-section">
      <div class="section-head">
        <h2>Live slot monitor</h2>
        <select id="monitor-select"></select>
      </div>
      <div id="monitor-grid"></div>
      <p style="color:#9a9d9f;font-size:0.85rem;">Click a bay to override its status — this is what the Arduino bridge does automatically when a sensor changes state.</p>
    </section>

    <section class="admin-section">
      <div class="section-head"><h2>Bookings</h2></div>
      <div id="bookings-table"></div>
    </section>

    <section class="admin-section">
      <div class="section-head"><h2>Users</h2></div>
      <div id="users-table"></div>
    </section>
  `;

  renderStats();
  renderLocations();
  renderMonitorSelect();
  renderMonitor();
  renderBookingsTable();
  renderUsersTable();

  document.getElementById('add-location-form').addEventListener('submit', addLocation);
  document.getElementById('monitor-select').addEventListener('change', async (e) => {
    state.monitoredLocationId = Number(e.target.value);
    state.monitoredSlots = await api(`/api/locations/${state.monitoredLocationId}/slots`, { auth: false });
    renderMonitor();
  });
}

function renderStats() {
  const totals = state.locations.reduce(
    (acc, l) => ({
      available: acc.available + l.slotSummary.available,
      occupied: acc.occupied + l.slotSummary.occupied,
      booked: acc.booked + l.slotSummary.booked,
      total: acc.total + l.slotSummary.total,
    }),
    { available: 0, occupied: 0, booked: 0, total: 0 }
  );
  document.getElementById('stats').innerHTML = `
    <div class="stat-row">
      <div class="stat-card"><div class="num">${totals.total}</div><div class="lbl">Total slots</div></div>
      <div class="stat-card available"><div class="num">${totals.available}</div><div class="lbl">Available</div></div>
      <div class="stat-card occupied"><div class="num">${totals.occupied}</div><div class="lbl">Occupied</div></div>
      <div class="stat-card booked"><div class="num">${totals.booked}</div><div class="lbl">Booked</div></div>
    </div>
  `;
}

function renderLocations() {
  document.getElementById('locations-grid').innerHTML = state.locations.map((loc) => `
    <div class="location-card">
      <h3>${escapeHtml(loc.name)}</h3>
      <div class="addr">${escapeHtml(loc.address)}</div>
      <div class="summary-legend">
        <span>${loc.slotSummary.total} slots</span>
        <span>${loc.slotSummary.available} open</span>
      </div>
      <button class="btn danger small" style="align-self:flex-start;" data-del-loc="${loc.id}">Delete location</button>
    </div>
  `).join('') || '<p class="empty-state">No locations yet — add one below.</p>';

  document.querySelectorAll('[data-del-loc]').forEach((btn) => {
    btn.addEventListener('click', () => deleteLocation(Number(btn.dataset.delLoc)));
  });
}

async function addLocation(e) {
  e.preventDefault();
  await api('/api/locations', {
    method: 'POST',
    body: {
      name: document.getElementById('l-name').value,
      address: document.getElementById('l-address').value,
      slotCount: document.getElementById('l-slots').value,
    },
  });
  await loadAll();
  render();
  showToast('Location added.');
}

async function deleteLocation(id) {
  if (!confirm('Delete this location and all its slots and bookings?')) return;
  await api(`/api/locations/${id}`, { method: 'DELETE' });
  if (state.monitoredLocationId === id) state.monitoredLocationId = null;
  await loadAll();
  render();
  showToast('Location deleted.');
}

function renderMonitorSelect() {
  const sel = document.getElementById('monitor-select');
  sel.innerHTML = state.locations.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  if (state.monitoredLocationId) sel.value = state.monitoredLocationId;
}

function renderMonitor() {
  const el = document.getElementById('monitor-grid');
  if (!el) return;
  if (!state.monitoredSlots.length) {
    el.innerHTML = '<p class="empty-state">No slots in this location.</p>';
    return;
  }
  const byRow = {};
  state.monitoredSlots.forEach((s) => {
    const label = s.slot_number.match(/^[A-Za-z]+/)?.[0] || '—';
    byRow[label] = byRow[label] || [];
    byRow[label].push(s);
  });

  el.innerHTML = Object.entries(byRow).map(([label, bays]) => `
    <div class="lot-row">
      <span class="row-label">${escapeHtml(label)}</span>
      <div class="bays">
        ${bays.map((s) => `
          <div class="bay status-${s.status}" data-slot-id="${s.id}" data-status="${s.status}" style="cursor:pointer;">
            ${escapeHtml(s.slot_number)}<span class="tag">${s.status}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('[data-slot-id]').forEach((bay) => {
    bay.addEventListener('click', () => cycleSlotStatus(Number(bay.dataset.slotId), bay.dataset.status));
  });
}

async function cycleSlotStatus(slotId, current) {
  const order = ['available', 'occupied', 'booked'];
  const next = order[(order.indexOf(current) + 1) % order.length];
  try {
    await api(`/api/slots/${slotId}/status`, { method: 'PATCH', body: { status: next } });
  } catch (err) {
    showToast(err.message);
  }
}

function renderBookingsTable() {
  const el = document.getElementById('bookings-table');
  if (!state.bookings.length) {
    el.innerHTML = '<p class="empty-state">No bookings yet.</p>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Customer</th><th>Location</th><th>Slot</th><th>Date</th><th>Time</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.bookings.map((b) => `
          <tr>
            <td>${escapeHtml(b.user_name)}<br><span style="color:#9a9d9f;font-size:0.8rem;">${escapeHtml(b.user_email)}</span></td>
            <td>${escapeHtml(b.location_name)}</td>
            <td>${escapeHtml(b.slot_number)}</td>
            <td>${escapeHtml(b.booking_date)}</td>
            <td>${escapeHtml(b.start_time)}–${escapeHtml(b.end_time)}</td>
            <td><span class="status-pill ${b.status}">${b.status}</span></td>
            <td>${b.status === 'confirmed' ? `<button class="btn danger small" data-cancel-booking="${b.id}">Cancel</button>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  el.querySelectorAll('[data-cancel-booking]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/bookings/${btn.dataset.cancelBooking}/cancel`, { method: 'PATCH' });
      await loadAll();
      render();
      showToast('Booking cancelled.');
    });
  });
}

function renderUsersTable() {
  const el = document.getElementById('users-table');
  const me = Auth.getUser();
  el.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
      <tbody>
        ${state.users.map((u) => `
          <tr>
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="tag-role ${u.role}">${u.role}</span></td>
            <td class="row-actions">
              <button class="btn ghost small" data-toggle-role="${u.id}" data-role="${u.role}">
                Make ${u.role === 'admin' ? 'customer' : 'admin'}
              </button>
              ${u.id !== me.id ? `<button class="btn danger small" data-del-user="${u.id}">Delete</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  el.querySelectorAll('[data-toggle-role]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextRole = btn.dataset.role === 'admin' ? 'customer' : 'admin';
      await api(`/api/users/${btn.dataset.toggleRole}/role`, { method: 'PATCH', body: { role: nextRole } });
      await loadAll();
      render();
    });
  });
  el.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this user?')) return;
      await api(`/api/users/${btn.dataset.delUser}`, { method: 'DELETE' });
      await loadAll();
      render();
    });
  });
}

function renderAuthArea() {
  const user = Auth.getUser();
  authArea.innerHTML = user
    ? `<span class="who">${escapeHtml(user.name)}</span> <button class="btn ghost small" id="logout-btn">Log out</button>`
    : '';
  const btn = document.getElementById('logout-btn');
  if (btn) btn.addEventListener('click', () => { Auth.clearSession(); location.reload(); });
}

init();
