# Smart Parking System

An IoT-connected parking booking system: customers browse locations and book
open slots on a website in real time; IR sensors on an Arduino Uno detect
whether a bay is physically occupied and push that status to the backend so
every screen updates instantly; admins manage locations, slots, bookings,
and users from a dashboard.

## Architecture

```
                     ┌────────────────────┐
   Customer browser  │   frontend/         │   Admin browser
   (index.html)  ────┤   static HTML/CSS/JS├──── (admin.html)
                     │   served by Express  │
                     └──────────┬──────────┘
                                │ REST API + Socket.io (real-time)
                     ┌──────────┴──────────┐
                     │   backend/server.js  │
                     │   Express + JWT auth │
                     │   Socket.io broadcast│
                     └──────────┬──────────┘
                                │ SQL
                     ┌──────────┴──────────┐
                     │  backend/parking.db  │   (SQLite, auto-created)
                     └──────────┬──────────┘
                                │ PATCH /api/slots/:id/status
                     ┌──────────┴──────────┐
                     │ hardware/            │
                     │ serial_bridge.js     │  (runs on the PC wired to the Arduino)
                     └──────────┬──────────┘
                                │ USB Serial
                     ┌──────────┴──────────┐
                     │ Arduino Uno          │
                     │ parking_sensor.ino   │
                     │ + IR sensors         │
                     └──────────────────────┘
```

One backend, one SQLite database file, and everything else — customer site,
admin dashboard, and the hardware bridge — talks to it over plain HTTP (plus
a Socket.io channel the backend uses to push live slot changes to every open
browser tab without anyone refreshing).

## Project layout

```
backend/     Express API, JWT auth, SQLite database, Socket.io server
frontend/    Customer site (index.html) + admin dashboard (admin.html)
hardware/    Arduino sketch + the Node script that relays sensor data
```

## Requirements

- Node.js 18+ (for global `fetch`) — both `backend/` and `hardware/` are
  separate npm projects, install each independently
- Arduino IDE, only if you're wiring up real sensors
- No separate database server needed — SQLite lives in one file

## Running it

```bash
cd backend
npm install
node db.js --seed        # creates parking.db with 2 demo locations + an admin user
npm start                # http://localhost:4000
```

Open `http://localhost:4000/index.html` for the customer site, and
`http://localhost:4000/admin.html` for the dashboard (seeded login:
`admin@parking.local` / `admin123`).

Everything works with **no hardware connected** — book a slot from the
website, or click a bay in the admin "live slot monitor" to cycle its status
and watch it update on the customer site instantly. That lets you demo or
grade the whole system without any Arduino attached.

### Connecting the real hardware

1. Wire IR sensors to the Arduino Uno as described in the comments at the
   top of `hardware/parking_sensor.ino`, then upload the sketch.
2. `cd hardware && npm install`
3. `cp .env.example .env` and fill in `SERIAL_PORT` (find it in the Arduino
   IDE's Tools > Port menu) and `SLOT_MAP` (which Arduino slot number maps
   to which real database slot id — check ids with
   `curl http://localhost:4000/api/locations/1/slots`).
4. With the backend already running, `npm start` in `hardware/`.

The bridge logs in as the admin account, then every time a sensor's state
changes it PATCHes `/api/slots/:id/status`, which the backend broadcasts to
every open browser over Socket.io.

## How slot status works

Three states: `available`, `occupied`, `booked`.

- A **booking** (from the website) sets a slot to `booked` immediately and
  holds it — this represents a reservation.
- A **sensor** reporting a car physically present sets a slot to `occupied`,
  overriding whatever it was before (a car is a car).
- A sensor reporting "clear" does **not** silently clear a `booked` slot —
  only cancelling the booking (or an admin) releases it. This stops a
  no-show sensor reading from cancelling someone else's paid reservation.
- Booking conflicts are prevented at the database layer: `better-sqlite3`
  runs every query synchronously, so two people booking the same slot at
  the same instant can't both succeed — see the comment in
  `backend/routes/bookings.js`.

## API reference

| Method | Path                              | Auth        | Purpose                          |
|--------|-----------------------------------|-------------|-----------------------------------|
| POST   | /api/auth/register                | —           | Create a customer account         |
| POST   | /api/auth/login                   | —           | Log in, returns a JWT             |
| GET    | /api/locations                    | —           | List locations + live slot counts |
| POST   | /api/locations                    | admin       | Create a location (+ N slots)     |
| PATCH  | /api/locations/:id                | admin       | Rename / re-address               |
| DELETE | /api/locations/:id                | admin       | Delete (cascades slots/bookings)  |
| GET    | /api/locations/:id/slots          | —           | Slot statuses for a location      |
| POST   | /api/locations/:id/slots          | admin       | Add a single slot                 |
| PATCH  | /api/slots/:id/status             | logged in   | Set status (hardware bridge/admin)|
| DELETE | /api/slots/:id                    | admin       | Remove a slot                     |
| POST   | /api/bookings                     | logged in   | Book a slot                       |
| GET    | /api/bookings/me                  | logged in   | Your booking history              |
| PATCH  | /api/bookings/:id/cancel          | logged in   | Cancel your (or, as admin, any) booking |
| GET    | /api/bookings                     | admin       | Every booking                     |
| GET    | /api/users                        | admin       | List users                        |
| PATCH  | /api/users/:id/role               | admin       | Promote/demote                    |
| DELETE | /api/users/:id                    | admin       | Remove a user                     |

## Possible extensions

- Future-dated bookings with an expiry job that releases a `booked` slot
  automatically if no sensor confirms arrival within a grace period
  (currently bookings are "starting now" for a given duration)
- Swap the Arduino-Uno-over-serial link for an ESP8266/ESP32 so each sensor
  node talks to the backend directly over Wi-Fi instead of needing a PC
  relay
- Payments at booking time
- Email/SMS booking confirmations
