import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { getChatPollIntervalMs } from '@/lib/device/androidPerfProfile';

type UseChatBackgroundSyncOptions = {
  enabled: boolean;
  /** Ekrana dönünce tam senkron (çık-gir kaçırılanlar). */
  onFocusRefresh: () => void | Promise<void>;
  /** Odaktayken periyodik artımlı senkron. */
  onPollRefresh: () => void | Promise<void>;
};

/**
 * Sohbet periyodik senkronu.
 *
 * Önceden `setInterval` route blur'unda temizleniyordu ama uygulama arka plana
 * geçince (route hâlâ "focused") çalışmaya devam ediyordu: Android'de 8 sn'de bir
 * ağ isteği, uygulama kapalı ekrandayken bile. Artık interval bir ref'te tutulur
 * ve `AppState !== 'active'` olduğunda durdurulup öne gelince yeniden başlatılır.
 */
export function useChatBackgroundSync({
  enabled,
  onFocusRefresh,
  onPollRefresh,
}: UseChatBackgroundSyncOptions) {
  const focusRef = useRef(onFocusRefresh);
  const pollRef = useRef(onPollRefresh);
  focusRef.current = onFocusRefresh;
  pollRef.current = onPollRefresh;

  const isFocused = useIsFocused();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void pollRef.current();
    }, getChatPollIntervalMs());
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      void focusRef.current();
      void pollRef.current();
      if (AppState.currentState === 'active') startPolling();

      return stopPolling;
    }, [enabled, startPolling, stopPolling]),
  );

  useEffect(() => {
    if (!enabled) return;

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        if (!isFocused) return;
        void pollRef.current();
        startPolling();
        return;
      }
      // Arka plan / inaktif: ağ isteği üretme.
      stopPolling();
    });

    return () => {
      sub.remove();
      stopPolling();
    };
  }, [enabled, isFocused, startPolling, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);
}
