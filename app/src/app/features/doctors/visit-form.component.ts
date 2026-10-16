import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DoctorVisit, VisitStatus } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { FamilyService } from '../../core/services/family.service';
import { ReminderService, VISIT_PRESETS } from '../../core/services/reminder.service';
import { ToastService } from '../../core/services/toast.service';
import { VisitService } from '../../core/services/visit.service';
import { addDays, combineLocal, toLocalDate, toLocalTime } from '../../core/utils/dates';
import { IconComponent } from '../../shared/ui/icon.component';

export const SPECIALTIES = ['Dečja endokrinologija', 'Pedijatrija', 'Oftalmologija', 'Radiologija', 'Neurologija', 'Kardiologija', 'Laboratorija', 'Drugo'];

/** Create/edit an appointment (Flow E) incl. reminder presets 7d / 1d / day-of. */
@Component({
  selector: 'app-visit-form',
  imports: [FormsModule, IconComponent],
  template: `
    <div class="stack">
      <div class="notice info small"><app-icon name="user" [size]="16" /> Kontrola za: <b>{{ children.selected()?.first_name }}</b></div>
      <div class="field">
        <label for="v-doc">Lekar</label>
        <select id="v-doc" class="select" [(ngModel)]="doctorId">
          <option value="">— bez lekara —</option>
          @for (d of family.doctors(); track d.id) { <option [value]="d.id">{{ d.name }}{{ d.specialty ? ' · ' + d.specialty : '' }}</option> }
          <option value="__new">+ Novi lekar…</option>
        </select>
      </div>
      @if (doctorId === '__new') {
        <div class="card flat tight stack sm">
          <div class="field"><label for="v-dn">Ime lekara</label><input id="v-dn" class="input" [(ngModel)]="newDoctor.name" placeholder="Dr …" /></div>
          <div class="grid-2">
            <div class="field"><label for="v-ds">Specijalnost</label><input id="v-ds" class="input" list="spec-list" [(ngModel)]="newDoctor.specialty" /></div>
            <div class="field"><label for="v-dc">Ustanova</label><input id="v-dc" class="input" [(ngModel)]="newDoctor.clinic" /></div>
          </div>
          <datalist id="spec-list">@for (s of specialties; track s) { <option [value]="s"></option> }</datalist>
        </div>
      }
      <div class="grid-2">
        <div class="field"><label for="v-date">Datum</label><input id="v-date" class="input" type="date" [(ngModel)]="date" /></div>
        <div class="field"><label for="v-time">Vreme</label><input id="v-time" class="input" type="time" [(ngModel)]="time" /></div>
      </div>
      <div class="field"><label for="v-reason">Razlog</label><input id="v-reason" class="input" [(ngModel)]="reason" placeholder="npr. Kontrola terapije" maxlength="120" /></div>
      @if (initial()) {
        <div class="field"><span class="label">Status</span>
          <div class="segmented">
            @for (s of statuses; track s.v) { <button type="button" [attr.aria-selected]="status === s.v" (click)="status = s.v">{{ s.l }}</button> }
          </div>
        </div>
      }
      <div class="field"><label for="v-notes">Beleške</label><textarea id="v-notes" class="textarea" [(ngModel)]="notes" maxlength="2000"></textarea></div>
      <div class="field"><label for="v-fu">Sledeća kontrola (opciono)</label><input id="v-fu" class="input" type="date" [(ngModel)]="followUp" /></div>
      <div class="field">
        <span class="label">Podsetnici</span>
        <div class="card flat tight">
          @for (p of presets; track p.key) {
            <label class="row between" style="padding:6px 0">
              <span class="small">{{ p.label }}</span>
              <span class="switch"><input type="checkbox" [checked]="selected().includes(p.key)" (change)="toggle(p.key)" [attr.aria-label]="p.label" /><span></span></span>
            </label>
          }
        </div>
      </div>
      <div class="sheet-actions"><button class="btn primary lg block" type="button" [disabled]="busy() || !date || !time" (click)="save()">Sačuvaj kontrolu</button></div>
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitFormComponent implements OnInit {
  readonly family = inject(FamilyService);
  readonly children = inject(ChildService);
  private readonly visits = inject(VisitService);
  private readonly reminders = inject(ReminderService);
  private readonly toast = inject(ToastService);

  readonly initial = input<DoctorVisit | null>(null);
  readonly defaultDate = input<string | null>(null);
  readonly saved = output<DoctorVisit>();

  readonly presets = VISIT_PRESETS;
  readonly specialties = SPECIALTIES;
  readonly statuses: { v: VisitStatus; l: string }[] = [{ v: 'scheduled', l: 'Zakazano' }, { v: 'completed', l: 'Obavljeno' }, { v: 'cancelled', l: 'Otkazano' }];
  readonly selected = signal<string[]>(['7d', '1d', '0d']);
  readonly busy = signal(false);

  doctorId = '';
  newDoctor = { name: '', specialty: 'Dečja endokrinologija', clinic: '' };
  date = toLocalDate(addDays(new Date(), 7));
  time = '09:00';
  reason = '';
  notes = '';
  followUp = '';
  status: VisitStatus = 'scheduled';

  async ngOnInit(): Promise<void> {
    const v = this.initial();
    if (this.defaultDate()) this.date = this.defaultDate()!;
    if (!v) {
      this.doctorId = this.family.doctors()[0]?.id ?? '';
      return;
    }
    const at = new Date(v.scheduled_at);
    this.doctorId = v.doctor_id ?? '';
    this.date = toLocalDate(at);
    this.time = toLocalTime(at);
    this.reason = v.reason ?? '';
    this.notes = v.notes ?? '';
    this.followUp = v.follow_up_date ?? '';
    this.status = v.status;
    this.selected.set(await this.reminders.visitPresetKeys(v.id));
  }

  toggle(key: string): void {
    this.selected.update((l) => (l.includes(key) ? l.filter((k) => k !== key) : [...l, key]));
  }

  async save(): Promise<void> {
    const childId = this.children.selectedChildId();
    if (!childId) return;
    this.busy.set(true);
    try {
      let doctorId: string | null = this.doctorId || null;
      if (doctorId === '__new') {
        if (!this.newDoctor.name.trim()) throw new Error('Unesite ime lekara.');
        doctorId = (await this.family.saveDoctor({ name: this.newDoctor.name.trim(), specialty: this.newDoctor.specialty || null, clinic: this.newDoctor.clinic || null })).id;
      }
      const v = this.initial();
      const saved = await this.visits.save({
        ...(v ?? {}), child_id: v?.child_id ?? childId, doctor_id: doctorId, scheduled_at: combineLocal(this.date, this.time).toISOString(),
        reason: this.reason.trim() || null, notes: this.notes.trim() || null, follow_up_date: this.followUp || null, status: this.status,
        completed_at: this.status === 'completed' ? v?.completed_at ?? new Date().toISOString() : null,
      }, this.selected());
      this.toast.success('Kontrola je sačuvana.');
      this.saved.emit(saved);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Unesite')) this.toast.warning(e.message);
      else this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
