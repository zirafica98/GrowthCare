import { Injectable, signal } from '@angular/core';
import { AppError, toAppError } from '../data/errors';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Non-blocking feedback + central error presentation (never raw backend errors). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(kind: ToastKind, message: string, ms = 3500): void {
    const t: Toast = { id: ++this.seq, kind, message };
    this.toasts.update((l) => [...l, t]);
    setTimeout(() => this.dismiss(t.id), ms);
  }

  success(message: string): void { this.show('success', message); }
  info(message: string): void { this.show('info', message); }
  warning(message: string): void { this.show('warning', message, 5000); }

  error(err: unknown): AppError {
    const e = toAppError(err);
    if (e.kind === 'network') this.show('warning', e.message, 5000);
    else this.show('error', e.message, 5000);
    // Log only the error kind — never the payload (may contain medical data).
    console.warn('[GrowthCare]', e.kind);
    return e;
  }

  dismiss(id: number): void {
    this.toasts.update((l) => l.filter((t) => t.id !== id));
  }
}
