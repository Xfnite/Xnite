// node --test utils/questPeriod.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { getWeekKey, getWeekStart, getWeekRange, isNewWeek } from "./questPeriod.js";

// Helper: a UTC instant that reads as the given Manila wall-clock time.
const manila = (iso) => new Date(new Date(`${iso}+08:00`).toISOString());

test("the week key is the Monday of the current Manila week", () => {
  // Fri 2026-07-24 Manila -> week of Mon 2026-07-20
  assert.equal(getWeekKey(manila("2026-07-24T15:00:00")), "2026-07-20");
  assert.equal(getWeekKey(manila("2026-07-20T00:00:00")), "2026-07-20"); // Monday itself
  assert.equal(getWeekKey(manila("2026-07-26T23:59:59")), "2026-07-20"); // Sunday night
});

test("crossing into Monday rolls the week over", () => {
  assert.equal(getWeekKey(manila("2026-07-26T23:59:59")), "2026-07-20"); // Sun
  assert.equal(getWeekKey(manila("2026-07-27T00:00:00")), "2026-07-27"); // next Mon
});

test("week start is Monday 00:00 Manila = Sunday 16:00 UTC", () => {
  const start = getWeekStart(manila("2026-07-24T12:00:00"));
  assert.equal(start.toISOString(), "2026-07-19T16:00:00.000Z");
});

test("the week range spans exactly 7 days, [start, end)", () => {
  const { start, end } = getWeekRange(manila("2026-07-22T12:00:00"));
  assert.equal(start.toISOString(), "2026-07-19T16:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-26T16:00:00.000Z");
  assert.equal(end.getTime() - start.getTime(), 7 * 24 * 60 * 60 * 1000);
});

test("a signup at the exact week start is inside; one instant before is not", () => {
  const { start, end } = getWeekRange(manila("2026-07-24T00:00:00"));
  const inWindow = (d) => d >= start && d < end;
  assert.ok(inWindow(start));
  assert.ok(!inWindow(new Date(start.getTime() - 1)));
  assert.ok(!inWindow(end)); // end is exclusive (that's next week's start)
});

test("isNewWeek compares against the current Monday key", () => {
  const now = manila("2026-07-24T12:00:00");
  assert.ok(!isNewWeek("2026-07-20", now));
  assert.ok(isNewWeek("2026-07-13", now));
  assert.ok(isNewWeek(null, now));
});

test("month and year boundaries stay correct", () => {
  // Thu 2026-01-01 Manila -> week of Mon 2025-12-29
  assert.equal(getWeekKey(manila("2026-01-01T09:00:00")), "2025-12-29");
});
