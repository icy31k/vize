import {
  dayRange,
  shiftDay,
  summarize,
  weekStart,
} from '../src/tracker';
import type { Activity } from '../src/tracker';

const app = (overrides: Partial<Activity> = {}): Activity => ({
  id: 1,
  appID: 'dev.example.Editor',
  appName: 'Editor',
  categoryID: 2,
  start: new Date(2026, 10, 14, 23, 50).getTime() / 1000,
  end: new Date(2026, 10, 15, 0, 20).getTime() / 1000,
  ...overrides,
});

test('splits a block at local midnight and excludes blocks touching the range', () => {
  const saturday = new Date(2026, 10, 14);
  const sunday = shiftDay(saturday, 1);
  const boundary = dayRange(sunday).from;
  const rows = [
    app(),
    app({ id: 2, end: boundary, start: boundary - 10, categoryID: 1 }),
  ];
  expect(summarize(rows, dayRange(saturday)).total).toBe(610);
  expect(summarize(rows, dayRange(sunday)).total).toBe(1200);
});

test('groups apps within their assigned category and combines repeated app IDs', () => {
  const day = dayRange(new Date(2026, 10, 15));
  const rows = [
    app({ start: day.from, end: day.from + 60 }),
    app({ id: 2, start: day.from + 60, end: day.from + 180 }),
    app({ id: 3, start: day.from + 180, end: day.from + 210, categoryID: 3 }),
  ];
  const result = summarize(rows, day);
  expect(result.total).toBe(210);
  expect(result.categories.get(2)).toBe(180);
  expect(result.apps.get(2)?.get(rows[0].appID)?.seconds).toBe(180);
  expect(result.apps.get(3)?.get(rows[0].appID)?.seconds).toBe(30);
});

test('starts weeks on Monday across a month boundary', () => {
  expect(weekStart(new Date(2026, 10, 1))).toEqual(new Date(2026, 9, 26));
  expect(weekStart(new Date(2026, 10, 2))).toEqual(new Date(2026, 10, 2));
});
