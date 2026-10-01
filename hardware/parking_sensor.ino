/*
  Smart Parking — sensor node
  ---------------------------
  Wiring (per slot):
    IR obstacle sensor OUT -> Arduino digital pin (see SLOT_PINS below)
    IR sensor VCC          -> 5V
    IR sensor GND          -> GND
    Optional: red LED (occupied) + green LED (available) per slot, through
    a ~220ohm resistor, on the pins in STATUS_LED_PINS.

  Most cheap IR obstacle modules (e.g. FC-51) pull their OUT pin LOW when
  they detect an object (a car bumper) in range, and HIGH when clear.
  If your module is wired the opposite way, flip OCCUPIED_SIGNAL below.

  Output protocol (one line per state CHANGE, not every loop):
    SLOT:<slotNumber>,<AVAILABLE|OCCUPIED>\n
  serial_bridge.js on the connected computer reads these lines and PATCHes
  the backend so every browser tab updates in real time.
*/

const int SLOT_COUNT = 2;
const int SLOT_PINS[SLOT_COUNT]       = {2, 3};   // IR sensor OUT pins
const int STATUS_LED_PINS[SLOT_COUNT] = {4, 5};   // optional: red LED per slot (omit if unused)
const int OCCUPIED_SIGNAL = LOW;                  // LOW = "object detected" on most IR modules

const unsigned long DEBOUNCE_MS = 300;             // ignore flicker shorter than this

bool lastStableOccupied[SLOT_COUNT];
bool lastRawOccupied[SLOT_COUNT];
unsigned long lastChangeAt[SLOT_COUNT];

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < SLOT_COUNT; i++) {
    pinMode(SLOT_PINS[i], INPUT);
    pinMode(STATUS_LED_PINS[i], OUTPUT);

    bool occupied = (digitalRead(SLOT_PINS[i]) == OCCUPIED_SIGNAL);
    lastStableOccupied[i] = occupied;
    lastRawOccupied[i] = occupied;
    lastChangeAt[i] = millis();

    digitalWrite(STATUS_LED_PINS[i], occupied ? HIGH : LOW);
    announce(i, occupied);
  }
}

void loop() {
  for (int i = 0; i < SLOT_COUNT; i++) {
    bool rawOccupied = (digitalRead(SLOT_PINS[i]) == OCCUPIED_SIGNAL);

    if (rawOccupied != lastRawOccupied[i]) {
      lastRawOccupied[i] = rawOccupied;
      lastChangeAt[i] = millis();
    }

    bool debounced = (millis() - lastChangeAt[i]) >= DEBOUNCE_MS;
    if (debounced && rawOccupied != lastStableOccupied[i]) {
      lastStableOccupied[i] = rawOccupied;
      digitalWrite(STATUS_LED_PINS[i], rawOccupied ? HIGH : LOW);
      announce(i, rawOccupied);
    }
  }
}

void announce(int slotIndex, bool occupied) {
  Serial.print("SLOT:");
  Serial.print(slotIndex + 1); // slots are numbered from 1 on the wire
  Serial.print(",");
  Serial.println(occupied ? "OCCUPIED" : "AVAILABLE");
}
