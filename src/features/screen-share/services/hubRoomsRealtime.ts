import { supabase } from '@/lib/supabase/client';
import { subscribeSupabaseChannel } from '@/lib/supabase/realtimeChannel';

/**
 * Hub açıkken yeni/kapanan odaları anında yakala.
 * Payload kullanılmaz (şifre hash’i vs.) — yalnızca soft-refresh tetikler.
 */
export async function subscribeHubRoomsRealtime(
  onChange: () => void,
): Promise<() => Promise<void>> {
  const channel = await subscribeSupabaseChannel('screen-share-hub-rooms', (ch) =>
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'screen_share_sessions' },
      () => onChange(),
    ),
  );

  return async () => {
    await supabase.removeChannel(channel);
  };
}
