import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { q } from '../data/query';
import { Child, MedicalDocument } from '../models/models';
import { uuid } from '../utils/uuid';
import { FamilyService } from './family.service';

const CHILD_KEY = 'gc.child';
export const AVATAR_COLORS = ['#DCEBFF', '#FDE7EF', '#E3F6EC', '#FFF1D6', '#EDE7FF', '#E0F4F8'];

/**
 * Selected-child context. The selection is UI state only: it is persisted
 * (as an id) for convenience but never grants access — every query is still
 * authorised by RLS, and a stale id that is not in the visible list is ignored.
 */
@Injectable({ providedIn: 'root' })
export class ChildService {
  private readonly data = inject(DataService);
  private readonly family = inject(FamilyService);
  private readonly auth = inject(AuthService);

  readonly children = signal<Child[]>([]);
  readonly loaded = signal(false);
  private readonly selectedId = signal<string | null>(localStorage.getItem(CHILD_KEY));

  readonly selected = computed<Child | null>(() => {
    const list = this.children();
    return list.find((c) => c.id === this.selectedId()) ?? list[0] ?? null;
  });
  readonly selectedChildId = computed(() => this.selected()?.id ?? null);

  constructor() {
    effect(() => {
      const fam = this.family.current();
      untracked(() => {
        if (fam) void this.load(fam.id);
        else this.children.set([]);
      });
    });
    this.auth.onLogout(() => {
      this.children.set([]);
      this.selectedId.set(null);
      this.loaded.set(false);
      localStorage.removeItem(CHILD_KEY);
    });
  }

  async load(familyId = this.family.current()?.id): Promise<void> {
    if (!familyId || !this.auth.user()) return;
    const list = await this.data.list<Child>('children', q().eq('family_id', familyId).orderBy('date_of_birth'));
    this.children.set(list);
    this.loaded.set(true);
  }

  select(id: string): void {
    if (!this.children().some((c) => c.id === id)) return; // never select an unknown child
    this.selectedId.set(id);
    localStorage.setItem(CHILD_KEY, id);
  }

  displayName(c: Child | null | undefined): string {
    return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : '';
  }

  async add(input: Pick<Child, 'first_name' | 'date_of_birth'> & Partial<Child>): Promise<Child> {
    const fam = this.family.current();
    if (!fam) throw new Error('no family');
    const now = new Date().toISOString();
    const row: Child = {
      id: uuid(), family_id: fam.id, first_name: input.first_name.trim(), last_name: input.last_name?.trim() || null,
      date_of_birth: input.date_of_birth, sex: input.sex ?? null, photo_url: input.photo_url ?? null,
      avatar_color: input.avatar_color ?? AVATAR_COLORS[this.children().length % AVATAR_COLORS.length],
      birth_weight_g: input.birth_weight_g ?? null, birth_length_cm: input.birth_length_cm ?? null,
      notes: input.notes ?? null, created_at: now, updated_at: now,
    };
    const saved = await this.data.insert('children', row);
    this.children.update((l) => [...l, saved]);
    this.select(saved.id);
    return saved;
  }

  async update(id: string, patch: Partial<Child>): Promise<Child> {
    const { family_id: _ignored, id: _id, ...safe } = patch; // a child can never be moved to another family
    const saved = await this.data.update<Child>('children', id, safe);
    this.children.update((l) => l.map((c) => (c.id === id ? { ...c, ...saved } : c)));
    return saved;
  }

  /** Deletes the child; DB rows cascade, stored document files are removed explicitly. */
  async remove(id: string): Promise<void> {
    const docs = await this.data.list<MedicalDocument>('documents', q().eq('child_id', id));
    for (const d of docs) await this.data.removeFile(d.storage_path).catch(() => undefined);
    await this.data.remove('children', id);
    this.children.update((l) => l.filter((c) => c.id !== id));
    if (this.selectedId() === id) {
      this.selectedId.set(null);
      localStorage.removeItem(CHILD_KEY);
    }
  }
}
