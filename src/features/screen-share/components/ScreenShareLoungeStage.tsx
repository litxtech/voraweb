import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { ScreenShareSeat } from '@/features/screen-share/components/ScreenShareSeat';
import {
  SCREEN_SHARE_GRID_SEATS,
  useScreenShareLoungeMembers,
  type LoungeSeatMember,
} from '@/features/screen-share/hooks/useScreenShareLoungeMembers';
import type { ScreenShareParticipant } from '@/features/screen-share/types';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';
import { OptimizedImage } from '@/components/media/OptimizedImage';

type Props = {
  sessionId: string;
  onAvatarPress: (participant: ScreenShareParticipant) => void;
  /** Video izlerken: yatay kaydırılabilir izleyici/koltuk şeridi */
  compact?: boolean;
  iAmSeated?: boolean;
  onLeaveSeat?: () => void;
  onTakeSeat?: () => void;
};

const GRID_COLS = 4;

/** Koltuklu ses sahnesi: lider üstte, altında 4’erli 12 koltuk. */
export function ScreenShareLoungeStage({
  sessionId,
  onAvatarPress,
  compact,
  iAmSeated = true,
  onLeaveSeat,
  onTakeSeat,
}: Props) {
  const { seats, leader, gridSeated, listeners, emptyGridSlots, leaderEmpty } =
    useScreenShareLoungeMembers(sessionId);

  const onPress = (m: LoungeSeatMember) => {
    onAvatarPress(m);
  };

  // Video altında: koltuk + dinleyiciler tek yatay şeritte kaydırılır
  if (compact) {
    const rail = [...seats, ...listeners];
    return (
      <View style={styles.railWrap}>
        <View style={styles.railHeader}>
          <Text style={styles.railLabel}>ODADAKİLER</Text>
          <Text style={styles.railCount}>{rail.length}</Text>
          <Ionicons name="swap-horizontal" size={14} color="rgba(255,255,255,0.35)" />
          <Text style={styles.railHint}>kaydır</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
          decelerationRate="fast"
          snapToInterval={80}
          snapToAlignment="start"
        >
          {rail.map((m) => (
            <ScreenShareSeat key={m.userId} member={m} rail onPress={() => onPress(m)} />
          ))}
          {rail.length === 0 ? (
            <Text style={styles.railEmpty}>Henüz kimse yok</Text>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  const gridSlots: Array<LoungeSeatMember | null> = [
    ...gridSeated,
    ...Array.from({ length: emptyGridSlots }, () => null),
  ].slice(0, SCREEN_SHARE_GRID_SEATS);

  const rows: Array<Array<LoungeSeatMember | null>> = [];
  for (let i = 0; i < gridSlots.length; i += GRID_COLS) {
    rows.push(gridSlots.slice(i, i + GRID_COLS));
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.seatBoard}
        bounces={false}
      >
        <View style={styles.leaderRow}>
          <Text style={styles.leaderLabel}>LİDER</Text>
          {leader ? (
            <ScreenShareSeat member={leader} leader onPress={() => onPress(leader)} />
          ) : (
            <ScreenShareSeat empty leader />
          )}
          {leaderEmpty ? (
            <Text style={styles.leaderHint}>Lider koltuğu boş</Text>
          ) : null}
        </View>

        <View style={styles.grid}>
          {rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {row.map((m, colIndex) =>
                m ? (
                  <View key={m.userId} style={styles.gridCell}>
                    <ScreenShareSeat member={m} grid onPress={() => onPress(m)} />
                  </View>
                ) : (
                  <View key={`empty-${rowIndex}-${colIndex}`} style={styles.gridCell}>
                    <ScreenShareSeat empty grid />
                  </View>
                ),
              )}
            </View>
          ))}
        </View>

        {seats.length === 0 ? (
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>Bu odada ilk sohbeti sen başlat!</Text>
            <Text style={styles.emptyHint}>Koltuğa otur, arkadaşlarını davet et.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.seatActions}>
        {iAmSeated && onLeaveSeat ? (
          <Pressable onPress={onLeaveSeat} style={styles.seatBtn}>
            <Text style={styles.seatBtnText}>Koltuktan in</Text>
          </Pressable>
        ) : null}
        {!iAmSeated && onTakeSeat ? (
          <Pressable onPress={onTakeSeat} style={[styles.seatBtn, styles.seatBtnPrimary]}>
            <Text style={[styles.seatBtnText, styles.seatBtnTextPrimary]}>Koltuk al</Text>
          </Pressable>
        ) : null}
      </View>

      {listeners.length > 0 ? (
        <View style={styles.listeners}>
          <Text style={styles.listenersLabel}>Dinleyiciler ({listeners.length})</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listenerRow}
          >
            {listeners.map((m) => (
              <Pressable key={m.userId} onPress={() => onPress(m)} style={styles.listenerItem}>
                {m.avatarUrl ? (
                  <OptimizedImage
                    uri={m.avatarUrl}
                    style={styles.listenerAv}
                    tier="avatar"
                    recyclingKey={`ss-listen-${m.userId}`}
                  />
                ) : (
                  <View style={[styles.listenerAv, styles.listenerFallback]}>
                    <Text style={styles.listenerLetter}>
                      {(m.username || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.listenerName} numberOfLines={1}>
                  @{m.username}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  seatBoard: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  leaderRow: {
    alignItems: 'center',
    gap: 4,
  },
  leaderLabel: {
    color: '#E8C872',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  leaderHint: {
    color: 'rgba(232,200,114,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  gridCell: {
    width: '25%',
    alignItems: 'center',
  },
  railWrap: {
    paddingTop: 4,
    paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(8,12,18,0.35)',
  },
  railHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    marginBottom: 4,
  },
  railLabel: {
    color: 'rgba(232,238,245,0.55)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  railCount: {
    color: SCREEN_SHARE_ACCENT,
    fontSize: 11,
    fontWeight: '800',
  },
  railHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '600',
  },
  railContent: {
    paddingHorizontal: spacing.md,
    gap: 8,
    alignItems: 'center',
    paddingBottom: 6,
    minHeight: 88,
  },
  railEmpty: {
    color: '#7A8A9C',
    fontSize: 12,
    paddingVertical: 20,
  },
  emptyCopy: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  emptyTitle: {
    color: '#F4F7FB',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyHint: {
    color: 'rgba(180,196,214,0.85)',
    fontSize: 13,
    textAlign: 'center',
  },
  seatActions: {
    alignItems: 'center',
    marginTop: 4,
  },
  seatBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  seatBtnPrimary: {
    borderColor: `${SCREEN_SHARE_ACCENT}66`,
    backgroundColor: `${SCREEN_SHARE_ACCENT}22`,
  },
  seatBtnText: { color: '#E8EEF5', fontWeight: '700', fontSize: 13 },
  seatBtnTextPrimary: { color: SCREEN_SHARE_ACCENT },
  listeners: {
    marginTop: spacing.sm,
    gap: 8,
  },
  listenersLabel: {
    color: 'rgba(232,238,245,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
  },
  listenerRow: {
    gap: 12,
    paddingHorizontal: spacing.md,
  },
  listenerItem: { alignItems: 'center', width: 56, gap: 4 },
  listenerAv: { width: 36, height: 36, borderRadius: 18 },
  listenerFallback: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenerLetter: { color: '#fff', fontSize: 12, fontWeight: '800' },
  listenerName: { color: '#9AA8BC', fontSize: 10, fontWeight: '600', maxWidth: 56 },
});
