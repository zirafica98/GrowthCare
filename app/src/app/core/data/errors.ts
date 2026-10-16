export type AppErrorKind =
  | 'network'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'upload'
  | 'ocr'
  | 'unknown';

/**
 * Normalised error. `message` is always a safe, user-facing Serbian string —
 * raw backend errors are never shown to the user (they stay in `cause`).
 */
export class AppError extends Error {
  constructor(
    public readonly kind: AppErrorKind,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const MESSAGES: Record<AppErrorKind, string> = {
  network: 'Nema veze sa serverom. Promena je sačuvana i biće poslata kada se veza vrati.',
  auth: 'Sesija je istekla. Prijavite se ponovo.',
  permission: 'Nemate pristup ovim podacima.',
  not_found: 'Podatak nije pronađen.',
  conflict: 'Ovaj unos je već zabeležen.',
  validation: 'Proverite unete podatke.',
  upload: 'Otpremanje nije uspelo. Pokušajte ponovo.',
  ocr: 'Nismo uspeli da očitamo dokument.',
  unknown: 'Došlo je do greške. Pokušajte ponovo.',
};

export function appError(kind: AppErrorKind, cause?: unknown, message?: string): AppError {
  return new AppError(kind, message ?? MESSAGES[kind], cause);
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof AppError) return err.kind === 'network';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  return /Failed to fetch|NetworkError|Load failed|network|ECONNREFUSED|timeout/i.test(msg);
}

/** Map anything thrown by a backend into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isNetworkError(err)) return appError('network', err);
  const e = err as { code?: string; status?: number; message?: string };
  if (e?.code === '23505') return appError('conflict', err);
  if (e?.code === '42501' || e?.status === 403) return appError('permission', err);
  if (e?.status === 401 || e?.code === 'PGRST301') return appError('auth', err);
  if (e?.code === 'PGRST116' || e?.status === 404) return appError('not_found', err);
  return appError('unknown', err);
}
