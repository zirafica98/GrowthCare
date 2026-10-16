import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Child, Sex } from '../../core/models/models';
import { AVATAR_COLORS } from '../../core/services/child.service';
import { toLocalDate } from '../../core/utils/dates';

export interface ChildFormValue {
  first_name: string;
  last_name: string | null;
  date_of_birth: string;
  sex: Sex;
  avatar_color: string;
  birth_weight_g: number | null;
  birth_length_cm: number | null;
}

@Component({
  selector: 'app-child-form',
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="cfn">Ime</label>
          <input id="cfn" class="input" formControlName="first_name" autocomplete="off" />
        </div>
        <div class="field">
          <label for="cln">Prezime (opciono)</label>
          <input id="cln" class="input" formControlName="last_name" autocomplete="off" />
        </div>
      </div>
      <div class="field">
        <label for="cdob">Datum rođenja</label>
        <input id="cdob" class="input" type="date" formControlName="date_of_birth" [max]="today" />
      </div>
      <div class="field">
        <span class="label">Pol (opciono)</span>
        <div class="segmented">
          <button type="button" [attr.aria-selected]="form.controls.sex.value === 'male'" (click)="form.controls.sex.setValue('male')">Dečak</button>
          <button type="button" [attr.aria-selected]="form.controls.sex.value === 'female'" (click)="form.controls.sex.setValue('female')">Devojčica</button>
          <button type="button" [attr.aria-selected]="form.controls.sex.value === null" (click)="form.controls.sex.setValue(null)">Ne navodim</button>
        </div>
      </div>
      <div class="field">
        <span class="label">Boja avatara</span>
        <div class="chips">
          @for (c of colors; track c) {
            <button type="button" class="swatch" [style.background]="c" [attr.aria-pressed]="form.controls.avatar_color.value === c"
              [attr.aria-label]="'Boja ' + ($index + 1)" (click)="form.controls.avatar_color.setValue(c)"></button>
          }
        </div>
      </div>
      <details>
        <summary class="small muted" style="cursor:pointer; padding:6px 0">Podaci na rođenju (opciono)</summary>
        <div class="grid-2" style="margin-top:8px">
          <div class="field"><label for="cbw">Težina (g)</label><input id="cbw" class="input" type="number" inputmode="numeric" formControlName="birth_weight_g" /></div>
          <div class="field"><label for="cbl">Dužina (cm)</label><input id="cbl" class="input" type="number" inputmode="decimal" formControlName="birth_length_cm" /></div>
        </div>
      </details>
      <div class="row" style="justify-content:flex-end">
        <ng-content />
        <button class="btn primary" type="submit" [disabled]="busy()">{{ submitLabel() }}</button>
      </div>
    </form>`,
  styles: [`.swatch { width: 38px; height: 38px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--border-strong); cursor: pointer; }
    .swatch[aria-pressed='true'] { box-shadow: 0 0 0 3px var(--primary); }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChildFormComponent implements OnInit {
  readonly initial = input<Child | null>(null);
  readonly submitLabel = input('Sačuvaj');
  readonly busy = input(false);
  readonly saved = output<ChildFormValue>();
  readonly colors = AVATAR_COLORS;
  readonly today = toLocalDate(new Date());

  readonly form = inject(FormBuilder).group({
    first_name: ['', [Validators.required, Validators.maxLength(50)]],
    last_name: [''],
    date_of_birth: ['', Validators.required],
    sex: [null as Sex],
    avatar_color: [AVATAR_COLORS[0]],
    birth_weight_g: [null as number | null],
    birth_length_cm: [null as number | null],
  });

  ngOnInit(): void {
    const c = this.initial();
    if (c) this.form.patchValue({ ...c, last_name: c.last_name ?? '', avatar_color: c.avatar_color ?? AVATAR_COLORS[0] });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saved.emit({
      first_name: v.first_name!.trim(), last_name: v.last_name?.trim() || null, date_of_birth: v.date_of_birth!, sex: v.sex ?? null,
      avatar_color: v.avatar_color ?? AVATAR_COLORS[0], birth_weight_g: v.birth_weight_g ?? null, birth_length_cm: v.birth_length_cm ?? null,
    });
  }
}
