import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { GradientBackground } from '@/components/ui/GradientBackground';
import { GlassCard } from '@/components/ui/GlassCard';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { fetchEventDetail } from '@/features/earthquake/services/earthquake';
import type { EarthquakeEvent } from '@/features/earthquake/types';
import { magnitudeColor } from '@/features/earthquake/constants';
import { useTheme } from '@/providers/ThemeProvider';
import { openUrl } from '@/lib/linking/openUrl';

export function EarthquakeDetailScreen({ eventId }: { eventId: string }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EarthquakeEvent | null>(null);
  const [sources, setSources] = useState<Array<Record<string, unknown>>>([]);
  const [cityRelations, setCityRelations] = useState<Array<{ city_code: string; relation_type: string; distance_km: number | null }>>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const data = await fetchEventDetail(eventId);
      if (!mounted) return;
      if (data?.event) {
        setEvent(data.event);
        setSources(data.sources ?? []);
        setCityRelations(data.cityRelations ?? []);
      }
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  if (!event) {
    return (
      <GradientBackground>
        <View style={styles.centered}>
          <Text variant="label">Deprem kaydi bulunamadi.</Text>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={[styles.magHeroPill, { borderColor: `${magnitudeColor(Number(event.magnitude))}88`, backgroundColor: `${magnitudeColor(Number(event.magnitude))}1E` }]}>
              <Text variant="h2" style={{ color: magnitudeColor(Number(event.magnitude)) }}>
                {Number(event.magnitude).toFixed(1)} {event.magnitude_type}
              </Text>
            </View>
            <View style={[styles.sourcePill, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
              <Text variant="caption" secondary>{event.primary_source}</Text>
            </View>
          </View>
          <Text variant="label">{event.place}</Text>
          <Text variant="caption" secondary>{formatDateTime(event.event_time)}</Text>
          <View style={styles.heroStats}>
            <MetricTile label="Derinlik" value={event.depth_km != null ? `${Number(event.depth_km).toFixed(1)} km` : '-'} />
            <MetricTile label="Enlem" value={Number(event.latitude).toFixed(3)} />
            <MetricTile label="Boylam" value={Number(event.longitude).toFixed(3)} />
          </View>
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <Text variant="label">Teknik Detaylar</Text>
          <DetailRow label="Tarih / Saat" value={formatDateTime(event.event_time)} />
          <DetailRow label="Buyukluk" value={`${Number(event.magnitude).toFixed(1)} ${event.magnitude_type}`} />
          <DetailRow label="Derinlik" value={event.depth_km != null ? `${Number(event.depth_km).toFixed(1)} km` : '-'} />
          <DetailRow label="Enlem" value={Number(event.latitude).toFixed(4)} />
          <DetailRow label="Boylam" value={Number(event.longitude).toFixed(4)} />
          <DetailRow label="Kaynak" value={event.primary_source} />
          <DetailRow label="Deprem Kimligi" value={event.primary_source_event_id} />
          <DetailRow label="Son Guncelleme" value={event.source_updated_at ? formatDateTime(event.source_updated_at) : '-'} />
        </GlassCard>

        <GlassCard style={styles.mapWrap}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: Number(event.latitude),
              longitude: Number(event.longitude),
              latitudeDelta: 1.5,
              longitudeDelta: 1.5,
            }}
          >
            <Marker
              coordinate={{ latitude: Number(event.latitude), longitude: Number(event.longitude) }}
              pinColor={magnitudeColor(Number(event.magnitude))}
              title={`${Number(event.magnitude).toFixed(1)} ${event.magnitude_type}`}
              description={event.place}
            />
          </MapView>
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <Text variant="label">Kaynak Bilgisi</Text>
          {sources.length === 0 ? (
            <Text variant="caption" secondary>Kaynak kaydi bulunamadi.</Text>
          ) : (
            sources.map((source) => (
              <View
                key={`${String(source.source_name)}-${String(source.source_event_id)}`}
                style={[styles.sourceCard, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              >
                <View style={styles.rowBetween}>
                  <Text variant="caption" style={{ fontWeight: '700' }}>
                    {String(source.source_name)}
                  </Text>
                  <Text variant="caption" secondary>{String(source.source_event_id)}</Text>
                </View>
                <View style={styles.infoRowWrap}>
                  <InfoPill label="Buyukluk" value={`${source.observed_magnitude != null ? Number(source.observed_magnitude).toFixed(1) : '-'} ${String(source.observed_magnitude_type ?? '')}`.trim()} />
                  <InfoPill label="Derinlik" value={source.observed_depth_km != null ? `${Number(source.observed_depth_km).toFixed(1)} km` : '-'} />
                </View>
                {typeof source.source_url === 'string' && source.source_url ? (
                  <Pressable onPress={() => void openUrl(source.source_url)} style={[styles.sourceAction, { borderColor: colors.primary }]}>
                    <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                      Resmi Kaynakta Gor
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <Text variant="label">Sehir Eslestirmeleri</Text>
          {cityRelations.length === 0 ? (
            <Text variant="caption" secondary>Siniflandirilmis sehir bilgisi bulunamadi.</Text>
          ) : (
            <View style={styles.cityWrap}>
              {cityRelations.map((relation) => (
                <View
                  key={`${relation.city_code}-${relation.relation_type}`}
                  style={[styles.cityChip, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>{relation.city_code}</Text>
                  <Text variant="caption" secondary>
                    {relation.relation_type} · {relation.distance_km != null ? `${relation.distance_km.toFixed(1)} km` : '-'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRowWrap}>
      <Text variant="caption" secondary style={styles.detailLabel}>{label}</Text>
      <Text variant="caption">{value}</Text>
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text variant="caption" secondary>{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoPill}>
      <Text variant="caption" secondary>{label}</Text>
      <Text variant="caption">{value}</Text>
    </View>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    gap: spacing.sm,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  magHeroPill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sourcePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricTile: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  sectionCard: {
    gap: spacing.sm,
  },
  mapWrap: {
    height: 310,
    overflow: 'hidden',
    padding: 0,
  },
  map: {
    flex: 1,
  },
  detailRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: 10,
    paddingVertical: 4,
  },
  detailLabel: {
    flex: 1,
  },
  sourceCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'center',
  },
  infoRowWrap: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  infoPill: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 2,
  },
  sourceAction: {
    marginTop: 2,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cityChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 2,
  },
});
