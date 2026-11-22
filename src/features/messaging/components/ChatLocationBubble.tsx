import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { PlatformMap } from '@/features/map/components/PlatformMap';
import type { MapMarker } from '@/features/map/types';
import { useTheme } from '@/providers/ThemeProvider';
import { openChatLocationMap } from '../services/locationNavigation';
import { formatChatLocationAddress, parseLocationContent } from '../utils';

type Props = {
  content: string;
  sharedAt?: string;
  senderName?: string;
  avatarUrl?: string | null;
  textColor: string;
  metaColor: string;
  accentColor: string;
};

function formatAccuracy(meters?: number): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return null;
  if (meters < 1000) return `±${Math.round(meters)} m`;
  return `±${(meters / 1000).toFixed(1)} km`;
}

function buildDetailLines(location: NonNullable<ReturnType<typeof parseLocationContent>>): string[] {
  const lines: string[] = [];
  const street = location.street?.trim();
  const locality = [location.district, location.city].filter(Boolean).join(' · ');
  const regionLine = [location.region, location.country].filter(Boolean).join(' · ');

  if (street) lines.push(street);
  if (locality) lines.push(locality);
  if (regionLine && regionLine !== locality) lines.push(regionLine);

  if (lines.length === 0) {
    const fallback = formatChatLocationAddress(location);
    if (fallback && fallback !== location.label) lines.push(fallback);
  }
  return lines;
}

/** Şeffaf konum önizlemesi — kart yok; harita + adres bilgisi */
export function ChatLocationBubble({
  content,
  sharedAt,
  senderName,
  avatarUrl,
  textColor,
  metaColor,
  accentColor,
}: Props) {
  const { isDark } = useTheme();
  const location = parseLocationContent(content);

  const marker = useMemo<MapMarker | null>(() => {
    if (!location) return null;
    return {
      id: `chat-loc-${location.latitude}-${location.longitude}`,
      sourceId: 'chat-location',
      layer: 'posts',
      title: location.label ?? senderName ?? 'Konum',
      subtitle: formatChatLocationAddress(location),
      latitude: location.latitude,
      longitude: location.longitude,
      avatarUrl: avatarUrl ?? undefined,
      mediaUrls: avatarUrl ? [avatarUrl] : undefined,
      createdAt: sharedAt,
      meta: { mapColor: accentColor, forcePulse: true },
    };
  }, [location, senderName, avatarUrl, sharedAt, accentColor]);

  const focus = useMemo(
    () =>
      location
        ? { latitude: location.latitude, longitude: location.longitude, zoom: 15 }
        : null,
    [location],
  );

  if (!location || !marker || !focus) {
    return <Text style={{ color: textColor }}>Konum</Text>;
  }

  const title = location.label?.trim() || formatChatLocationAddress(location);
  const details = buildDetailLines(location);
  const accuracy = formatAccuracy(location.accuracy);
  const coords = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;

  return (
    <Pressable
      onPress={() =>
        openChatLocationMap(location, {
          sharedAt,
          senderName,
        })
      }
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`Konum: ${title}. Haritada aç`}
    >
      <View style={styles.mapShell}>
        <PlatformMap
          markers={[marker]}
          focusCoordinate={focus}
          showsUserLocation={false}
          mapStyle={isDark ? 'dark' : 'light'}
          scrollEnabled={false}
          zoomEnabled={false}
          clusterMarkers={false}
          cameraAutoFit
          active
        />
        <View style={styles.mapFade} pointerEvents="none" />
        <View style={styles.mapTag} pointerEvents="none">
          <Ionicons name="location" size={12} color="#fff" />
          <Text style={styles.mapTagText}>Konum</Text>
        </View>
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
          {title}
        </Text>
        {details.map((line) =>
          line === title ? null : (
            <Text key={line} style={[styles.detail, { color: metaColor }]} numberOfLines={2}>
              {line}
            </Text>
          ),
        )}
        <View style={styles.metaLine}>
          <Text style={[styles.coords, { color: metaColor }]} numberOfLines={1}>
            {coords}
            {accuracy ? ` · ${accuracy}` : ''}
          </Text>
        </View>
        <View style={styles.ctaRow}>
          <Text style={[styles.cta, { color: accentColor }]}>Haritada aç</Text>
          <Ionicons name="arrow-forward" size={13} color={accentColor} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 248,
    gap: 8,
    backgroundColor: 'transparent',
  },
  mapShell: {
    height: 148,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  mapFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,12,18,0.06)',
  },
  mapTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  mapTagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  info: {
    gap: 2,
    paddingHorizontal: 2,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  detail: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  metaLine: {
    marginTop: 2,
  },
  coords: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  ctaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cta: {
    fontSize: 12,
    fontWeight: '800',
  },
});
