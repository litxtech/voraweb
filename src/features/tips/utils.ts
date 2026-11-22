import {
  TIP_DEFAULT_PREFERENCES,
  TIP_SURFACES,
  type TipPreferences,
  type TipSurface,
} from './constants';

export function isTipSurface(value: unknown): value is TipSurface {
  return typeof value === 'string' && (TIP_SURFACES as readonly string[]).includes(value);
}

/** Sunucudan gelen JSONB tercihleri eksiksiz ve tipli bir nesneye çevirir. */
export function normalizeTipPreferences(raw: unknown): TipPreferences {
  const next: TipPreferences = { ...TIP_DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== 'object') return next;

  const record = raw as Record<string, unknown>;
  for (const surface of TIP_SURFACES) {
    const value = record[surface];
    if (typeof value === 'boolean') next[surface] = value;
  }
  return next;
}
