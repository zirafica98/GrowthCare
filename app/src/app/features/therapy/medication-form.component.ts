import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Medication } from '../../core/models/models';
import { NewMedicationInput } from '../../core/services/therapy.service';
import { toLocalDate } from '../../core/utils/dates';
import { IconComponent } from '../../shared/ui/icon.component';

/** Common product names — suggestions only, the parent types what is prescribed. */
export const MEDICATION_SUGGESTIONS = ['Norditropin', 'Omnitrope', 'Genotropin', 'Saizen', 'Humatrope', 'Zomacton', 'Ngenla', 'Sogroya'];
const WEEKDAYS = [
  { d: 1, l: 'Pon' }, { d: 2, l: 'Uto' }, { d: 3, l: 'Sre' }, { d: 4, l: 'Čet' }, { d: 5, l: 'Pet' }, { d: 6, l: 'Sub' }, { d: 7, l: 'Ned' },
];

@Component({
  selector: 'app-medication-form',
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
      <div class="notice info"><app-icon name="info" [size]="18" /><span>Unesite terapiju tačno onako kako je propisao lekar. GrowthCare ne predlaže niti menja doze.</span></div>
      <div class="field">
        <label for="mname">Naziv leka</label>
        <input id="mname" class="input" formControlName="name" list="med-suggest" autocomplete="off" placeholder="npr. Norditropin" />
        <datalist id="med-suggest">@for (s of suggestions; track s) { <option [value]="s"></option> }</datalist>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="msub">Supstanca (opciono)</label>
          <input id="msub" class="input" formControlName="substance" placeholder="Somatropin" />
        </div>
        <div class="field">
          <label for="mstr">Jačina (opciono)</label>
          <input id="mstr" class="input" formControlName="strength" placeholder="10 mg/1,5 ml" />
        </div>
      </div>
      @if (!editing()) {
        <div class="grid-2">
          <div class="field">
            <label for="mdose">Propisana doza</label>
            <input id="mdose" class="input num" type="number" inputmode="decimal" step="0.01" min="0" formControlName="current_dose" />
          </div>
          <div class="field">
            <label for="munit">Jedinica</label>
            <select id="munit" class="select" formControlName="dose_unit">
              <option value="mg">mg</option><option value="ml">ml</option><option value="IU">IU</option><option value="mcg">mcg</option>
            </select>
          </div>
        </div>
      }
      <div class="field">
        <span class="label">Učestalost</span>
        <div class="segmented" role="tablist">
          <button type="button" role="tab" [attr.aria-selected]="form.controls.freqKind.value === 'daily'" (click)="form.controls.freqKind.setValue('daily')">Svaki dan</button>
          <button type="button" role="tab" [attr.aria-selected]="form.controls.freqKind.value === 'weekly'" (click)="form.controls.freqKind.setValue('weekly')">Određeni dani</button>
        </div>
        @if (form.controls.freqKind.value === 'weekly') {
          <div class="chips" style="margin-top:8px">
            @for (w of weekdays; track w.d) {
              <button type="button" class="chip" [attr.aria-pressed]="days.has(w.d)" (click)="toggleDay(w.d)">{{ w.l }}</button>
            }
          </div>
        }
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="mtime">Vreme primene</label>
          <input id="mtime" class="input" type="time" formControlName="scheduled_time" />
        </div>
        <div class="field">
          <label for="mstart">Početak terapije</label>
          <input id="mstart" class="input" type="date" formControlName="start_date" />
        </div>
      </div>
      <div class="field">
        <label for="mdoc">Lekar koji je propisao (opciono)</label>
        <input id="mdoc" class="input" formControlName="prescribing_doctor" />
      </div>
      <div class="field">
        <label for="mnote">Napomena (opciono)</label>
        <textarea id="mnote" class="textarea" formControlName="notes"></textarea>
      </div>
      <div class="row" style="justify-content:flex-end">
        <ng-content />
        <button class="btn primary" type="submit" [disabled]="busy()">{{ submitLabel() }}</button>
      </div>
    </form>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedicationFormComponent implements OnInit {
  readonly initial = input<Medication | null>(null);
  readonly submitLabel = input('Sačuvaj terapiju');
  readonly busy = input(false);
  readonly saved = output<NewMedicationInput>();

  readonly suggestions = MEDICATION_SUGGESTIONS;
  readonly weekdays = WEEKDAYS;
  days = new Set<number>([1, 2, 3, 4, 5, 6, 7]);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    substance: [''],
    strength: [''],
    current_dose: [null as number | null, [Validators.required, Validators.min(0.0001)]],
    dose_unit: ['mg'],
    freqKind: ['daily' as 'daily' | 'weekly'],
    scheduled_time: ['20:00', Validators.required],
    start_date: [toLocalDate(new Date()), Validators.required],
    prescribing_doctor: [''],
    notes: [''],
  });

  editing(): boolean {
    return !!this.initial();
  }

  ngOnInit(): void {
    const m = this.initial();
    if (!m) return;
    const weekly = m.frequency.startsWith('weekly:');
    if (weekly) this.days = new Set(m.frequency.slice(7).split(',').map(Number));
    this.form.patchValue({
      name: m.name, substance: m.substance ?? '', strength: m.strength ?? '', current_dose: m.current_dose, dose_unit: m.dose_unit,
      freqKind: weekly ? 'weekly' : 'daily', scheduled_time: m.scheduled_time, start_date: m.start_date ?? toLocalDate(new Date()),
      prescribing_doctor: m.prescribing_doctor ?? '', notes: m.notes ?? '',
    });
  }

  toggleDay(d: number): void {
    if (this.days.has(d)) this.days.delete(d);
    else this.days.add(d);
    this.days = new Set(this.days);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const frequency = v.freqKind === 'daily' || this.days.size === 7 ? 'daily' : `weekly:${[...this.days].sort().join(',')}`;
    this.saved.emit({
      name: v.name, substance: v.substance || null, strength: v.strength || null, current_dose: Number(v.current_dose),
      dose_unit: v.dose_unit, frequency, scheduled_time: v.scheduled_time, start_date: v.start_date,
      prescribing_doctor: v.prescribing_doctor || null, notes: v.notes || null,
    });
  }
}
