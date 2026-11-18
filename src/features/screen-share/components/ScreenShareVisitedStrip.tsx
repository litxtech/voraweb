import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import type { ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';

type Props = {
  rooms: ScreenShareSession[];
  onOpen: (room: ScreenShareSession) => void;
};

const SIZE = 52;

export function ScreenShareVisitedStrip({ rooms, onOpen }: Props) {
  if (rooms.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>ZİYARET EDİLENLER</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {rooms.map((room) => {
          const uri = room.coverImageUrl || room.hostAvatarUrl;
          const initial = (room.hostUsername || room.title || '?').slice(0, 1).toUpperCase();
          return (
            <Pressable
              key={room.id}
              onPress={() => onOpen(room)}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.ring}>
                {uri ? (
                  <OptimizedImage
                    uri={uri}
                    style={styles.avatar}
                    tier="avatar"
                    layoutWidth={SIZE}
                    recyclingKey={`visit-${room.id}`}
                  />
                ) : (
                  <View style={styles.fallback}>
                    <Text style={styles.initial}>{initial}</Text>
                  </View>
                )}
                <View style={styles.liveDot} />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {room.hostUsername ? `@${room.hostUsername}` : room.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: {
    color: 'rgba(107,122,143,0.95)',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
  },
  row: { gap: 12, paddingRight: spacing.md },
  item: { width: 68, alignItems: 'center', gap: 6 },
  ring: {
    width: SIZE + 4,
    height: SIZE + 4,
    borderRadius: (SIZE + 4) / 2,
    borderWidth: 2,
    borderColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  fallback: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,194,168,0.2)',
  },
  initial: { color: '#E8FFF9', fontWeight: '900', fontSize: 18 },
  liveDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#28C840',
    borderWidth: 1.5,
    borderColor: '#05070A',
  },
  name: {
    color: 'rgba(200,214,230,0.9)',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
});
