import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DoctorVisit, MedicalDocument } from '../../core/models/models';
import { CATEGORY_LABEL, DocumentService } from '../../core/services/document.service';
import { FamilyService } from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { VISIT_STATUS_LABEL, VisitService } from '../../core/services/visit.service';
import { formatDate, formatDateTime, relativeDays } from '../../core/utils/dates';
import { uuid } from '../../core/utils/uuid';
import { ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';
import { VisitFormComponent } from './visit-form.component';

@Component({
  selector: 'app-visit-detail-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent, SheetComponent, VisitFormComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header [title]="visit() ? visits.label(visit()!) : 'Kontrola'" [back]="true" backLink="/app/doctors">
        @if (visit()) { <button class="icon-btn" type="button" (click)="editOpen.set(true)" aria-label="Izmeni"><app-icon name="edit" /></button> }
      </app-page-header>
      @if (error()) {
        <app-error-state message="Kontrola nije pronađena ili nemate pristup." kind="permission" [retryable]="false" />
      } @else if (!visit()) {
        <app-loading [rows]="2" [height]="120" />
      } @else {
        @let v = visit()!;
        <section class="card stack">
          <div class="row">
            <div class="icon-tile violet"><app-icon name="calendar" /></div>
            <div class="grow"><b>{{ fmtDT(v.scheduled_at) }}</b><div class="small muted">{{ v.status === 'scheduled' ? rel(v.scheduled_at) : statusLabel[v.status] }}</div></div>
            <span class="badge" [class.info]="v.status === 'scheduled'" [class.success]="v.status === 'completed'">{{ statusLabel[v.status] }}</span>
          </div>
          @if (doctor(); as d) {
            <div class="row"><div class="icon-tile"><app-icon name="stethoscope" /></div><div class="grow"><b>{{ d.name }}</b><div class="small muted">{{ d.specialty }}{{ d.specialty && d.clinic ? ' · ' : '' }}{{ d.clinic }}</div></div></div>
          }
          @if (v.reason) { <div><div class="small muted">Razlog</div><div>{{ v.reason }}</div></div> }
          @if (v.notes) { <div><div class="small muted">Beleške</div><div style="white-space:pre-wrap">{{ v.notes }}</div></div> }
          @if (v.follow_up_date) { <div><div class="small muted">Sledeća kontrola</div><div>{{ fmtD(v.follow_up_date) }}</div></div> }
          @if (v.status === 'scheduled') {
            <div class="row">
              <button class="btn success grow" type="button" (click)="setStatus('completed')"><app-icon name="check" [size]="18" /> Obavljeno</button>
              <button class="btn outline" type="button" (click)="setStatus('cancelled')">Otkaži</button>
            </div>
          }
        </section>

        <div class="section-title"><h3>Zadaci</h3></div>
        <div class="card">
          @for (t of v.tasks; track t.id) {
            <label class="check"><input type="checkbox" [checked]="t.done" (change)="toggleTask(t.id)" /><span [style.text-decoration]="t.done ? 'line-through' : 'none'" [class.muted]="t.done">{{ t.text }}</span></label>
          }
          <form class="row" style="margin-top:8px" (ngSubmit)="addTask()">
            <input class="input" name="task" [(ngModel)]="taskText" placeholder="npr. Poneti nalaze" aria-label="Novi zadatak" maxlength="200" />
            <button class="btn outline" type="submit" [disabled]="!taskText.trim()" aria-label="Dodaj zadatak"><app-icon name="plus" [size]="18" /></button>
          </form>
        </div>

        <div class="section-title"><h3>Dokumenti</h3><a [routerLink]="['/app/documents']" [queryParams]="{ visit: v.id }">Dodaj</a></div>
        <div class="card" style="padding:4px 12px">
          @for (d of docs(); track d.id) {
            <a class="list-item" [routerLink]="['/app/documents', d.id]"><span class="icon-tile sm"><app-icon name="file" [size]="16" /></span><span class="grow small"><b>{{ d.title }}</b><span class="tiny muted" style="display:block">{{ cat[d.category] }} · {{ fmtD(d.document_date) }}</span></span></a>
          } @empty { <p class="small muted" style="padding:10px 0">Nema povezanih dokumenata.</p> }
        </div>

        <button class="btn ghost block" style="margin-top:16px; color:var(--danger)" type="button" (click)="remove()"><app-icon name="trash" [size]="18" /> Obriši kontrolu</button>
      }
    </div>
    <app-sheet [open]="editOpen()" title="Izmeni kontrolu" (closed)="editOpen.set(false)">
      @if (editOpen() && visit()) { <app-visit-form [initial]="visit()" (saved)="onSaved($event)" /> }
    </app-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitDetailPage implements OnInit {
  readonly id = input.required<string>();
  readonly visits = inject(VisitService);
  private readonly family = inject(FamilyService);
  private readonly documents = inject(DocumentService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  readonly statusLabel = VISIT_STATUS_LABEL;
  readonly cat = CATEGORY_LABEL;
  readonly visit = signal<DoctorVisit | null>(null);
  readonly docs = signal<MedicalDocument[]>([]);
  readonly error = signal(false);
  readonly editOpen = signal(false);
  readonly doctor = computed(() => this.family.doctors().find((d) => d.id === this.visit()?.doctor_id) ?? null);
  taskText = '';
  fmtDT = formatDateTime;
  fmtD = formatDate;

  async ngOnInit(): Promise<void> {
    try {
      const v = await this.visits.get(this.id());
      if (!v) throw new Error('not found');
      this.visit.set(v);
      this.docs.set((await this.documents.list(v.child_id)).filter((d) => d.doctor_visit_id === v.id));
    } catch {
      this.error.set(true);
    }
  }

  rel(iso: string): string {
    return relativeDays(new Date(iso));
  }

  onSaved(v: DoctorVisit): void {
    this.visit.set(v);
    this.editOpen.set(false);
  }

  async setStatus(status: DoctorVisit['status']): Promise<void> {
    try {
      this.visit.set(await this.visits.setStatus(this.visit()!, status));
      this.toast.success(status === 'completed' ? 'Kontrola je označena kao obavljena.' : 'Kontrola je otkazana.');
    } catch (e) {
      this.toast.error(e);
    }
  }

  async toggleTask(id: string): Promise<void> {
    const v = this.visit()!;
    const tasks = v.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    this.visit.set({ ...v, tasks });
    await this.visits.updateTasks(v, tasks).catch((e) => this.toast.error(e));
  }

  async addTask(): Promise<void> {
    const v = this.visit()!;
    const tasks = [...v.tasks, { id: uuid(), text: this.taskText.trim(), done: false }];
    this.taskText = '';
    this.visit.set({ ...v, tasks });
    await this.visits.updateTasks(v, tasks).catch((e) => this.toast.error(e));
  }

  async remove(): Promise<void> {
    const v = this.visit()!;
    if (!(await this.confirm.ask({ title: 'Obrisati kontrolu?', message: `Kontrola od ${formatDateTime(v.scheduled_at)} i njeni podsetnici biće obrisani. Dokumenti ostaju.`, danger: true, confirmText: 'Obriši' }))) return;
    try {
      await this.visits.remove(v);
      this.toast.success('Kontrola je obrisana.');
      await this.router.navigateByUrl('/app/doctors');
    } catch (e) {
      this.toast.error(e);
    }
  }
}
