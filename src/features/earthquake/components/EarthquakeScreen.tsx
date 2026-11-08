import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { router } from 'expo-router';
import { GradientBackground } from '@/components/ui/GradientBackground';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  EARTHQUAKE_DISCLAIMER,
  EARTHQUAKE_MAGNITUDE_OPTIONS,
  EARTHQUAKE_NOTIFICATION_SCOPES,
  EARTHQUAKE_SUBTITLE,
  EARTHQUAKE_TIME_FILTERS,
  EARTHQUAKE_TITLE,
  magnitudeColor,
} from '@/features/earthquake/constants';
import type { EarthquakeCity, EarthquakeEvent, EarthquakePreference, EarthquakeProviderStatus } from '@/features/earthquake/types';
import {
  fetchEarthquakeCities,
  fetchHistory,
  fetchMyEarthquakeNotifications,
  fetchPreferences,
  fetchRecentEarthquakes,
  markAllDeliveriesRead,
  markDeliveryRead,
  replacePreferenceCities,
  subscribeEarthquakeRealtime,
  upsertPreferences,
} from '@/features/earthquake/services/earthquake';

type EarthquakeTab = 'recent' | 'map' | 'history' | 'notifications';
const TABS: Array<{ id: EarthquakeTab; label: string }> = [
  { id: 'recent', label: 'Son Depremler' },
  { id: 'map', label: 'Harita' },
  { id: 'history', label: 'Gecmis' },
  { id: 'notifications', label: 'Bildirimler' },
];

