import { Reminder } from '../models/models';
import { buildSchedule, defaultPreferences } from '../services/notification.service';
import { buildRule, inQuietHours, nextOccurrence, occurrences, parseRule } from './recurrence';

const rem = (over: Partial<Reminder>): Reminder => ({
  id: 'r', child_id: 'c', type: 'custom', title: 'T', description: null, scheduled_for: new Date('2026-10-16T09:00:00').toISOString(),
  recurrence_rule: null, related_entity_type: null, related_entity_id: null, enabled: true, created_by: 'u', created_at: '', ...over,
});

describe('reminder recurrence & notification scheduling', () => {
  const from = new Date('2026-10-16T00:00:00');
  const to = new Date('2026-10-31T23:59:59');

  it('parses and builds RRULE subset', () => {
    expect(buildRule('WEEKLY', 1, [1, 3])).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
    expect(parseRule('FREQ=DAILY;INTERVAL=2')).toEqual(jasmine.objectContaining({ freq: 'DAILY', interval: 2 }));
    expect(parseRule('nonsense')).toBeNull();
  });

  it('expands one-off, daily, weekly-by-day and monthly reminders', () => {
    expect(occurrences(rem({}), from, to).length).toBe(1);
    expect(occurrences(rem({ recurrence_rule: 'FREQ=DAILY' }), from, to).length).toBe(16);
    const weekly = occurrences(rem({ recurrence_rule: 'FREQ=WEEKLY;BYDAY=SU' }), from, to);
    expect(weekly.every((d) => d.getDay() === 0)).toBeTrue();
    expect(weekly.length).toBe(2); // Sundays 18 and 25 Oct
    expect(occurrences(rem({ recurrence_rule: 'FREQ=MONTHLY' }), from, new Date('2027-01-31')).length).toBe(4);
  });

  it('honours UNTIL and finds the next occurrence', () => {
    expect(occurrences(rem({ recurrence_rule: 'FREQ=DAILY;UNTIL=2026-10-18' }), from, to).length).toBe(3);
    expect(nextOccurrence(rem({ recurrence_rule: 'FREQ=DAILY' }), new Date('2026-10-20T10:00:00'))!.getDate()).toBe(21);
  });

  it('detects overnight quiet hours', () => {
    expect(inQuietHours(new Date('2026-10-16T23:30:00'), '22:00', '07:00')).toBeTrue();
    expect(inQuietHours(new Date('2026-10-16T06:59:00'), '22:00', '07:00')).toBeTrue();
    expect(inQuietHours(new Date('2026-10-16T12:00:00'), '22:00', '07:00')).toBeFalse();
    expect(inQuietHours(new Date('2026-10-16T12:00:00'), null, null)).toBeFalse();
  });

  it('builds the notification schedule respecting preferences and quiet hours (dose exempt)', () => {
    const prefs = { ...defaultPreferences('u'), quiet_hours_start: '21:00', quiet_hours_end: '07:00', measurement_enabled: false };
    const night = new Date('2026-10-16T21:30:00').toISOString();
    const plan = buildSchedule([
      rem({ id: 'dose', type: 'dose', scheduled_for: night, recurrence_rule: 'FREQ=DAILY', title: 'Somatropin 0.8 mg' }),
      rem({ id: 'custom-night', type: 'custom', scheduled_for: night }),
      rem({ id: 'measure', type: 'measurement' }),
      rem({ id: 'disabled', enabled: false }),
    ], prefs, from, new Date('2026-10-17T00:00:00'), () => 'Luka');
    expect(plan.map((p) => p.reminderId)).toEqual(['dose']);
    expect(plan[0].title).toContain('Luka');
  });
});
