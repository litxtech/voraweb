import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/providers/AuthProvider';
import {
  TIP_DEFAULT_PREFERENCES,
  type TipPreferences,
  type TipSurface,
} from '@/features/tips/constants';
import {
  loadMyTipPreferences,
  loadTipSurfacesFor,
  saveTipPreference,
} from '@/features/tips/services/api';
import { normalizeTipPreferences } from '@/features/tips/utils';

// ---------------------------------------------------------------------------
// Karşı tarafın bölüm tercihleri — kısa ömürlü önbellek + istek birleştirme
// ---------------------------------------------------------------------------

const RECIPIENT_TTL_MS = 15 * 1000;

const recipientCache = new Map<string, { prefs: TipPreferences; at: number }>();

function readCachedRecipient(userId: string | null | undefined): TipPreferences | null {
  if (!userId) return null;
  const entry = recipientCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.at > RECIPIENT_TTL_MS) {
    recipientCache.delete(userId);
    return null;
  }
  return entry.prefs;
}

let pendingIds = new Set<string>();
let pendingWaiters: Array<() => void> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRecipientFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushRecipientPrefs();
  }, 25);
}

async function flushRecipientPrefs() {
  const ids = [...pendingIds];
  pendingIds = new Set<string>();
  const waiters = pendingWaiters;
  pendingWaiters = [];

  try {
    if (ids.length > 0) {
      const { data, error } = await loadTipSurfacesFor(ids);
      if (!error) {
        const at = Date.now();
        for (const id of ids) {
          recipientCache.set(id, {
            prefs: data?.[id] ?? { ...TIP_DEFAULT_PREFERENCES },
            at,
          });
        }
      }
    }
  } catch {
    // Ağ hatasında butonlar gizli kalır; bir sonraki denemede yeniden sorgulanır.
  } finally {
    for (const resolve of waiters) resolve();
  }
}

/**
 * Bir kullanıcının bahşiş tercihlerini ister. Aynı kare içinde gelen istekler
 * tek RPC çağrısında birleştirilir; akış kartları kart başına ağ isteği açmaz.
 */
export function requestRecipientTipPreferences(userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const missing = unique.filter((id) => !readCachedRecipient(id));

  if (missing.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    for (const id of missing) pendingIds.add(id);
    pendingWaiters.push(resolve);
    scheduleRecipientFlush();
  });
}

/** Test/oturum değişimi için önbelleği temizler. */
export function clearTipPreferenceCaches() {
  recipientCache.clear();
  ownCache = null;
  pendingIds = new Set<string>();
  pendingWaiters = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Kullanıcının kendi tercihleri
// ---------------------------------------------------------------------------

type OwnCache = { userId: string; prefs: TipPreferences };

let ownCache: OwnCache | null = null;
const ownListeners = new Set<(prefs: TipPreferences) => void>();

function publishOwnPreferences(userId: string, prefs: TipPreferences) {
  ownCache = { userId, prefs };
  for (const listener of ownListeners) listener(prefs);
}

/**
 * `recipientId` için `surface` bölümünde bahşiş butonu gösterilmeli mi?
 * Kendi içeriğinde, oturum yokken veya tercih kapalıyken false döner.
 */
export function useTipAllowed(
  recipientId: string | null | undefined,
  surface: TipSurface,
): boolean {
  const { user } = useAuth();
  const eligible = Boolean(recipientId) && Boolean(user) && recipientId !== user?.id;
  const key = `${recipientId ?? ''}:${surface}`;

  const [state, setState] = useState<{ key: string; allowed: boolean }>(() => ({
    key,
    allowed: eligible && recipientId ? readCachedRecipient(recipientId)?.[surface] === true : false,
  }));

  useEffect(() => {
    if (!eligible || !recipientId) {
      setState({ key, allowed: false });
      return;
    }

    const cached = readCachedRecipient(recipientId);
    if (cached) {
      setState({ key, allowed: cached[surface] === true });
      return;
    }

    let cancelled = false;
    setState({ key, allowed: false });
    void requestRecipientTipPreferences([recipientId]).then(() => {
      if (cancelled) return;
      setState({ key, allowed: readCachedRecipient(recipientId)?.[surface] === true });
    });

    return () => {
      cancelled = true;
    };
  }, [eligible, key, recipientId, surface, user?.id]);

  return state.key === key ? state.allowed : false;
}

/** Ayarlar ekranı için kullanıcının kendi bahşiş tercihleri ve kaydetme. */
export function useTipPreferences() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [prefs, setPrefs] = useState<TipPreferences | null>(() => {
    if (ownCache && ownCache.userId === userId) return ownCache.prefs;
    return null;
  });
  const [loading, setLoading] = useState(!prefs);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setPrefs(null);
      setLoading(false);
      return;
    }

    if (ownCache && ownCache.userId === userId) {
      setPrefs(ownCache.prefs);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadMyTipPreferences().then((result) => {
      if (cancelled) return;
      if (result.data) {
        publishOwnPreferences(userId, result.data);
        setPrefs(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const listener = (next: TipPreferences) => setPrefs(next);
    ownListeners.add(listener);
    return () => {
      ownListeners.delete(listener);
    };
  }, [userId]);

  const update = useCallback(
    async (surface: TipSurface, enabled: boolean): Promise<{ error: string | null }> => {
      if (!userId) return { error: 'Oturum gerekli.' };

      const previous = ownCache && ownCache.userId === userId ? ownCache.prefs : null;
      const optimistic: TipPreferences = {
        ...(previous ?? TIP_DEFAULT_PREFERENCES),
        [surface]: enabled,
      };
      publishOwnPreferences(userId, optimistic);

      const result = await saveTipPreference(surface, enabled);
      if (result.error || !result.data) {
        if (previous) publishOwnPreferences(userId, previous);
        return { error: result.error ?? 'Tercih kaydedilemedi.' };
      }

      publishOwnPreferences(userId, result.data);
      return { error: null };
    },
    [userId],
  );

  return {
    prefs: prefs ?? TIP_DEFAULT_PREFERENCES,
    loading,
    error,
    update,
  };
}