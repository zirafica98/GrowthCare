import { DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { debounceTime } from 'rxjs';
import { DataService } from '../core/data/data.service';
import { AppError, toAppError } from '../core/data/errors';
import { ChildService } from '../core/services/child.service';

/**
 * Loads data scoped to the currently selected child and keeps it fresh.
 *  - When the selected child changes, the previous child's data is cleared
 *    immediately (never shown under another child's name).
 *  - Reloads after any local write (DataService.changes$).
 *  - Stale responses for a previously selected child are discarded.
 * Must be called in an injection context (component field initialiser).
 */
export function childData<T>(load: (childId: string) => Promise<T>) {
  const children = inject(ChildService);
  const data = inject(DataService);
  const value = signal<T | null>(null);
  const loading = signal(true);
  const error = signal<AppError | null>(null);
  let seq = 0;
  let currentChild: string | null = null;

  const run = async (): Promise<void> => {
    const id = children.selectedChildId();
    const my = ++seq;
    if (id !== currentChild) {
      currentChild = id;
      value.set(null);
    }
    if (!id) {
      loading.set(!children.loaded());
      return;
    }
    loading.set(value() === null);
    error.set(null);
    try {
      const v = await load(id);
      if (my === seq && children.selectedChildId() === id) value.set(v);
    } catch (e) {
      if (my === seq) error.set(toAppError(e));
    } finally {
      if (my === seq) loading.set(false);
    }
  };

  effect(() => {
    children.selectedChildId();
    children.loaded();
    untracked(() => void run());
  });
  const sub = data.changes$.pipe(debounceTime(60)).subscribe(() => void run());
  inject(DestroyRef).onDestroy(() => sub.unsubscribe());

  return { value, loading, error, reload: run };
}