export function EarthquakeScreen() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<EarthquakeTab>('recent');
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EarthquakeEvent[]>([]);
  const [summary, setSummary] = useState({
    count24h: 0,
    maxMagnitude24h: null as number | null,
    lastUpdatedAt: null as string | null,
  });
  const [providerStatus, setProviderStatus] = useState<EarthquakeProviderStatus[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<EarthquakeEvent[]>([]);
  const [historyTimeFilter, setHistoryTimeFilter] = useState<(typeof EARTHQUAKE_TIME_FILTERS)[number]['id']>('30d');
  const [historyYear, setHistoryYear] = useState(String(new Date().getFullYear()));
  const [historySort, setHistorySort] = useState<'largest' | 'smallest' | 'newest' | 'oldest'>('newest');
  const [historyMinMag, setHistoryMinMag] = useState(0);
  const [historyStats, setHistoryStats] = useState<{
    total: number;
    maxMagnitude: number | null;
    avgMagnitude: number;
    dailyCounts: Array<{ date: string; value: number }>;
  } | null>(null);

  const [cities, setCities] = useState<EarthquakeCity[]>([]);
  const [preference, setPreference] = useState<EarthquakePreference | null>(null);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [notifItems, setNotifItems] = useState<Array<Record<string, unknown>>>([]);
  const [savingPref, setSavingPref] = useState(false);
  const cityNameByCode = useMemo(
    () => new Map(cities.map((city) => [city.city_code, city.name])),
    [cities],
  );

  const refreshRecent = useCallback(async () => {
    setLoading(true);
    const data = await fetchRecentEarthquakes({ limit: 100 });
    setEvents(data.events);
    setSummary({
      count24h: data.summary.count24h,
      maxMagnitude24h: data.summary.maxMagnitude24h,
      lastUpdatedAt: data.summary.lastUpdatedAt,
    });
    setProviderStatus(data.summary.providerStatus ?? []);
    setLoading(false);
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { startAt, endAt } = resolveHistoryRange(historyTimeFilter, historyYear);
    const data = await fetchHistory({
      page: 1,
      pageSize: 80,
      minMagnitude: historyMinMag,
      sortBy: historySort,
      startAt,
      endAt,
    });
    if (data) {
      setHistoryEvents(data.events);
      setHistoryStats({
        total: data.stats.total,
        maxMagnitude: data.stats.maxMagnitude,
        avgMagnitude: data.stats.avgMagnitude,
        dailyCounts: data.stats.dailyCounts,
      });
    } else {
      setHistoryEvents([]);
      setHistoryStats(null);
    }
    setHistoryLoading(false);
  }, [historyMinMag, historySort, historyTimeFilter, historyYear]);

  const refreshSettings = useCallback(async () => {
    const [cityRows, prefData, notifHistory] = await Promise.all([
      fetchEarthquakeCities(),
      fetchPreferences(),
      fetchMyEarthquakeNotifications(1, 30),
    ]);
    setCities(cityRows);
    setPreference(prefData.preference);
    setSelectedCities(prefData.selectedCities.map((row) => row.city_code));
    setNotifItems(notifHistory.items as Array<Record<string, unknown>>);
  }, []);

  useEffect(() => {
    void refreshRecent();
    void refreshHistory();
    void refreshSettings();
  }, [refreshHistory, refreshRecent, refreshSettings]);

  useEffect(() => {
    let dispose: (() => Promise<void>) | null = null;
    const bind = async () => {
      dispose = await subscribeEarthquakeRealtime(() => {
        void refreshRecent();
      });
    };
    void bind();
    return () => {
      if (dispose) void dispose();
    };
  }, [refreshRecent]);

  const tabContent = useMemo(() => {
    if (activeTab === 'map') {
      return (
        <View style={styles.sectionGap}>
          <View style={[styles.sectionCard, styles.surfacePanel]}>
            <Text variant="label">Canli Harita</Text>
            <Text variant="caption" secondary>
              Son depremler buyukluk rengine gore harita uzerinde isaretlenir.
            </Text>
          </View>

          <View style={[styles.mapCard, styles.surfacePanel]}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: 39.0,
                longitude: 35.0,
                latitudeDelta: 10.5,
                longitudeDelta: 10.5,
              }}
            >
              {events.map((event) => (
                <Marker
                  key={event.id}
                  coordinate={{ latitude: Number(event.latitude), longitude: Number(event.longitude) }}
                  pinColor={magnitudeColor(Number(event.magnitude))}
                  title={`${Number(event.magnitude).toFixed(1)} ${event.magnitude_type}`}
                  description={`${event.place} · ${formatDateTime(event.event_time)}`}
                  onCalloutPress={() => router.push(`/earthquake/${encodeURIComponent(String(event.id))}` as never)}
                />
              ))}
            </MapView>
          </View>

          <View style={[styles.legendCard, styles.surfacePanel]}>
            <Text variant="caption" secondary>Buyukluk Renk Skalasi</Text>
            <View style={styles.legendRow}>
              <LegendPill label="0-2.9" color="#22C55E" />
              <LegendPill label="3.0-3.9" color="#F59E0B" />
              <LegendPill label="4.0-4.9" color="#F97316" />
              <LegendPill label="5.0+" color="#DC2626" />
            </View>
          </View>
        </View>
      );
    }

    if (activeTab === 'history') {
      return (
        <View style={styles.sectionGap}>
          <View style={[styles.sectionCard, styles.surfacePanel]}>
            <Text variant="label">Gecmis Arsivi</Text>
            <Text variant="caption" secondary>Donem, buyukluk ve siralama secerek deprem gecmisini filtrele.</Text>
          </View>

          <View style={[styles.filterPanel, styles.surfacePanel]}>
            <Text variant="caption" secondary>Zaman Araligi</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {EARTHQUAKE_TIME_FILTERS.map((item) => (
                <FilterChip
                  key={item.id}
                  active={historyTimeFilter === item.id}
                  label={item.label}
                  onPress={() => setHistoryTimeFilter(item.id)}
                />
              ))}
            </ScrollView>

            {historyTimeFilter === 'year' ? (
              <TextInput
                value={historyYear}
                onChangeText={setHistoryYear}
                keyboardType="number-pad"
                placeholder="Yil girin (ornek: 2024)"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: 'rgba(255,255,255,0.08)' }]}
              />
            ) : null}

            <Text variant="caption" secondary>Minimum Buyukluk</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {EARTHQUAKE_MAGNITUDE_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value}
                  active={historyMinMag === option.value}
                  label={option.label}
                  onPress={() => setHistoryMinMag(option.value)}
                />
              ))}
            </ScrollView>

            <Text variant="caption" secondary>Siralama</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <FilterChip active={historySort === 'newest'} label="En Yeni" onPress={() => setHistorySort('newest')} />
              <FilterChip active={historySort === 'oldest'} label="En Eski" onPress={() => setHistorySort('oldest')} />
              <FilterChip active={historySort === 'largest'} label="En Buyuk" onPress={() => setHistorySort('largest')} />
              <FilterChip active={historySort === 'smallest'} label="En Kucuk" onPress={() => setHistorySort('smallest')} />
            </ScrollView>

            <Pressable onPress={() => void refreshHistory()} style={[styles.actionBtn, styles.primaryActionBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}22` }]}>
              <Text variant="caption" style={{ fontWeight: '700', color: colors.primary }}>
                Filtreleri Uygula
              </Text>
            </Pressable>
          </View>

          {historyStats ? (
            <View style={[styles.statsPanel, styles.surfacePanel]}>
              <Text variant="label">Donem Ozeti</Text>
              <View style={styles.statsTileRow}>
                <StatsTile label="Toplam" value={String(historyStats.total)} />
                <StatsTile label="En Buyuk" value={historyStats.maxMagnitude ? historyStats.maxMagnitude.toFixed(1) : '-'} />
                <StatsTile label="Ortalama" value={historyStats.avgMagnitude.toFixed(2)} />
              </View>
              <View style={styles.sparkWrap}>
                {historyStats.dailyCounts.slice(-14).map((item) => (
                  <View key={item.date} style={styles.sparkItem}>
                    <View style={[styles.sparkBar, { height: Math.max(6, item.value * 3), backgroundColor: '#2563EB88' }]} />
                    <Text variant="caption" secondary>{item.date.slice(5)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {historyLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {!historyLoading && historyEvents.length === 0 ? (
            <EmptyState title="Filtreye uygun deprem bulunamadi" subtitle="Araligi genisletip tekrar deneyebilirsin." />
          ) : null}
          {historyEvents.map((event) => (
            <EarthquakeCard key={`history-${event.id}`} event={event} />
          ))}
        </View>
      );
    }

    if (activeTab === 'notifications') {
      const pref = preference;
      return (
        <View style={styles.sectionGap}>
          <View style={[styles.sectionCard, styles.surfacePanel]}>
            <Text variant="label">Bildirim Ayarlari</Text>
            <Text variant="caption" secondary>Deprem bildirimlerini kapsam, buyukluk ve sessiz saatlere gore ozellestir.</Text>
          </View>

          <View style={[styles.settingsPanel, styles.surfacePanel]}>
            <Text variant="label">Hangi sehirlerdeki depremlerden haberdar olmak istersin?</Text>
            <View style={styles.optionGap}>
              {EARTHQUAKE_NOTIFICATION_SCOPES.map((scope) => (
                <Pressable
                  key={scope.id}
                  onPress={() =>
                    setPreference((prev) =>
                      prev
                        ? {
                            ...prev,
                            notification_scope: scope.id as EarthquakePreference['notification_scope'],
                            notifications_enabled: scope.id !== 'disabled',
                          }
                        : prev,
                    )
                  }
                  style={[
                    styles.optionCard,
                    {
                      borderColor: pref?.notification_scope === scope.id ? colors.primary : colors.border,
                      backgroundColor: pref?.notification_scope === scope.id ? `${colors.primary}22` : 'rgba(255,255,255,0.08)',
                    },
                  ]}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>{scope.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text variant="caption" secondary>Minimum buyukluk</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {EARTHQUAKE_MAGNITUDE_OPTIONS.map((option) => (
                <FilterChip
                  key={`pref-mag-${option.value}`}
                  active={Number(pref?.min_magnitude ?? 4) === option.value}
                  label={option.label}
                  onPress={() => setPreference((prev) => (prev ? { ...prev, min_magnitude: option.value } : prev))}
                />
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setPreference((prev) => (prev ? { ...prev, quiet_hours_enabled: !prev.quiet_hours_enabled } : prev))}
              style={[styles.optionCard, { borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.08)' }]}
            >
              <Text variant="caption" style={{ fontWeight: '700' }}>
                Sessiz saatler: {pref?.quiet_hours_enabled ? 'Acik' : 'Kapali'}
              </Text>
              <Text variant="caption" secondary>
                {pref?.quiet_hours_start ?? '23:00'} - {pref?.quiet_hours_end ?? '08:00'}
              </Text>
            </Pressable>

            {pref?.notification_scope === 'selected_cities' ? (
              <>
                <Text variant="caption" secondary>Sehirler (coklu secim)</Text>
                <View style={styles.cityGrid}>
                  {cities.map((city) => {
                    const checked = selectedCities.includes(city.city_code);
                    return (
                      <Pressable
                        key={city.city_code}
                        onPress={() =>
                          setSelectedCities((prev) =>
                            checked ? prev.filter((code) => code !== city.city_code) : [...prev, city.city_code],
                          )
                        }
                        style={[
                          styles.cityChip,
                          {
                            borderColor: checked ? colors.primary : colors.border,
                            backgroundColor: checked ? `${colors.primary}22` : 'rgba(255,255,255,0.08)',
                          },
                        ]}
                      >
                        <Text variant="caption">{checked ? '☑' : '☐'} {city.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Pressable
              onPress={async () => {
                if (!preference) return;
                setSavingPref(true);
                await upsertPreferences({
                  notificationsEnabled: preference.notifications_enabled,
                  notificationScope: preference.notification_scope,
                  minMagnitude: preference.min_magnitude,
                  quietHoursEnabled: preference.quiet_hours_enabled,
                  quietHoursStart: preference.quiet_hours_start,
                  quietHoursEnd: preference.quiet_hours_end,
                  quietHoursTimezone: preference.quiet_hours_timezone,
                });
                if (preference.notification_scope === 'selected_cities') {
                  await replacePreferenceCities(selectedCities);
                }
                await refreshSettings();
                setSavingPref(false);
              }}
              style={[styles.actionBtn, styles.primaryActionBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}22` }]}
            >
              <Text variant="caption" style={{ fontWeight: '700', color: colors.primary }}>
                {savingPref ? 'Kaydediliyor...' : 'Tercihleri Kaydet'}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.settingsPanel, styles.surfacePanel]}>
            <View style={styles.rowBetween}>
              <Text variant="label">Deprem Bildirimlerim</Text>
              <Pressable onPress={() => void markAllDeliveriesRead().then(() => refreshSettings())}>
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>Tumunu okundu yap</Text>
              </Pressable>
            </View>
            {notifItems.length === 0 ? (
              <EmptyState title="Bildirim gecmisi bulunamadi" subtitle="Yeni deprem bildirimleri burada gorunur." />
            ) : (
              notifItems.map((item) => (
                <Pressable
                  key={String(item.id)}
                  onPress={async () => {
                    await markDeliveryRead(String(item.id));
                    const eventId = String(item.event_id ?? '');
                    if (eventId) router.push(`/earthquake/${encodeURIComponent(eventId)}` as never);
                  }}
                  style={[styles.notificationCard, { borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.08)' }]}
                >
                  <Text variant="caption" style={{ fontWeight: '700' }}>
                    {item.read_at ? '✓' : '•'} {String((item.earthquake_events as { place?: string } | undefined)?.place ?? 'Deprem bildirimi')}
                  </Text>
                  <Text variant="caption" secondary>{formatDateTime(String(item.notification_created_at ?? ''))}</Text>
                </Pressable>
              ))
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.sectionGap}>
        {loading ? (
          <View style={styles.sectionGap}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}
        {!loading ? (
          <View style={[styles.sectionCard, styles.surfacePanel]}>
            <Text variant="label">Son Deprem Akisi</Text>
            <Text variant="caption" secondary>
              Kaynaklar: AFAD birincil, USGS yedek. Kartlar resmi veriye gore surekli guncellenir.
            </Text>
          </View>
        ) : null}
        {!loading && events.length === 0 ? (
          <EmptyState title="Su an listelenecek deprem yok" subtitle="Veri akisi geldiginde kartlar burada guncellenecek." />
        ) : null}
        {events.map((event) => <EarthquakeCard key={event.id} event={event} />)}
      </View>
    );
  }, [
    activeTab,
    cities,
    colors.border,
    colors.primary,
    colors.text,
    colors.textMuted,
    events,
    historyEvents,
    historyLoading,
    historyMinMag,
    historySort,
    historyStats,
    historyTimeFilter,
    historyYear,
    loading,
    notifItems,
    preference,
    refreshHistory,
    refreshSettings,
    savingPref,
    selectedCities,
  ]);
  const latestEvent = events[0] ?? null;
  const latestCity = latestEvent?.city_code ? cityNameByCode.get(latestEvent.city_code) ?? null : null;
  const latestDistanceKm = latestEvent ? extractDistanceKmFromPlace(latestEvent.place) : null;

  return (
    <GradientBackground>
      <FlatList
        data={[{ id: 'content' }]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        renderItem={() => <View style={styles.sectionGap}>{tabContent}</View>}
        ListHeaderComponent={
          <View style={styles.sectionGap}>
            <View style={[styles.heroCard, styles.surfacePanelStrong]}>
              <Text variant="h2">{EARTHQUAKE_TITLE}</Text>
              <Text variant="caption" secondary>{EARTHQUAKE_SUBTITLE}</Text>
              <View style={styles.liveTicker}>
                <View style={styles.liveDot} />
                <Text variant="caption" style={{ fontWeight: '700' }}>
                  CANLI AKIS · {events[0] ? `${Number(events[0].magnitude).toFixed(1)} ${events[0].magnitude_type} · ${events[0].place}` : 'Veri bekleniyor'}
                </Text>
              </View>
              <View style={styles.quickInfoPanel}>
                <Text variant="label">
                  {latestCity ?? latestEvent?.place ?? 'Deprem verisi bekleniyor'}
                </Text>
                <Text variant="caption" secondary>
                  {latestEvent
                    ? `${formatDateTime(latestEvent.event_time)} saatinde M ${Number(latestEvent.magnitude).toFixed(1)} deprem oldu.`
                    : 'Canli veri geldikce bu alan anlik ozet gosterir.'}
                </Text>
                <View style={styles.quickFactsRow}>
                  <FactBadge label="Derinlik" value={latestEvent?.depth_km != null ? `${Number(latestEvent.depth_km).toFixed(1)} km` : '-'} />
                  <FactBadge label="Uzaklik" value={latestDistanceKm != null ? `${latestDistanceKm.toFixed(1)} km` : '-'} />
                  <FactBadge label="Kaynak" value={latestEvent?.primary_source ?? '-'} />
                </View>
              </View>
              <View style={styles.heroHighlights}>
                <HeroPill label="24s Toplam" value={String(summary.count24h)} />
                <HeroPill
                  label="Maksimum"
                  value={summary.maxMagnitude24h != null ? summary.maxMagnitude24h.toFixed(1) : '-'}
                />
              </View>
            </View>

            <View style={[styles.tabShell, styles.surfacePanel]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {TABS.map((tab) => (
                  <TabPill key={tab.id} active={activeTab === tab.id} label={tab.label} onPress={() => setActiveTab(tab.id)} />
                ))}
              </ScrollView>
            </View>

            <View style={styles.summaryGrid}>
              <SummaryCard label="Son deprem" value={events[0] ? `${Number(events[0].magnitude).toFixed(1)} ${events[0].magnitude_type}` : '-'} />
              <SummaryCard label="24 saat toplam" value={String(summary.count24h)} />
              <SummaryCard
                label="24 saat en buyuk"
                value={summary.maxMagnitude24h != null ? summary.maxMagnitude24h.toFixed(1) : '-'}
              />
              <SummaryCard label="Son guncelleme" value={summary.lastUpdatedAt ? formatDateTime(summary.lastUpdatedAt) : 'Yok'} />
            </View>

            <View style={[styles.providerPanel, styles.surfacePanel]}>
              <Text variant="label">Kaynak Sagligi</Text>
              {providerStatus.length > 0 ? (
                <View style={styles.providerRow}>
                  {providerStatus.map((provider) => (
                    <View key={provider.provider_name} style={[styles.providerBadge, { borderColor: provider.is_healthy ? '#16A34A55' : '#DC262655' }]}>
                      <View
                        style={[
                          styles.providerDot,
                          { backgroundColor: provider.is_healthy ? '#16A34A' : '#DC2626' },
                        ]}
                      />
                      <Text variant="caption" secondary>
                        {provider.provider_name} · {provider.is_healthy ? 'Aktif' : 'Kesinti'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text variant="caption" secondary>Kaynak sagligi verisi bekleniyor.</Text>
              )}
            </View>

            <View style={[styles.disclaimerCard, styles.surfacePanel]}>
              <Text variant="caption" secondary>{EARTHQUAKE_DISCLAIMER}</Text>
              <Text variant="caption" secondary>Acil durumlarda 112 Acil Cagri ve AFAD resmi kaynaklarini takip edin.</Text>
            </View>
          </View>
        }
      />
    </GradientBackground>
  );
}

function HeroPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroPill}>
      <Text variant="caption" secondary>{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabPill,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? `${colors.primary}26` : 'rgba(255,255,255,0.08)',
        },
      ]}
    >
      <Text variant="caption" style={{ fontWeight: '700', color: active ? colors.primary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatsTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statsTile}>
      <Text variant="caption" secondary>{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

function FactBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factBadge}>
      <Text variant="caption" secondary>{label}</Text>
      <Text variant="caption" style={{ fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function LegendPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.legendPill, { borderColor: `${color}66`, backgroundColor: `${color}1F` }]}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.emptyStateCard, styles.surfacePanel, { borderColor: colors.border }]}>
      <Text variant="label">{title}</Text>
      <Text variant="caption" secondary>{subtitle}</Text>
    </View>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.summaryCard, styles.surfacePanel]}>
      <Text variant="caption" secondary>{label}</Text>
      <Text variant="label" numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SkeletonCard() {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.eventCard,
        { borderColor: `${colors.border}`, backgroundColor: 'transparent', opacity: 0.65 },
      ]}
    >
      <View style={[styles.skeletonLine, { width: '35%', backgroundColor: colors.border }]} />
      <View style={[styles.skeletonLine, { width: '82%', backgroundColor: colors.border }]} />
      <View style={[styles.skeletonLine, { width: '60%', backgroundColor: colors.border }]} />
    </View>
  );
}

