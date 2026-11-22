import type { TipPreferences, TipSurface } from './constants';

export type TipPublicSettings = {
  presetsMinor: number[];
  currency: string;
  minMinor: number;
  maxMinor: number;
  paymentsEnabled: boolean;
};

export type TipCheckoutInput = {
  recipientId: string;
  amountMinor: number;
  surface: TipSurface;
  contextId?: string | null;
  contextLabel?: string | null;
  message?: string | null;
  anonymous?: boolean;
  returnPath?: string;
};

export type TipCheckoutResult = {
  error: string | null;
  tipId: string | null;
};

/** `tip_surfaces_for` yanıtı: kullanıcı kimliği → bölüm tercihleri. */
export type TipSurfacesByUser = Record<string, TipPreferences>;
