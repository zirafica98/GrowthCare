import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AuditLog } from '../../core/models/models';
import { ACTION_LABEL, AuditService, diff, ENTITY_LABEL } from '../../core/services/audit.service';
import { ChildService } from '../../core/services/child.service';
import { FamilyService } from '../../core/services/family.service';
import { formatDateTime } from '../../core/utils/dates';
import { EmptyStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';

/** Audit trail: who changed what, with before → after values. */
@Component({
  selector: 'app-audit-page',
  imports: [PageHeaderComponent, IconComponent, EmptyStateComponent, LoadingSkeletonComponent],
  template: `
    <div class="page">
      <app-page-header title="Istorija izmena" subtitle="Ko je i kada menjao podatke" [back]="true" />
      <div class="chips" style="margin-bottom:12px">
        @for (e of filters; track e.v) { <button type="button" class="chip" [attr.aria-pressed]="entity() === e.v" (click)="setEntity(e.v)">{{ e.l }}</button> }
      </div>
      @if (loading()) { <app-loading [rows]="6" [height]="56" /> }
      @else {
        <div class="card" style="padding:4px 12px">
          @for (a of logs(); track a.id) {
            <details class="item">
              <summary class="row">
                <span class="icon-tile sm" [class.success]="a.action === 'insert'" [class.danger]="a.action === 'delete'"><app-icon [name]="a.action === 'insert' ? 'plus' : a.action === 'delete' ? 'trash' : 'edit'" [size]="14" /></span>
                <span class="grow"><b class="small">{{ entityLabel(a.entity_type) }} — {{ actionLabel(a.action) }}</b>
                  <span class="tiny muted" style="display:block">{{ fmt(a.created_at) }} · {{ family.memberName(a.user_id) || 'sistem' }}{{ childName(a.child_id) ? ' · ' + childName(a.child_id) : '' }}</span></span>
              </summary>
              <div class="diff">
                @for (d of changes(a); track d.field) { <div class="small">{{ d.label }}: <s class="muted">{{ show(d.before) }}</s> → <b>{{ show(d.after) }}</b></div> }
                @empty { <div class="tiny muted">{{ a.action === 'insert' ? 'Novi zapis.' : a.action === 'delete' ? 'Zapis je obrisan.' : 'Bez promena vrednosti.' }}</div> }
              </div>
            </details>
          } @empty { <app-empty-state title="Nema izmena" /> }
        </div>
      }
    </div>`,
  styles: [`.item { border-bottom: 1px solid var(--border); padding: 10px 0; } .item:last-child { border-bottom: 0; } summary { list-style: none; cursor: pointer; } .diff { padding: 8px 0 0 44px; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditPage implements OnInit {
  readonly family = inject(FamilyService);
  private readonly audit = inject(AuditService);
  private readonly children = inject(ChildService);
  readonly logs = signal<AuditLog[]>([]);
  readonly loading = signal(true);
  readonly entity = signal('');
  readonly filters = [
    { v: '', l: 'Sve' }, { v: 'injections', l: 'Doze' }, { v: 'therapy_changes', l: 'Terapija' }, { v: 'growth_measurements', l: 'Merenja' },
    { v: 'documents', l: 'Dokumenti' }, { v: 'family_members', l: 'Porodica' },
  ];
  fmt = formatDateTime;

  ngOnInit(): void {
    void this.load();
  }

  setEntity(v: string): void {
    this.entity.set(v);
    void this.load();
  }

  async load(): Promise<void> {
    const f = this.family.current();
    if (!f) return;
    this.loading.set(true);
    try {
      this.logs.set(await this.audit.list(f.id, { entityType: this.entity() || undefined }));
    } finally {
      this.loading.set(false);
    }
  }

  entityLabel(t: string): string {
    return ENTITY_LABEL[t] ?? t;
  }
  actionLabel(a: string): string {
    return ACTION_LABEL[a] ?? a;
  }
  childName(id: string | null): string {
    return this.children.children().find((c) => c.id === id)?.first_name ?? '';
  }
  changes(a: AuditLog) {
    return diff(a.old_data, a.new_data);
  }
  show(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
    return String(v);
  }
}