function EarthquakeCard({ event }: { event: EarthquakeEvent }) {
  const { colors } = useTheme();
  const magnitude = Number(event.magnitude).toFixed(1);
  const depth = event.depth_km != null ? `${Number(event.depth_km).toFixed(1)} km` : '-';
  return (
    <View
      style={[styles.eventCard, { borderColor: `${magnitudeColor(Number(event.magnitude))}66`, backgroundColor: 'transparent' }]}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.magPill, { backgroundColor: `${magnitudeColor(Number(event.magnitude))}20`, borderColor: `${magnitudeColor(Number(event.magnitude))}66` }]}>
          <Text variant="label" style={{ color: magnitudeColor(Number(event.magnitude)) }}>
            {magnitude} {event.magnitude_type}
          </Text>
        </View>
        <View style={[styles.sourcePill, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text variant="caption" secondary>{event.primary_source}</Text>
        </View>
      </View>

      <Text variant="label" numberOfLines={2}>{event.place}</Text>

      <View style={styles.metaRowWrap}>
        <View style={[styles.metaPill, { borderColor: colors.border }]}>
          <Text variant="caption" secondary>{formatDateTime(event.event_time)}</Text>
        </View>
        <View style={[styles.metaPill, { borderColor: colors.border }]}>
          <Text variant="caption" secondary>Derinlik: {depth}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionPill, { borderColor: colors.primary }]}
          onPress={() => router.push(`/earthquake/${encodeURIComponent(String(event.id))}` as never)}
        >
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>Detaylari Ac</Text>
        </Pressable>
        <Pressable
          style={[styles.actionPill, { borderColor: colors.border }]}
          onPress={() => router.push(`/earthquake/${encodeURIComponent(String(event.id))}` as never)}
        >
          <Text variant="caption" style={{ color: colors.text, fontWeight: '700' }}>Haritada Gor</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? `${colors.primary}22` : 'rgba(255,255,255,0.08)',
        },
      ]}
    >
      <Text variant="caption" style={{ fontWeight: '700', color: active ? colors.primary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

function resolveHistoryRange(filter: (typeof EARTHQUAKE_TIME_FILTERS)[number]['id'], year: string): { startAt: string | null; endAt: string | null } {
  const now = new Date();
  if (filter === '24h') return { startAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), endAt: now.toISOString() };
  if (filter === '7d') return { startAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), endAt: now.toISOString() };
  if (filter === '30d') return { startAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), endAt: now.toISOString() };
  if (filter === '90d') return { startAt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(), endAt: now.toISOString() };
  if (filter === '1y') return { startAt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(), endAt: now.toISOString() };
  if (filter === 'year') {
    const safeYear = Number(year);
    if (!Number.isFinite(safeYear) || safeYear < 1900 || safeYear > 2200) return { startAt: null, endAt: null };
    return {
      startAt: new Date(Date.UTC(safeYear, 0, 1, 0, 0, 0)).toISOString(),
      endAt: new Date(Date.UTC(safeYear, 11, 31, 23, 59, 59)).toISOString(),
    };
  }
  return { startAt: null, endAt: null };
}

