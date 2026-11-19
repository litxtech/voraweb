import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { ScreenShareSeat } from '@/features/screen-share/components/ScreenShareSeat';
import {
  SCREEN_SHARE_GRID_SEATS,
  useScreenShareLoungeMembers,
  type LoungeSeatMember,
} from '@/features/screen-share/hooks/useScreenShareLoungeMembers';
import type { SeatSlot } from '@/features/screen-share/services/seatModeration';
import type { ScreenShareParticipant } from '@/features/screen-share/types';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';

type Props = {
  sessionId: string;
  hostUserId: string;
  onAvatarPress: (participant: ScreenShareParticipant) => void;
  /** Video izlerken: yatay kaydırılabilir izleyici/koltuk şeridi */
  compact?: boolean;
  onTakeSeatSlot?: (slot: SeatSlot) => void;
  leaderLocked?: boolean;
  /** Boş lider koltuğuna dokunabilir (admin veya atanmış lider) */
  canClaimLeaderSeat?: boolean;
};

const GRID_COLS = 4;

/** Koltuklu ses sahnesi: lider üstte, altında 4’erli 12 koltuk. */
export function ScreenShareLoungeStage({
  sessionId,
  hostUserId,
  onAvatarPress,
  compact,
  onTakeSeatSlot,
  leaderLocked = true,
  canClaimLeaderSeat = false,
}: Props) {
  const { seats, leader, gridSeated, listeners, leaderEmpty } =
    useScreenShareLoungeMembers(sessionId, hostUserId);

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

  const rows: Array<Array<{ member: LoungeSeatMember | null; slotIndex: number }>> = [];
  for (let i = 0; i < SCREEN_SHARE_GRID_SEATS; i += GRID_COLS) {
    const row = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const slotIndex = i + c;
      if (slotIndex >= SCREEN_SHARE_GRID_SEATS) break;
      row.push({ member: gridSeated[slotIndex] ?? null, slotIndex });
    }
    rows.push(row);
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.boardScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.seatBoard}
        bounces={false}
        nestedScrollEnabled
      >
        <View style={styles.leaderRow}>
          <Text style={styles.leaderLabel}>
            LİDER{leaderLocked ? ' · KİLİTLİ' : ''}
          </Text>
          {leader ? (
            <ScreenShareSeat member={leader} leader onPress={() => onPress(leader)} />
          ) : (
            <ScreenShareSeat
              empty
              leader
              locked={leaderLocked && !canClaimLeaderSeat}
              onPress={
                onTakeSeatSlot && (canClaimLeaderSeat || !leaderLocked)
                  ? () => onTakeSeatSlot('L')
                  : undefined
              }
            />
          )}
          {leaderEmpty && (canClaimLeaderSeat || !leaderLocked) ? (
            <Text style={styles.leaderHint}>Boş — dokunup otur</Text>
          ) : null}
        </View>

        <View style={styles.grid}>
          {rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {row.map(({ member: m, slotIndex }) =>
                m ? (
                  <View key={m.userId} style={styles.gridCell}>
                    <ScreenShareSeat member={m} grid onPress={() => onPress(m)} />
                  </View>
                ) : (
                  <View key={`empty-${slotIndex}`} style={styles.gridCell}>
                    <ScreenShareSeat
                      empty
                      grid
                      onPress={
                        onTakeSeatSlot
                          ? () => onTakeSeatSlot(String(slotIndex) as SeatSlot)
                          : undefined
                      }
                    />
                  </View>
                ),
              )}
            </View>
          ))}
        </View>

        {seats.length === 0 ? (
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>Boş bir koltuğa dokun</Text>
            <Text style={styles.emptyHint}>İstediğin koltuğa geç, sohbete katıl.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  boardScroll: {
    flex: 1,
    minHeight: 0,
  },
  seatBoard: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'stretch',
    flexGrow: 1,
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
  emptyCopy: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
  },
  emptyTitle: {
    color: '#F4F7FB',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  railWrap: {
    gap: 6,
    paddingVertical: 8,
  },
  railHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  railLabel: {
    color: 'rgba(255,255,255,0.45)',
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
    color: 'rgba(255,255,255,0.28)',
    fontSize: 10,
    marginLeft: 'auto',
  },
  railContent: {
    paddingHorizontal: spacing.sm,
    gap: 10,
    alignItems: 'flex-start',
  },
  railEmpty: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    paddingVertical: 12,
  },
});
