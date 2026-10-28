// node --test utils/djListening.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  DJ_MAX_GAP_MS,
  createDjSession,
  creditPing,
  refundMinutes,
  djProgressPayload,
} from "./djListening.js";

const PERIOD = "2026-07-24";
const PING = 5_000;

// Walks `count` heartbeats `gap` ms apart, returning the minutes banked.
function pingFor(session, { start, count, gap = PING }) {
  let banked = 0;
  for (let i = 0; i < count; i++) {
    banked += creditPing(session, start + i * gap);
  }
  return banked;
}

test("the first ping of a session banks nothing", () => {
  const session = createDjSession(PERIOD);
  assert.equal(creditPing(session, 1_000), 0);
  assert.equal(session.accruedMs, 0);
});

test("one minute of 5s heartbeats banks exactly one minute", () => {
  const session = createDjSession(PERIOD);
  // 13 pings = 12 gaps of 5s = 60s.
  assert.equal(pingFor(session, { start: 0, count: 13 }), 1);
  assert.equal(session.accruedMs, 0);
});

test("progress below a minute is kept, not lost", () => {
  const session = createDjSession(PERIOD);
  assert.equal(pingFor(session, { start: 0, count: 7 }), 0); // 30s
  assert.equal(session.accruedMs, 30_000);
  assert.equal(djProgressPayload(session).seconds, 30);
});

test("leftover seconds carry into the next minute", () => {
  const session = createDjSession(PERIOD);
  // 7s pings: minute 1 lands at 63s, leaving 3s toward minute 2.
  assert.equal(pingFor(session, { start: 0, count: 10, gap: 7_000 }), 1);
  assert.equal(session.accruedMs, 3_000);
});

test("an hour of listening banks 60 minutes, no more and no less", () => {
  const session = createDjSession(PERIOD);
  const banked = pingFor(session, { start: 0, count: 3_600_000 / PING + 1 });
  assert.equal(banked, 60);
  assert.equal(session.accruedMs, 0);
});

test("a gap wider than the tolerance is not credited", () => {
  const session = createDjSession(PERIOD);
  creditPing(session, 0);
  creditPing(session, DJ_MAX_GAP_MS + 1); // tab was closed / asleep
  assert.equal(session.accruedMs, 0);

  // …and listening picks straight back up from the resumed ping.
  creditPing(session, DJ_MAX_GAP_MS + 1 + PING);
  assert.equal(session.accruedMs, PING);
});

test("an hour away credits nothing, however long it lasted", () => {
  const session = createDjSession(PERIOD);
  creditPing(session, 0);
  assert.equal(creditPing(session, 3_600_000), 0);
  assert.equal(session.minutes, 0);
});

test("two tabs pinging in turn accrue real time, not double", () => {
  const session = createDjSession(PERIOD); // shared: state is keyed by user
  let banked = 0;
  // Tab A at t=0,5,10… and tab B offset 2.5s: 24 gaps of 2.5s over the same 60s.
  for (let t = 0; t <= 60_000; t += 2_500) banked += creditPing(session, t);
  assert.equal(banked, 1);
  assert.equal(session.accruedMs, 0);
});

test("a reload mid-minute keeps the partial minute", () => {
  const session = createDjSession(PERIOD);
  pingFor(session, { start: 0, count: 7 }); // 30s in
  // Page reloads: a new socket, but the same user session — one skipped ping
  // still lands inside the tolerated gap, so the 30s survives.
  creditPing(session, 30_000 + 10_000);
  assert.equal(session.accruedMs, 40_000);
});

test("a failed write hands the minute back", () => {
  const session = createDjSession(PERIOD);
  const banked = pingFor(session, { start: 0, count: 13 });
  assert.equal(banked, 1);
  refundMinutes(session, banked); // DB threw
  assert.equal(session.accruedMs, 60_000);
  // The next ping re-offers it for banking.
  assert.equal(creditPing(session, 60_000 + PING), 1);
});

test("the payload the quest card renders is capped at the goal", () => {
  const session = createDjSession(PERIOD, 103);
  assert.deepEqual(djProgressPayload(session), { minutes: 60, target: 60, seconds: 0 });
});

test("a resumed session continues from the minutes already banked", () => {
  const session = createDjSession(PERIOD, 17);
  assert.equal(djProgressPayload(session).minutes, 17);
  assert.equal(pingFor(session, { start: 0, count: 13 }), 1);
});

test("clock skew backwards is ignored", () => {
  const session = createDjSession(PERIOD);
  creditPing(session, 10_000);
  creditPing(session, 4_000);
  assert.equal(session.accruedMs, 0);
});