function extractDistanceKmFromPlace(place: string): number | null {
  if (!place) return null;
  const match = place.match(/(\d+(?:[.,]\d+)?)\s*km/i);
  if (!match) return null;
  const value = Number(String(match[1]).replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingTop: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionGap: {
    gap: spacing.md,
  },
  optionGap: {
    gap: spacing.sm,
  },
  filterRow: {
    gap: spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  heroCard: {
    gap: spacing.sm,
  },
  surfacePanelStrong: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    padding: spacing.md,
  },
  surfacePanel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: spacing.md,
  },
  liveTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  quickInfoPanel: {
    gap: 6,
  },
  quickFactsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  factBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EF4444',
  },
  heroHighlights: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroPill: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  tabShell: {
    padding: spacing.sm,
  },
  tabPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    gap: 4,
    width: '48%',
    minHeight: 72,
    justifyContent: 'space-between',
  },
  providerPanel: {
    gap: spacing.sm,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  disclaimerCard: {
    gap: 4,
  },
  sectionCard: {
    gap: 4,
  },
  filterPanel: {
    gap: spacing.sm,
  },
  settingsPanel: {
    gap: spacing.sm,
  },
  statsPanel: {
    gap: spacing.sm,
  },
  statsTileRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statsTile: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  legendCard: {
    gap: spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  emptyStateCard: {
    borderWidth: 1,
    borderRadius: 14,
    gap: 4,
  },
  eventCard: {
    borderBottomWidth: 1,
    borderRadius: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    gap: spacing.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  magPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  sourcePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  metaRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  mapCard: {
    height: 340,
    overflow: 'hidden',
    padding: 0,
  },
  map: {
    flex: 1,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryActionBtn: {
    minHeight: 44,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  notificationCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  cityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cityChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  sparkWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  sparkItem: {
    alignItems: 'center',
    gap: 2,
  },
  sparkBar: {
    width: 10,
    borderRadius: 999,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 8,
  },
});
