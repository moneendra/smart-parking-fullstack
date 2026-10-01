// app.js — customer-facing site. A small hand-rolled view switcher (no
// framework) so the whole project stays readable for a student build/demo.

const state = {
  view: 'locations', // 'locations' | 'slots' | 'bookings'
  locations: [],
  activeLocation: null,
  slots: [],
  bookings: [],
  pendingSlot: null, // slot chosen for the booking modal
};

const app = document.getElementById('app');
const authArea = document.getElementById('auth-area');

// --- Bootstrapping ----------------------------------------------------------
async function init() {
  renderAuthArea();
  connectSlotSocket(handleSlotUpdate);
  await loadLocations();
  render();
}

function handleSlotUpdate(updatedSlot) {
  if (state.activeLocation && updatedSlot.location_id === state.activeLocation.id) {
    const i = state.slots.findIndex((s) => s.id === updatedSlot.id);
    if (i >= 0) state.slots[i] = updatedSlot;
  }
  loadLocations(true); // refresh the "N available" counts without a full reload
  if (state.view === 'slots') render();
}

// --- Data loading ------------------------------------------------------------
async function loadLocations(silent = false) {
  state.locations = await api('/api/locations', { auth: false });
  if (!silent) render();
}

async function openLocation(location) {
  state.activeLocation = location;
  state.slots = await api(`/api/locations/${location.id}/slots`, { auth: false });
  state.view = 'slots';
  render();
}

async function loadMyBookings() {
  if (!Auth.isLoggedIn()) {
    state.view = 'login-required';
    return render();
  }
  state.bookings = await api('/api/bookings/me');
  state.view = 'bookings';
  render();
}

// --- Rendering ----------------------------------------------------------------
function render() {
  document.querySelectorAll('.topbar nav a').forEach((a) => a.classList.remove('active'));
  const navEl = document.getElementById(`nav-${state.view === 'slots' ? 'locations' : state.view}`);
  if (navEl) navEl.classList.add('active');

  if (state.view === 'locations') return renderLocations();
  if (state.view === 'slots') return renderSlots();
  if (state.view === 'bookings') return renderBookings();
  if (state.view === 'login-required') return renderLoginRequired();
}

function renderLocations() {
  const totals = state.locations.reduce(
    (acc, l) => ({
      available: acc.available + l.slotSummary.available,
      total: acc.total + l.slotSummary.total,
    }),
    { available: 0, total: 0 }
  );

  app.innerHTML = `
    <div class="status-strip">
      <span class="count">${totals.available}</span>
      <span class="label">spots open right now, across ${state.locations.length} location${state.locations.length === 1 ? '' : 's'}</span>
    </div>
    <div class="location-grid">
      ${state.locations.map(locationCardHtml).join('') || '<p class="empty-state">No parking locations yet.</p>'}
    </div>
  `;

  state.locations.forEach((loc) => {
    document.getElementById(`open-${loc.id}`).addEventListener('click', () => openLocation(loc));
  });
}

function locationCardHtml(loc) {
  const s = loc.slotSummary;
  const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
  return `
    <div class="location-card">
      <h3>${escapeHtml(loc.name)}</h3>
      <div class="addr">${escapeHtml(loc.address)}</div>
      <div class="summary-bar">
        <span class="s-available" style="width:${pct(s.available)}%"></span>
        <span class="s-occupied" style="width:${pct(s.occupied)}%"></span>
        <span class="s-booked" style="width:${pct(s.booked)}%"></span>
      </div>
      <div class="summary-legend">
        <span><span class="dot" style="background:var(--available)"></span>${s.available} open</span>
        <span><span class="dot" style="background:var(--occupied)"></span>${s.occupied} occupied</span>
        <span><span class="dot" style="background:var(--booked)"></span>${s.booked} booked</span>
      </div>
      <button class="btn ghost" id="open-${loc.id}" style="align-self:flex-start;margin-top:4px;">View slots</button>
    </div>
  `;
}

