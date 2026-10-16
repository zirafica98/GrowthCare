import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { q } from '../data/query';
import { Doctor, Family, FamilyInvitation, FamilyMember, FamilySettings, Profile } from '../models/models';
import { uuid } from '../utils/uuid';

export const DEFAULT_SKIP_REASONS = ['Zaboravili smo', 'Dete nije bilo dostupno', 'Bolest', 'Uputstvo lekara', 'Drugo'];
export const DEFAULT_INJECTION_SITES = [
  'Butina (levo)', 'Butina (desno)', 'Stomak (levo)', 'Stomak (desno)',
  'Nadlaktica (levo)', 'Nadlaktica (desno)', 'Zadnjica (levo)', 'Zadnjica (desno)',
];

const FAMILY_KEY = 'gc.family';

@Injectable({ providedIn: 'root' })
export class FamilyService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);

  readonly families = signal<Family[]>([]);
  readonly currentId = signal<string | null>(localStorage.getItem(FAMILY_KEY));
  readonly members = signal<FamilyMember[]>([]);
  readonly profiles = signal<Map<string, Profile>>(new Map());
  readonly invitations = signal<FamilyInvitation[]>([]);
  readonly doctors = signal<Doctor[]>([]);
  readonly loaded = signal(false);

  readonly current = computed<Family | null>(() => {
    const list = this.families();
    return list.find((f) => f.id === this.currentId()) ?? list[0] ?? null;
  });
  readonly activeMembers = computed(() => this.members().filter((m) => m.status === 'active'));
  readonly isOwner = computed(() => {
    const uid = this.auth.user()?.id;
    return this.activeMembers().some((m) => m.user_id === uid && m.role === 'owner');
  });
  readonly skipReasons = computed(() => this.current()?.settings?.skip_reasons ?? DEFAULT_SKIP_REASONS);
  readonly injectionSites = computed(() => this.current()?.settings?.injection_sites ?? DEFAULT_INJECTION_SITES);

  private loading: Promise<void> | null = null;

  constructor() {
    this.auth.onLogout(() => {
      this.families.set([]);
      this.members.set([]);
      this.invitations.set([]);
      this.doctors.set([]);
      this.loaded.set(false);
      this.loading = null;
      this.currentId.set(null);
      localStorage.removeItem(FAMILY_KEY);
    });
  }

  ensureLoaded(): Promise<void> {
    return this.loaded() ? Promise.resolve() : (this.loading ??= this.load().finally(() => (this.loading = null)));
  }

  async load(): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid) return;
    // A family is visible only through an active membership (RLS + revoked members).
    const myMemberships = (await this.data.list<FamilyMember>('family_members', q().eq('user_id', uid).eq('status', 'active')));
    const famIds = new Set(myMemberships.map((m) => m.family_id));
    const fams = (await this.data.list<Family>('families', q().orderBy('created_at'))).filter((f) => famIds.has(f.id));
    this.families.set(fams);
    const fam = this.current();
    if (fam) {
      this.select(fam.id);
      await this.loadFamilyDetails(fam.id);
    }
    this.loaded.set(true);
  }

  select(id: string): void {
    this.currentId.set(id);
    localStorage.setItem(FAMILY_KEY, id);
  }

  async loadFamilyDetails(familyId: string): Promise<void> {
    const [members, invitations, profiles, doctors] = await Promise.all([
      this.data.list<FamilyMember>('family_members', q().eq('family_id', familyId).orderBy('created_at')),
      this.data.list<FamilyInvitation>('family_invitations', q().eq('family_id', familyId).orderBy('created_at', false)),
      this.data.list<Profile>('profiles'),
      this.data.list<Doctor>('doctors', q().eq('family_id', familyId).orderBy('name')),
    ]);
    this.members.set(members);
    this.invitations.set(invitations);
    this.profiles.set(new Map(profiles.map((p) => [p.id, p])));
    this.doctors.set(doctors);
  }

  memberName(userId: string | null | undefined): string {
    if (!userId) return '';
    if (userId === this.auth.user()?.id) return 'Vi';
    return this.profiles().get(userId)?.full_name || this.members().find((m) => m.user_id === userId)?.display_name || 'Roditelj';
  }

  async createFamily(name: string): Promise<Family> {
    const fam = await this.data.rpc<Family>('create_family', { p_name: name.trim() });
    this.select(fam.id);
    await this.load();
    return fam;
  }

  async updateFamily(patch: { name?: string; settings?: FamilySettings }): Promise<void> {
    const fam = this.current();
    if (!fam) return;
    const updated = await this.data.update<Family>('families', fam.id, patch);
    this.families.update((l) => l.map((f) => (f.id === fam.id ? { ...f, ...updated } : f)));
  }

  async invite(email: string): Promise<FamilyInvitation> {
    const fam = this.current();
    if (!fam) throw new Error('no family');
    const inv = await this.data.rpc<FamilyInvitation>('create_invitation', { p_family_id: fam.id, p_email: email });
    this.invitations.update((l) => [inv, ...l]);
    return inv;
  }

  inviteLink(inv: FamilyInvitation): string {
    return `${location.origin}/invite/${inv.token}`;
  }

  async revokeInvitation(inv: FamilyInvitation): Promise<void> {
    await this.data.update<FamilyInvitation>('family_invitations', inv.id, { status: 'revoked' });
    this.invitations.update((l) => l.map((i) => (i.id === inv.id ? { ...i, status: 'revoked' } : i)));
  }

  getInvitation(token: string) {
    return this.data.rpc<{ family_name: string; invited_by: string; email: string; status: string; expires_at: string } | null>('get_invitation', { p_token: token });
  }

  async acceptInvitation(token: string): Promise<void> {
    const familyId = await this.data.rpc<string>('accept_invitation', { p_token: token });
    this.select(familyId);
    await this.load();
  }

  /** Owner revokes a member, or a member leaves. Access is lost immediately via RLS. */
  async revokeMember(member: FamilyMember): Promise<void> {
    await this.data.update<FamilyMember>('family_members', member.id, { status: 'revoked' });
    this.members.update((l) => l.map((m) => (m.id === member.id ? { ...m, status: 'revoked' } : m)));
  }

  async deleteFamily(): Promise<void> {
    const fam = this.current();
    if (!fam) return;
    await this.data.remove('families', fam.id);
    localStorage.removeItem(FAMILY_KEY);
    this.currentId.set(null);
    await this.load();
  }

  // ---- doctors (family-scoped address book)

  async saveDoctor(input: Partial<Doctor> & { name: string }): Promise<Doctor> {
    const fam = this.current()!;
    if (input.id) {
      const d = await this.data.update<Doctor>('doctors', input.id, input);
      this.doctors.update((l) => l.map((x) => (x.id === d.id ? d : x)));
      return d;
    }
    const row: Doctor = {
      id: uuid(), family_id: fam.id, name: input.name, specialty: input.specialty ?? null, clinic: input.clinic ?? null,
      phone: input.phone ?? null, email: input.email ?? null, notes: input.notes ?? null, created_at: new Date().toISOString(),
    };
    const d = await this.data.insert('doctors', row);
    this.doctors.update((l) => [...l, d].sort((a, b) => a.name.localeCompare(b.name)));
    return d;
  }
}
