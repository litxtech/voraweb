import { supabase } from '@/lib/supabase/client';
import { subscribeSupabaseChannel } from '@/lib/supabase/realtimeChannel';
import type {
  EarthquakeCity,
  EarthquakeEvent,
  EarthquakeNotificationDelivery,
  EarthquakePreference,
  EarthquakeProviderStatus,
} from '@/features/earthquake/types';

type GatewayPayload = Record<string, unknown> & { action: string };
const USGS_FALLBACK_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

async function invokeGateway<T>(payload: GatewayPayload): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke('earthquake-gateway', { body: payload });
  if (error || !data) return null;
  return data as T;
}

export async function fetchRecentEarthquakes(params?: {
  limit?: number;
  minMagnitude?: number;
  cityCodes?: string[];
}): Promise<{
  events: EarthquakeEvent[];
  summary: {
    lastEarthquake: EarthquakeEvent | null;
    count24h: number;
    maxMagnitude24h: number | null;
    lastUpdatedAt: string | null;
    providerStatus: EarthquakeProviderStatus[];
  };
}> {
  const data = await invokeGateway<{
    events: EarthquakeEvent[];
    summary: {
      lastEarthquake: EarthquakeEvent | null;
      count24h: number;
      maxMagnitude24h: number | null;
      lastUpdatedAt: string | null;
      providerStatus: EarthquakeProviderStatus[];
    };
  }>({
    action: 'recent',
    limit: params?.limit ?? 50,
    minMagnitude: params?.minMagnitude ?? 0,
    cityCodes: params?.cityCodes ?? [],
  });

  if (data && data.events.length > 0) {
    return data;
  }

  const fallbackEvents = await fetchUsgsFallbackEvents(params?.limit ?? 50, params?.minMagnitude ?? 0);
  if (fallbackEvents.length > 0) {
    return {
      events: fallbackEvents,
      summary: {
        lastEarthquake: fallbackEvents[0] ?? null,
        count24h: fallbackEvents.length,
        maxMagnitude24h: fallbackEvents.reduce((max, item) => Math.max(max, Number(item.magnitude ?? 0)), 0) || null,
        lastUpdatedAt: fallbackEvents[0]?.source_updated_at ?? fallbackEvents[0]?.event_time ?? null,
        providerStatus: [
          {
            provider_name: 'USGS',
            is_healthy: true,
            last_success_at: fallbackEvents[0]?.source_updated_at ?? fallbackEvents[0]?.event_time ?? null,
            last_check_at: new Date().toISOString(),
          },
        ],
      },
    };
  }

  return data ?? {
    events: [],
    summary: {
      lastEarthquake: null,
      count24h: 0,
      maxMagnitude24h: null,
      lastUpdatedAt: null,
      providerStatus: [],
    },
  };
}

export async function fetchHistory(params: {
  page: number;
  pageSize: number;
  minMagnitude: number;
  sortBy: 'largest' | 'smallest' | 'newest' | 'oldest';
  cityCodes?: string[];
  startAt?: string | null;
  endAt?: string | null;
}) {
  return invokeGateway<{
    page: number;
    pageSize: number;
    total: number;
    events: EarthquakeEvent[];
    stats: {
      total: number;
      maxMagnitude: number | null;
      avgMagnitude: number;
      dailyCounts: Array<{ date: string; value: number }>;
      magnitudeBuckets: Record<string, number>;
      depthBuckets: Record<string, number>;
      range: { startAt: string | null; endAt: string | null };
    };
  }>({
    action: 'history',
    ...params,
  });
}

export async function fetchEventDetail(eventId: string) {
  const data = await invokeGateway<{
    event: EarthquakeEvent;
    sources: Array<Record<string, unknown>>;
    cityRelations: Array<{ city_code: string; relation_type: string; distance_km: number | null }>;
    error?: string;
  }>({
    action: 'detail',
    eventId,
  });

  if (data?.event && !data?.error) return data;

  if (eventId.startsWith('usgs:')) {
    const sourceId = eventId.replace('usgs:', '');
    const fallbackEvent = await fetchUsgsFallbackEventBySourceId(sourceId);
    if (fallbackEvent) {
      return {
        event: fallbackEvent,
        sources: [
          {
            source_name: 'USGS',
            source_event_id: fallbackEvent.primary_source_event_id,
            observed_magnitude: fallbackEvent.magnitude,
            observed_magnitude_type: fallbackEvent.magnitude_type,
            observed_depth_km: fallbackEvent.depth_km,
            source_url: fallbackEvent.official_source_url,
          },
        ],
        cityRelations: [],
      };
    }
  }

  return data;
}

export async function fetchEarthquakeCities(): Promise<EarthquakeCity[]> {
  const data = await invokeGateway<{ cities: EarthquakeCity[] }>({ action: 'cities' });
  return data?.cities ?? [];
}