function renderSlots() {
  const rows = groupSlotsIntoRows(state.slots);
  app.innerHTML = `
    <button class="btn ghost small" id="back-btn">Back to locations</button>
    <h2 style="margin-top:16px;">${escapeHtml(state.activeLocation.name)}</h2>
    <p class="addr" style="margin-top:-8px;color:var(--ink-soft);">${escapeHtml(state.activeLocation.address)}</p>
    <p>Tap an open bay to book it.</p>
    <div style="margin-top:20px;">
      ${rows.map(rowHtml).join('')}
    </div>
    <div style="display:flex;gap:16px;margin-top:20px;font-size:0.85rem;color:var(--ink-soft);">
      <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--available);margin-right:5px;"></span>Available</span>
      <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--occupied);margin-right:5px;"></span>Occupied</span>
      <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--booked);margin-right:5px;"></span>Booked</span>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    state.view = 'locations';
    render();
  });

  state.slots
    .filter((s) => s.status === 'available')
    .forEach((s) => {
      const el = document.getElementById(`bay-${s.id}`);
      if (el) el.addEventListener('click', () => openBookingModal(s));
    });
}

function groupSlotsIntoRows(slots) {
  const byRow = {};
  slots.forEach((s) => {
    const rowLabel = s.slot_number.match(/^[A-Za-z]+/)?.[0] || '—';
    byRow[rowLabel] = byRow[rowLabel] || [];
    byRow[rowLabel].push(s);
  });
  return Object.entries(byRow).map(([label, bays]) => ({ label, bays }));
}

function rowHtml(row) {
  return `
    <div class="lot-row">
      <span class="row-label">${escapeHtml(row.label)}</span>
      <div class="bays">
        ${row.bays.map((s) => `
          <div class="bay status-${s.status} ${s.status === 'available' ? 'bookable' : ''}" id="bay-${s.id}">
            ${escapeHtml(s.slot_number)}
            <span class="tag">${s.status}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderBookings() {
  app.innerHTML = `
    <h2>My bookings</h2>
    ${state.bookings.length === 0 ? '<p class="empty-state">No bookings yet — pick a location and book a spot.</p>' : ''}
    ${state.bookings.map(ticketHtml).join('')}
  `;
  state.bookings
    .filter((b) => b.status === 'confirmed')
    .forEach((b) => {
      const btn = document.getElementById(`cancel-${b.id}`);
      if (btn) btn.addEventListener('click', () => cancelBooking(b.id));
    });
}

function ticketHtml(b) {
  return `
    <div class="ticket">
      <div class="addr" style="color:var(--ink-soft);font-size:0.85rem;">${escapeHtml(b.location_name)}</div>
      <div class="slot-big">${escapeHtml(b.slot_number)}</div>
      <dl>
        <dt>Date</dt><dd>${escapeHtml(b.booking_date)}</dd>
        <dt>Time</dt><dd>${escapeHtml(b.start_time)} – ${escapeHtml(b.end_time)}</dd>
        <dt>Status</dt><dd><span class="status-pill ${b.status}">${b.status}</span></dd>
      </dl>
      ${b.status === 'confirmed' ? `<button class="btn danger small" id="cancel-${b.id}">Cancel booking</button>` : ''}
    </div>
  `;
}

function renderLoginRequired() {
  app.innerHTML = `
    <div class="panel">
      <h2>Log in to see your bookings</h2>
      <p style="color:var(--ink-soft);">Create a free account or log in to book a slot and track it here.</p>
      <button class="btn primary" id="go-login">Log in / Sign up</button>
    </div>
  `;
  document.getElementById('go-login').addEventListener('click', () => openAuthModal('login'));
}

// --- Booking modal -------------------------------------------------------------
function openBookingModal(slot) {
  if (!Auth.isLoggedIn()) return openAuthModal('login', () => openBookingModal(slot));
  state.pendingSlot = slot;

  const today = new Date().toISOString().slice(0, 10);
  const overlay = modalOverlay(`
    <h3>Book ${escapeHtml(slot.slot_number)}</h3>
    <p style="color:var(--ink-soft);margin-top:-8px;">${escapeHtml(state.activeLocation.name)}</p>
    <form id="booking-form">
      <div class="field">
        <label for="b-date">Date</label>
        <input type="date" id="b-date" value="${today}" min="${today}" required>
      </div>
      <div class="form-row">
        <div class="field">
          <label for="b-start">Start time</label>
          <input type="time" id="b-start" value="09:00" required>
        </div>
        <div class="field">
          <label for="b-end">End time</label>
          <input type="time" id="b-end" value="11:00" required>
        </div>
      </div>
      <div id="booking-error" class="error-text"></div>
      <div class="close-row">
        <button type="button" class="btn ghost" id="cancel-modal">Cancel</button>
        <button type="submit" class="btn primary">Confirm booking</button>
      </div>
    </form>
  `);

  overlay.querySelector('#cancel-modal').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = overlay.querySelector('#booking-error');
    errorEl.textContent = '';
    try {
      await api('/api/bookings', {
        method: 'POST',
        body: {
          slotId: slot.id,
          bookingDate: overlay.querySelector('#b-date').value,
          startTime: overlay.querySelector('#b-start').value,
          endTime: overlay.querySelector('#b-end').value,
        },
      });
      overlay.remove();
      showToast(`Booked ${slot.slot_number}. See it under My bookings.`);
      await openLocation(state.activeLocation);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

async function cancelBooking(id) {
  try {
    await api(`/api/bookings/${id}/cancel`, { method: 'PATCH' });
    showToast('Booking cancelled.');
    await loadMyBookings();
  } catch (err) {
    showToast(err.message);
  }
}

// --- Auth modal ------------------------------------------------------------------
function openAuthModal(mode, onSuccess) {
  const isLogin = mode === 'login';
  const overlay = modalOverlay(`
    <h3>${isLogin ? 'Log in' : 'Create an account'}</h3>
    <form id="auth-form">
      ${!isLogin ? `
        <div class="field"><label for="a-name">Name</label><input id="a-name" required></div>
      ` : ''}
      <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" required></div>
      <div class="field"><label for="a-password">Password</label><input id="a-password" type="password" required minlength="6"></div>
      <div id="auth-error" class="error-text"></div>
      <div class="close-row">
        <button type="button" class="btn ghost" id="switch-mode">${isLogin ? 'Need an account?' : 'Have an account?'}</button>
        <button type="submit" class="btn primary">${isLogin ? 'Log in' : 'Sign up'}</button>
      </div>
    </form>
  `);

  overlay.querySelector('#switch-mode').addEventListener('click', () => {
    overlay.remove();
    openAuthModal(isLogin ? 'register' : 'login', onSuccess);
  });

  overlay.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = overlay.querySelector('#auth-error');
    errorEl.textContent = '';
    try {
      const payload = {
        email: overlay.querySelector('#a-email').value,
        password: overlay.querySelector('#a-password').value,
      };
      if (!isLogin) payload.name = overlay.querySelector('#a-name').value;

      const data = await api(`/api/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', body: payload, auth: false });
      Auth.setSession(data.token, data.user);
      overlay.remove();
      renderAuthArea();
      showToast(`Welcome, ${data.user.name}.`);
      if (onSuccess) onSuccess();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function modalOverlay(innerHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal">${innerHtml}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function renderAuthArea() {
  const user = Auth.getUser();
  if (user) {
    authArea.innerHTML = `<span class="who">${escapeHtml(user.name)}</span> <button class="btn ghost small" id="logout-btn">Log out</button>`;
    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.clearSession();
      renderAuthArea();
      state.view = 'locations';
      render();
    });
  } else {
    authArea.innerHTML = `<button class="btn ghost small" id="login-btn">Log in</button>`;
    document.getElementById('login-btn').addEventListener('click', () => openAuthModal('login'));
  }
}

// --- Nav ---------------------------------------------------------------------
document.getElementById('nav-locations').addEventListener('click', (e) => {
  e.preventDefault();
  state.view = 'locations';
  render();
});
document.getElementById('nav-bookings').addEventListener('click', (e) => {
  e.preventDefault();
  loadMyBookings();
});

init();
