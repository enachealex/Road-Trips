import { describe, expect, it } from 'vitest';

import { addDays, daysBetween, formatRelative, isValidDate, isValidTime, nowLocal } from './dates';

describe('dates', () => {
  it('adds days across months, leap years and daylight-saving changes', () => {
    expect(addDays('2027-02-27', 2)).toBe('2027-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-03-14', 1)).toBe('2027-03-15');
    expect(addDays('2027-11-07', -1)).toBe('2027-11-06');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2027-07-01', '2027-07-14')).toBe(13);
    expect(daysBetween('2027-07-14', '2027-07-01')).toBe(-13);
  });

  it('validates dates and times', () => {
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('2027-7-1')).toBe(false);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
  });

  it('reads the local clock in trip formats', () => {
    expect(nowLocal(new Date(2027, 6, 4, 9, 5))).toEqual({ date: '2027-07-04', time: '09:05' });
  });

  it('describes recent edits relatively', () => {
    const now = new Date('2027-07-04T12:00:00Z');
    expect(formatRelative('2027-07-04T11:59:40Z', now)).toBe('just now');
    expect(formatRelative('2027-07-04T11:45:00Z', now)).toBe('15 min ago');
    expect(formatRelative('2027-07-04T09:00:00Z', now)).toBe('3 hours ago');
  });
});
