export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';

export interface Filter {
  col: string;
  op: FilterOp;
  value: unknown;
}

export interface Order {
  col: string;
  asc: boolean;
}

export interface Query {
  filters: Filter[];
  order: Order[];
  limit?: number;
}

/** Tiny fluent builder so services read like `q().eq('child_id', id).order('measured_at')`. */
export class QueryBuilder implements Query {
  filters: Filter[] = [];
  order: Order[] = [];
  limit?: number;

  eq(col: string, value: unknown): this { return this.add(col, 'eq', value); }
  neq(col: string, value: unknown): this { return this.add(col, 'neq', value); }
  gt(col: string, value: unknown): this { return this.add(col, 'gt', value); }
  gte(col: string, value: unknown): this { return this.add(col, 'gte', value); }
  lt(col: string, value: unknown): this { return this.add(col, 'lt', value); }
  lte(col: string, value: unknown): this { return this.add(col, 'lte', value); }
  in(col: string, values: unknown[]): this { return this.add(col, 'in', values); }

  orderBy(col: string, asc = true): this {
    this.order.push({ col, asc });
    return this;
  }

  take(n: number): this {
    this.limit = n;
    return this;
  }

  private add(col: string, op: FilterOp, value: unknown): this {
    this.filters.push({ col, op, value });
    return this;
  }
}

export const q = () => new QueryBuilder();

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as string | number) < (b as string | number) ? -1 : 1;
}

export function matchesFilter(row: Record<string, unknown>, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case 'eq': return v === f.value;
    case 'neq': return v !== f.value;
    case 'gt': return compare(v, f.value) > 0;
    case 'gte': return compare(v, f.value) >= 0;
    case 'lt': return compare(v, f.value) < 0;
    case 'lte': return compare(v, f.value) <= 0;
    case 'in': return Array.isArray(f.value) && f.value.includes(v);
  }
}

/** Evaluate a query against in-memory rows (used by the local backend and the offline cache). */
export function applyQuery<T>(rows: T[], query?: Partial<Query>): T[] {
  let out = rows.filter((r) => (query?.filters ?? []).every((f) => matchesFilter(r as Record<string, unknown>, f)));
  const order = query?.order ?? [];
  if (order.length) {
    out = [...out].sort((a, b) => {
      for (const o of order) {
        const c = compare((a as Record<string, unknown>)[o.col], (b as Record<string, unknown>)[o.col]);
        if (c !== 0) return o.asc ? c : -c;
      }
      return 0;
    });
  }
  if (query?.limit !== undefined) out = out.slice(0, query.limit);
  return out;
}
