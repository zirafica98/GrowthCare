import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { formatDate, MONTHS_SR } from '../../core/utils/dates';

export interface ChartPoint {
  date: string;
  value: number;
}

function niceStep(range: number, ticks: number): number {
  const raw = range / Math.max(1, ticks);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Lightweight responsive SVG line chart (no chart dependency → small, offline,
 * accessible). Includes a screen-reader data table.
 */
@Component({
  selector: 'app-line-chart',
  template: `
    @let g = geo();
    <figure class="chart" [attr.aria-label]="ariaLabel()">
      <svg [attr.viewBox]="'0 0 ' + g.w + ' ' + height()" [attr.width]="g.w" [attr.height]="height()" role="img" [attr.aria-label]="ariaLabel()">
        <defs>
          <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" [attr.stop-color]="color()" stop-opacity=".22" />
            <stop offset="1" [attr.stop-color]="color()" stop-opacity="0" />
          </linearGradient>
        </defs>
        @for (t of g.yTicks; track t.v) {
          <line [attr.x1]="g.left" [attr.x2]="g.w - g.right" [attr.y1]="t.y" [attr.y2]="t.y" class="grid" />
          <text [attr.x]="g.left - 8" [attr.y]="t.y + 4" text-anchor="end" class="tick">{{ t.label }}</text>
        }
        @for (t of g.xTicks; track t.x) {
          <text [attr.x]="t.x" [attr.y]="height() - 6" text-anchor="middle" class="tick">{{ t.label }}</text>
        }
        @if (g.pts.length > 1) {
          <path [attr.d]="g.area" [attr.fill]="'url(#' + gradId + ')'" />
          <path [attr.d]="g.line" fill="none" [attr.stroke]="color()" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        }
        @for (p of g.pts; track $index; let last = $last) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="last ? 5 : 3.2" [attr.fill]="last ? color() : '#fff'" [attr.stroke]="color()" stroke-width="2" />
        }
        @if (g.pts.length) {
          @let lp = g.pts[g.pts.length - 1];
          <text [attr.x]="lp.x" [attr.y]="lp.y - 11" text-anchor="end" class="val" [attr.fill]="color()">{{ fmt(lp.v) }} {{ unit() }}</text>
        }
      </svg>
      <div class="sr-only"><table>
        <caption>{{ ariaLabel() }}</caption>
        <tr><th>Datum</th><th>Vrednost</th></tr>
        @for (p of sorted(); track $index) { <tr><td>{{ formatDate(p.date) }}</td><td>{{ fmt(p.value) }} {{ unit() }}</td></tr> }
      </table></div>
    </figure>`,
  styles: [`
    :host { display: block; width: 100%; }
    .chart { margin: 0; width: 100%; overflow: hidden; position: relative; }
    svg { display: block; max-width: 100%; }
    .grid { stroke: #e8eef6; stroke-width: 1; }
    .tick { font-size: 11px; fill: #8a96aa; font-family: var(--font); }
    .val { font-size: 12px; font-weight: 700; font-family: var(--font); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineChartComponent {
  readonly points = input.required<ChartPoint[]>();
  readonly unit = input('');
  readonly color = input('#2f6fe4');
  readonly height = input(200);
  readonly label = input('Grafikon');
  readonly decimals = input(1);

  readonly formatDate = formatDate;
  readonly gradId = `g${Math.random().toString(36).slice(2, 8)}`;
  private readonly width = signal(340);
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.host.nativeElement as HTMLElement;
      const ro = new ResizeObserver(() => this.width.set(Math.max(240, Math.floor(el.clientWidth))));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  readonly sorted = computed(() => [...this.points()].sort((a, b) => a.date.localeCompare(b.date)));
  readonly ariaLabel = computed(() => {
    const s = this.sorted();
    if (!s.length) return `${this.label()}: nema podataka`;
    const last = s[s.length - 1];
    return `${this.label()}: ${s.length} merenja, poslednje ${this.fmt(last.value)} ${this.unit()} (${formatDate(last.date)})`;
  });

  fmt(v: number): string {
    return v.toLocaleString('sr-Latn', { maximumFractionDigits: this.decimals() });
  }

  readonly geo = computed(() => {
    const w = this.width();
    const h = this.height();
    const left = 40, right = 14, top = 22, bottom = 26;
    const s = this.sorted();
    if (!s.length) return { w, left, right, pts: [], yTicks: [], xTicks: [], line: '', area: '' };
    const xs = s.map((p) => Date.parse(p.date));
    const vs = s.map((p) => p.value);
    let min = Math.min(...vs), max = Math.max(...vs);
    if (min === max) { min -= 1; max += 1; }
    const step = niceStep(max - min, 4);
    const y0 = Math.floor(min / step) * step;
    const y1 = Math.ceil(max / step) * step;
    const x0 = Math.min(...xs), x1 = Math.max(...xs) === x0 ? x0 + 86_400_000 : Math.max(...xs);
    const px = (t: number) => left + ((t - x0) / (x1 - x0)) * (w - left - right);
    const py = (v: number) => top + (1 - (v - y0) / (y1 - y0)) * (h - top - bottom);
    const pts = s.map((p, i) => ({ x: s.length === 1 ? (left + w - right) / 2 : px(xs[i]), y: py(p.value), v: p.value }));
    const yTicks = [];
    for (let v = y0; v <= y1 + step / 2; v += step) yTicks.push({ v, y: py(v), label: v.toLocaleString('sr-Latn', { maximumFractionDigits: 1 }) });
    const nx = Math.min(5, Math.max(2, Math.floor((w - left - right) / 70)));
    const spanDays = (x1 - x0) / 86_400_000;
    const xTicks = Array.from({ length: nx }, (_, i) => {
      const t = x0 + ((x1 - x0) * i) / (nx - 1);
      const d = new Date(t);
      const label = spanDays > 200 ? `${MONTHS_SR[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}` : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
      return { x: px(t), label };
    });
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const base = h - bottom;
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;
    return { w, left, right, pts, yTicks, xTicks, line, area };
  });
}