export async function fetchPreferences(): Promise<{
  preference: EarthquakePreference;
  selectedCities: Array<{ city_code: string; group_type: string }>;
}> {
  const data = await invokeGateway<{
    preference: EarthquakePreference;
    selectedCities: Array<{ city_code: string; group_type: string }>;
  }>({ action: 'preferences_get' });

  return data ?? {
    preference: {
      notifications_enabled: true,
      notification_scope: 'selected_cities',
      min_magnitude: 4,
      quiet_hours_enabled: false,
      quiet_hours_start: '23:00',
      quiet_hours_end: '08:00',
      quiet_hours_timezone: 'Europe/Istanbul',
    },
    selectedCities: [],
  };
}

export async function upsertPreferences(payload: {
  notificationsEnabled: boolean;
  notificationScope: 'selected_cities' | 'all_turkey' | 'disabled';
  minMagnitude: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string;
  osPermissionGranted?: boolean | null;
  lastSyncedDeviceId?: string | null;
}) {
  return invokeGateway<{ ok: boolean; error?: string }>({
    action: 'preferences_upsert',
    ...payload,
  });
}

export async function replacePreferenceCities(cityCodes: string[], groupType: 'living' | 'hometown' | 'following' = 'following') {
  return invokeGateway<{ ok: boolean; count: number; error?: string }>({
    action: 'preferences_replace_cities',
    cityCodes,
    groupType,
  });
}

export async function fetchMyEarthquakeNotifications(page = 1, pageSize = 30) {
  const data = await invokeGateway<{
    page: number;
    pageSize: number;
    total: number;
    items: EarthquakeNotificationDelivery[];
  }>({
    action: 'notifications_history',
    page,
    pageSize,
  });

  return data ?? { page, pageSize, total: 0, items: [] };
}

export async function markDeliveryRead(deliveryId: string) {
  return invokeGateway<{ ok: boolean; error?: string }>({
    action: 'notifications_mark_read',
    deliveryId,
  });
}

export async function deleteDelivery(deliveryId: string) {
  return invokeGateway<{ ok: boolean; error?: string }>({
    action: 'notifications_delete',
    deliveryId,
  });
}

export async function markAllDeliveriesRead() {
  return invokeGateway<{ ok: boolean; error?: string }>({
    action: 'notifications_mark_all_read',
  });
}

export async function subscribeEarthquakeRealtime(onRefresh: () => void): Promise<() => Promise<void>> {
  const channel = await subscribeSupabaseChannel(
    'earthquake-events',
    (baseChannel) =>
      baseChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'earthquake_events' }, onRefresh),
  );
  return async () => {
    await supabase.removeChannel(channel);
  };
}

async function fetchUsgsFallbackEvents(limit: number, minMagnitude: number): Promise<EarthquakeEvent[]> {
  const response = await fetch(USGS_FALLBACK_URL);
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  const features = Array.isArray(payload?.features) ? payload.features : [];

  const mapped = features
    .map(mapUsgsFeatureToEarthquakeEvent)
    .filter((item): item is EarthquakeEvent => !!item)
    .filter((item) => Number(item.magnitude) >= minMagnitude)
    .slice(0, limit);

  return mapped;
}

async function fetchUsgsFallbackEventBySourceId(sourceId: string): Promise<EarthquakeEvent | null> {
  if (!sourceId) return null;
  const events = await fetchUsgsFallbackEvents(300, 0);
  return events.find((item) => item.primary_source_event_id === sourceId) ?? null;
}

function mapUsgsFeatureToEarthquakeEvent(feature: unknown): EarthquakeEvent | null {
  const row = feature as {
    id?: string;
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: unknown[] };
  };
  const sourceId = String(row?.id ?? '').trim();
  const properties = row?.properties ?? {};
  const coords = Array.isArray(row?.geometry?.coordinates) ? row.geometry.coordinates : [];

  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  const depth = Number(coords[2]);
  const magnitude = Number(properties.mag);
  const eventTime = Number(properties.time);
  const updated = Number(properties.updated);
  if (!sourceId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(magnitude) || !Number.isFinite(eventTime)) {
    return null;
  }

  return {
    id: `usgs:${sourceId}`,
    event_time: new Date(eventTime).toISOString(),
    magnitude,
    magnitude_type: String(properties.magType ?? 'M'),
    depth_km: Number.isFinite(depth) ? depth : null,
    latitude,
    longitude,
    place: String(properties.place ?? 'Unknown place'),
    city_code: null,
    district: null,
    primary_source: 'USGS',
    primary_source_event_id: sourceId,
    official_source_url: typeof properties.url === 'string' ? properties.url : null,
    source_updated_at: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}
