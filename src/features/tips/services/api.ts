import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase/client';
import { edgeFunctionErrorMessage, supabaseErrorMessage } from '@/lib/errors';
import { openUrl } from '@/lib/linking/openUrl';
import {
  TIP_CURRENCY,
  TIP_PRESETS_MINOR,
  type TipPreferences,
} from '@/features/tips/constants';
import type {
  TipCheckoutInput,
  TipCheckoutResult,
  TipPublicSettings,
  TipSurfacesByUser,
} from '@/features/tips/types';
import { normalizeTipPreferences } from '@/features/tips/utils';

type RpcError = { message: string } | null;

type RpcResult<T> = { data: T | null; error: string | null };

type SupabaseRpcClient = {
  rpc: (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError }>;
};

const rpcClient = supabase as unknown as SupabaseRpcClient;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error } = await rpcClient.rpc(fn, args);
  if (error) return { data: null, error: supabaseErrorMessage(error) };
  return { data: (data as T | null) ?? null, error: null };
}

/** Stripe bahşiş ödemesi için kullanılan genel ayarlar. */
export async function loadTipPublicSettings(): Promise<TipPublicSettings> {
  const { data } = await rpc<Record<string, unknown>>('vv_public_settings');
  const raw = data ?? {};

  const presets = Array.isArray(raw.tip_presets_minor)
    ? raw.tip_presets_minor
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 100)
    : [];

  return {
    presetsMinor: presets.length > 0 ? presets : [...TIP_PRESETS_MINOR],
    currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : TIP_CURRENCY,
    minMinor: Number(raw.min_tip_minor ?? 100) || 100,
    maxMinor: Number(raw.max_tip_minor ?? 5_000_000) || 5_000_000,
    paymentsEnabled: raw.payments_enabled !== false,
  };
}

/** Kullanıcının kendi bahşiş tercihleri (sunucu varsayılanlarıyla birleşik). */
export async function loadMyTipPreferences(): Promise<RpcResult<TipPreferences>> {
  const result = await rpc<unknown>('tip_get_preferences');
  if (result.error) return { data: null, error: result.error };
  return { data: normalizeTipPreferences(result.data), error: null };
}

export async function saveTipPreference(
  surface: string,
  enabled: boolean,
): Promise<RpcResult<TipPreferences>> {
  const result = await rpc<unknown>('tip_set_preference', {
    p_surface: surface,
    p_enabled: enabled,
  });
  if (result.error) return { data: null, error: result.error };
  return { data: normalizeTipPreferences(result.data), error: null };
}

/** Birden çok kullanıcının bölüm tercihlerini tek çağrıda getirir. */
export async function loadTipSurfacesFor(
  userIds: string[],
): Promise<RpcResult<TipSurfacesByUser>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return { data: {}, error: null };

  const mapped: TipSurfacesByUser = {};
  // Sunucu tek çağrıda en fazla 100 kullanıcı kabul eder; kalanları parçala.
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const result = await rpc<unknown>('tip_surfaces_for', { p_user_ids: chunk });
    if (result.error) return { data: null, error: result.error };

    const raw = result.data && typeof result.data === 'object' ? result.data : {};
    for (const [userId, prefs] of Object.entries(raw as Record<string, unknown>)) {
      mapped[userId] = normalizeTipPreferences(prefs);
    }
  }
  return { data: mapped, error: null };
}

type EdgeTipResponse = {
  ok?: boolean;
  tip_id?: string;
  url?: string;
  error?: string;
};

async function invokeTipCheckout(
  input: TipCheckoutInput,
): Promise<{ data: EdgeTipResponse | null; error: string | null }> {
  const successUrl = Linking.createURL(input.returnPath ?? '');
  const { data, error } = await supabase.functions.invoke<EdgeTipResponse>(
    'stripe-create-video-tip',
    {
      body: {
        creatorId: input.recipientId,
        amountMinor: input.amountMinor,
        message: input.message ?? null,
        anonymous: input.anonymous === true,
        surface: input.surface,
        contextId: input.contextId ?? null,
        contextLabel: input.contextLabel ?? null,
        successUrl,
        cancelUrl: successUrl,
      },
    },
  );

  if (error) {
    const message = await edgeFunctionErrorMessage(error, null, {
      fallback: 'Bahşiş başlatılamadı. Lütfen tekrar dene.',
    });
    return { data: null, error: message };
  }
  if (!data) return { data: null, error: 'Sunucu yanıtı alınamadı.' };
  if (data.error) return { data: null, error: data.error };
  if (!data.url) return { data: null, error: 'Ödeme sayfası oluşturulamadı.' };
  return { data, error: null };
}

/**
 * Bahşiş ödeme oturumunu açar. Tutar/komisyon istemcide hesaplanmaz; sunucu
 * `vv_prepare_tip` üzerinden bölüm tercihini ve tutar sınırlarını doğrular.
 */
export async function startTipCheckout(
  input: TipCheckoutInput,
): Promise<TipCheckoutResult> {
  const { data: current } = await supabase.auth.getSession();
  if (!current.session) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (!refreshed.session) {
      return { error: 'Bahşiş göndermek için oturum açmalısın.', tipId: null };
    }
  }

  const created = await invokeTipCheckout(input);
  if (created.error || !created.data?.url) {
    return { error: created.error ?? 'Ödeme sayfası oluşturulamadı.', tipId: null };
  }

  const successUrl = Linking.createURL(input.returnPath ?? '');
  try {
    await WebBrowser.openAuthSessionAsync(created.data.url, successUrl);
  } catch {
    await openUrl(created.data.url);
  }

  return { error: null, tipId: created.data.tip_id ?? null };
}
