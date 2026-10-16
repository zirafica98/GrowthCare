import { inject, Injectable } from '@angular/core';
import { Child } from '../models/models';
import { addDays, formatDateTime, relativeDays, toLocalTime } from '../utils/dates';
import { DoseService } from './dose.service';
import { CenterItem, NotificationService } from './notification.service';
import { ReminderService } from './reminder.service';
import { TherapyService } from './therapy.service';
import { VisitService } from './visit.service';
import { occurrences } from '../utils/recurrence';

/**
 * Builds the in-app notification centre from live data (no separate
 * notifications table needed) and schedules local notifications.
 */
@Injectable({ providedIn: 'root' })
export class CenterBuilderService {
  private readonly notifications = inject(NotificationService);
  private readonly doses = inject(DoseService);
  private readonly reminders = inject(ReminderService);
  private readonly visits = inject(VisitService);
  private readonly therapy = inject(TherapyService);
  private running: Promise<void> | null = null;

  refresh(children: Child[]): Promise<void> {
    return (this.running ??= this.build(children).catch(() => undefined).finally(() => (this.running = null)));
  }

  private async build(children: Child[]): Promise<void> {
    if (!children.length) {
      this.notifications.setCenter([]);
      return;
    }
    const prefs = this.notifications.prefs() ?? (await this.notifications.loadPreferences());
    const now = new Date();
    const items: CenterItem[] = [];
    const name = (id: string) => children.find((c) => c.id === id)?.first_name ?? '';

    for (const c of children) {
      // Dose not recorded after the scheduled time (+ grace period).
      if (prefs.missed_dose_enabled) {
        for (const s of await this.doses.todaySlots(c.id)) {
          const due = new Date(new Date(s.scheduledFor).getTime() + prefs.missed_dose_after_minutes * 60_000);
          if (s.status === 'pending' && now >= due) {
            items.push({
              key: `missed|${s.medication.id}|${s.scheduledFor}`, kind: 'missed_dose', tone: 'warning', childId: c.id, at: due,
              title: `Doza još nije zabeležena — ${c.first_name}`,
              body: `${s.medication.name} ${s.medication.current_dose} ${s.medication.dose_unit}, termin ${toLocalTime(new Date(s.scheduledFor))}`,
              link: '/app/dashboard',
            });
          }
        }
      }
      // Upcoming visits within 7 days.
      if (prefs.appointment_enabled) {
        for (const v of await this.visits.list(c.id)) {
          const at = new Date(v.scheduled_at);
          if (v.status === 'scheduled' && at >= now && at <= addDays(now, 7)) {
            items.push({
              key: `visit|${v.id}`, kind: 'appointment', tone: 'info', childId: c.id, at: addDays(at, -7) < now ? now : addDays(at, -7),
              title: `${this.visits.label(v)} ${relativeDays(at)} — ${c.first_name}`, body: formatDateTime(at), link: `/app/doctors/${v.id}`,
            });
          }
        }
      }
      // Stock estimate below threshold.
      if (prefs.stock_enabled) {
        const [stock, meds, inj] = await Promise.all([this.therapy.stock(c.id), this.therapy.medications(c.id), this.doses.injections(c.id, addDays(now, -400))]);
        for (const st of stock) {
          const med = meds.find((m) => m.id === st.medication_id);
          if (!med || !med.active) continue;
          const est = this.therapy.estimate(st, med, inj, now);
          if (est.daysLeft !== null && est.daysLeft <= st.reminder_threshold_days) {
            items.push({
              key: `stock|${st.id}|${est.daysLeft}`, kind: 'stock', tone: 'warning', childId: c.id, at: now,
              title: `Nabavka terapije — ${c.first_name}`, body: `Procena: još oko ${est.daysLeft} dana (${st.package_name}).`, link: '/app/therapy',
            });
          }
        }
      }
    }

    // Reminder occurrences from the last 24 h (due) and next 24 h (upcoming).
    const reminders = await this.reminders.listForChildren(children.map((c) => c.id));
    for (const r of reminders.filter((x) => x.enabled && x.type !== 'dose')) {
      for (const at of occurrences(r, addDays(now, -1), addDays(now, 1))) {
        items.push({
          key: `rem|${r.id}|${at.toISOString()}`, kind: r.type, tone: at <= now ? 'warning' : 'info', childId: r.child_id, at,
          title: `${r.title} — ${name(r.child_id)}`, body: `${at <= now ? 'Bilo je zakazano' : 'Zakazano'}: ${formatDateTime(at)}`, link: '/app/reminders',
        });
      }
    }

    this.notifications.setCenter(items);
    this.notifications.scheduleLocal(reminders, name);
  }
}
