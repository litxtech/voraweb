export type EarthquakeEvent = {
  id: string;
  event_time: string;
  magnitude: number;
  magnitude_type: string;
  depth_km: number | null;
  latitude: number;
  longitude: number;
  place: string;
  city_code: string | null;
  district: string | null;
  primary_source: 'AFAD' | 'USGS';
  primary_source_event_id: string;
  official_source_url: string | null;
  source_updated_at: string | null;
  updated_at: string;
};

export type EarthquakeProviderStatus = {
  provider_name: 'AFAD' | 'USGS';
  is_healthy: boolean;
  last_success_at: string | null;
  last_check_at: string | null;
};

export type EarthquakeCity = {
  city_code: string;
  plate_no: number;
  name: string;
};

export type EarthquakePreference = {
  notifications_enabled: boolean;
  notification_scope: 'selected_cities' | 'all_turkey' | 'disabled';
  min_magnitude: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_timezone: string;
  os_permission_granted?: boolean | null;
};

export type EarthquakeNotificationDelivery = {
  id: string;
  event_id: string;
  status: 'queued' | 'sent' | 'failed' | 'read' | 'deleted';
  notification_created_at: string;
  sent_at: string | null;
  read_at: string | null;
  payload: Record<string, unknown>;
  earthquake_events?: EarthquakeEvent;
};
