import { computed, inject, Injectable, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { q } from '../data/query';
import { NotificationPreferences, Reminder, ReminderType } from '../models/models';
import { addDays } from '../utils/dates';
import { inQuietHours, occurrences } from '../utils/recurrence';
import { uuid } from '../utils/uuid';

export interface ScheduledNotification {
  key: string; // reminderId|iso
  reminderId: string;
  childId: string;
  type: ReminderType;
  title: string;
  body: string;
  at: Date;
}

export interface CenterItem {
  key: string;
  kind: 'dose' | 'missed_dose' | 'appointment' | 'laboratory' | 'measurement' | 'stock' | 'custom' | 'sync';
  title: string;
  body: string;
  at: Date;
  childId: string | null;
  link: string | null;
  tone: 'info' | 'warning' | 'success';
}

export function defaultPreferences(userId: string): NotificationPreferences {
  return {
    id: uuid(), user_id: userId, dose_enabled: true, missed_dose_enabled: true, missed_dose_after_minutes: 60,
    appointment_enabled: true, laboratory_enabled: true, measurement_enabled: true, stock_enabled: true,
    custom_enabled: true, push_enabled: false, quiet_hours_start: null, quiet_hours_end: null,
  };
}

const TYPE_PREF: Record<ReminderType, keyof NotificationPreferences> = {
  dose: 'dose_enabled', missed_dose: 'missed_dose_enabled', appointment: 'appointment_enabled',
  laboratory: 'laboratory_enabled', measurement: 'measurement_enabled', stock: 'stock_enabled', custom: 'custom_enabled',
};

/**
 * Pure scheduler: which reminder notifications fire in [from, to].
 * Disabled types are dropped. Quiet hours suppress everything except the dose
 * reminder itself (its time was chosen explicitly by the parents).
 */
export function buildSchedule(
  reminders: Reminder[],
  prefs: NotificationPreferences,
  from: Date,
  to: Date,
  childName: (id: string) => string,
): ScheduledNotification[] {
  const out: ScheduledNotification[] = [];
  for (const r of reminders) {
    if (!r.enabled || !prefs[TYPE_PREF[r.type]]) continue;
    for (const at of occurrences(r, from, to)) {
      if (r.type !== 'dose' && inQuietHours(at, prefs.quiet_hours_start, prefs.quiet_hours_end)) continue;
      out.push({
        key: `${r.id}|${at.toISOString()}`, reminderId: r.id, childId: r.child_id, type: r.type,
        title: r.type === 'dose' ? `Vreme je za dozu — ${childName(r.child_id)}` : r.title,
        body: r.type === 'dose' ? r.title : r.description && r.description.length > 3 ? r.description : childName(r.child_id),
        at,
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const READ_KEY = 'gc.notif.read';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly swPush = inject(SwPush, { optional: true });

  readonly prefs = signal<NotificationPreferences | null>(null);
  readonly items = signal<CenterItem[]>([]);
  readonly read = signal<Set<string>>(new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[]));
  readonly unreadCount = computed(() => this.items().filter((i) => !this.read().has(i.key)).length);
  readonly permission = signal<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    this.auth.onLogout(() => {
      this.clearTimers();
      this.prefs.set(null);
      this.items.set([]);
      localStorage.removeItem(READ_KEY);
      this.read.set(new Set());
    });
  }

  async loadPreferences(): Promise<NotificationPreferences> {
    const uid = this.auth.user()?.id;
    if (!uid) throw new Error('no user');
    const [existing] = await this.data.list<NotificationPreferences>('notification_preferences', q().eq('user_id', uid));
    const p = existing ?? (await this.data.insert('notification_preferences', defaultPreferences(uid)));
    this.prefs.set(p);
    return p;
  }

  async savePreferences(patch: Partial<NotificationPreferences>): Promise<void> {
    const p = this.prefs() ?? (await this.loadPreferences());
    const saved = await this.data.update<NotificationPreferences>('notification_preferences', p.id, patch);
    this.prefs.set({ ...p, ...saved });
  }

  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof Notification === 'undefined') return 'unsupported';
    const res = await Notification.requestPermission();
    this.permission.set(res);
    return res;
  }

  setCenter(items: CenterItem[]): void {
    this.items.set(items.sort((a, b) => b.at.getTime() - a.at.getTime()));
  }

  markRead(key: string): void {
    this.read.update((s) => new Set(s).add(key));
    this.persistRead();
  }

  markAllRead(): void {
    this.read.set(new Set(this.items().map((i) => i.key)));
    this.persistRead();
  }

  private persistRead(): void {
    // Only opaque keys are stored, never medical content.
    localStorage.setItem(READ_KEY, JSON.stringify([...this.read()].slice(-300)));
  }

  /**
   * While the app is open, schedule local notifications for the next 24 h.
   * (Background delivery when the app is closed requires Web Push — see subscribePush.)
   */
  scheduleLocal(reminders: Reminder[], childName: (id: string) => string): ScheduledNotification[] {
    this.clearTimers();
    const prefs = this.prefs();
    if (!prefs) return [];
    const now = new Date();
    const plan = buildSchedule(reminders, prefs, now, addDays(now, 1), childName);
    if (this.permission() !== 'granted' || this.pushState() === 'on') return plan;
    for (const n of plan) {
      const delay = n.at.getTime() - Date.now();
      if (delay <= 0 || delay > 2 ** 31 - 1) continue;
      this.timers.push(setTimeout(() => void this.showSystemNotification(n.title, n.body, n.key), delay));
    }
    return plan;
  }

  async showSystemNotification(title: string, body: string, tag: string): Promise<void> {
    if (this.permission() !== 'granted') return;
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const options: NotificationOptions = { body, tag, icon: '/icons/icon-192x192.png', badge: '/icons/icon-72x72.png', data: { url: '/app/dashboard' } };
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  // ---------------------------------------------------------------- Web Push

  /** iPhone/iPad only allow Web Push for apps added to the home screen (iOS 16.4+). */
  readonly isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  readonly isStandalone = typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

  /** Push state of THIS device. */
  readonly pushState = signal<'unavailable' | 'needs-install' | 'denied' | 'off' | 'on'>('off');

  async refreshPushState(): Promise<void> {
    if (!environment.vapidPublicKey || this.data.kind !== 'supabase') return this.pushState.set('unavailable');
    if (this.isIos && !this.isStandalone) return this.pushState.set('needs-install');
    if (!this.swPush?.isEnabled || typeof Notification === 'undefined') return this.pushState.set('unavailable');
    if (Notification.permission === 'denied') return this.pushState.set('denied');
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    this.pushState.set(sub ? 'on' : 'off');
    if (sub) void this.data.rpc('save_push_subscription', { p_subscription: sub.toJSON() }).catch(() => undefined); // keep server copy fresh
  }

  /** Must be called from a user gesture (tap) — iOS requires it for the permission prompt. */
  async enablePush(): Promise<void> {
    if (!this.swPush?.isEnabled || !environment.vapidPublicKey) throw new Error('Push nije podržan u ovom pregledaču.');
    const sub = await this.swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey });
    this.permission.set(Notification.permission);
    await this.data.rpc('save_push_subscription', { p_subscription: sub.toJSON() });
    if (this.prefs()) await this.data.update<NotificationPreferences>('notification_preferences', this.prefs()!.id, { push_enabled: true }).catch(() => undefined);
    this.pushState.set('on');
    this.clearTimers(); // the server now delivers reminders; avoid duplicate local notifications
  }

  async disablePush(): Promise<void> {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const mine = await this.data.list<{ id: string; endpoint: string }>('push_subscriptions', q().eq('endpoint', sub.endpoint));
      for (const row of mine) await this.data.remove('push_subscriptions', row.id).catch(() => undefined);
      await sub.unsubscribe();
    }
    this.pushState.set('off');
  }

  /** Ask the server to send a test notification to this account's devices. */
  async sendTestPush(): Promise<number> {
    const res = await this.data.invokeFunction<{ sent: number }>('send-reminders', { test: true });
    return res.sent;
  }
}
