import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import type { LoungeSeatMember } from '@/features/screen-share/hooks/useScreenShareLoungeMembers';

type Props = {
  member?: LoungeSeatMember | null;
  empty?: boolean;
  onPress?: () => void;
  /** Video altı yatay şerit */
  rail?: boolean;
};

const AVATAR = 56;
const AVATAR_RAIL = 42;

/** Gerçekçi premium koltuk — arkalık + kolçak + minder + avatar. */
export function ScreenShareSeat({ member, empty, onPress, rail }: Props) {
  const size = rail ? AVATAR_RAIL : AVATAR;

  if (empty || !member) {
    return (
      <View style={[styles.seat, rail && styles.seatRail]}>
        <View style={[styles.chair, rail && styles.chairRail, styles.chairEmpty]}>
          <View style={[styles.backrest, rail && styles.backrestRail, styles.backrestEmpty]} />
          <View style={[styles.arms, rail && styles.armsRail]}>
            <View style={[styles.arm, rail && styles.armRail, styles.armEmpty]} />
            <View style={[styles.cushion, rail && styles.cushionRail, styles.cushionEmpty]}>
              <Ionicons name="add" size={rail ? 14 : 18} color="rgba(255,255,255,0.28)" />
            </View>
            <View style={[styles.arm, rail && styles.armRail, styles.armEmpty]} />
          </View>
        </View>
        {!rail ? <Text style={styles.emptyLabel}>Boş</Text> : null}
      </View>
    );
  }

  const initial = (member.username || '?').slice(0, 1).toUpperCase();
  const speaking = member.isSpeaking;
  const micOff = !member.micEnabled;
  const host = member.isHost;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`@${member.username}`}
      hitSlop={6}
      style={({ pressed }) => [
        styles.seat,
        rail && styles.seatRail,
        { opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View
        style={[
          styles.chair,
          rail && styles.chairRail,
          host && styles.chairHost,
          speaking && styles.chairSpeaking,
        ]}
      >
        {/* Arkalık */}
        <LinearGradient
          colors={
            host
              ? ['#3A3428', '#2A2418', '#1A1610']
              : speaking
                ? ['#1A3A34', '#122820', '#0C1814']
                : ['#2A3140', '#1A2030', '#121820']
          }
          style={[styles.backrest, rail && styles.backrestRail]}
        />

        <View style={[styles.arms, rail && styles.armsRail]}>
          <View style={[styles.arm, rail && styles.armRail, host && styles.armHost]} />
          <View style={[styles.cushion, rail && styles.cushionRail, host && styles.cushionHost]}>
            {speaking ? (
              <View
                style={[
                  styles.speakRing,
                  {
                    width: size + 14,
                    height: size + 14,
                    borderRadius: (size + 14) / 2,
                  },
                ]}
              />
            ) : null}
            <View
              style={[
                styles.avatarRing,
                {
                  width: size + 6,
                  height: size + 6,
                  borderRadius: (size + 6) / 2,
                  borderColor: speaking ? SCREEN_SHARE_ACCENT : host ? '#E8C872' : 'rgba(255,255,255,0.25)',
                },
              ]}
            >
              {member.avatarUrl ? (
                <OptimizedImage
                  uri={member.avatarUrl}
                  style={{ width: size, height: size, borderRadius: size / 2 }}
                  tier="avatar"
                  recyclingKey={`ss-seat-${member.userId}`}
                />
              ) : (
                <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
                  <Text style={[styles.initial, rail && { fontSize: 14 }]}>{initial}</Text>
                </View>
              )}
            </View>
            {micOff ? (
              <View style={[styles.micBadge, rail && styles.micBadgeRail]}>
                <Ionicons name="mic-off" size={rail ? 8 : 10} color="#fff" />
              </View>
            ) : speaking ? (
              <View style={[styles.liveBadge, rail && styles.micBadgeRail]}>
                <View style={styles.liveDot} />
              </View>
            ) : null}
            {host ? (
              <View style={[styles.crown, rail && styles.crownRail]}>
                <Ionicons name="diamond" size={rail ? 8 : 10} color="#1A1408" />
              </View>
            ) : null}
          </View>
          <View style={[styles.arm, rail && styles.armRail, host && styles.armHost]} />
        </View>

        {/* Ayak gölgesi */}
        {!rail ? <View style={[styles.legs, host && styles.legsHost]} /> : null}
      </View>
      <Text style={[styles.name, rail && styles.nameRail]} numberOfLines={1}>
        {member.username}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seat: {
    width: 118,
    alignItems: 'center',
    gap: 8,
  },
  seatRail: {
    width: 76,
    gap: 5,
  },
  chair: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  chairRail: {
    paddingBottom: 4,
  },
  chairEmpty: { opacity: 0.7 },
  chairHost: {},
  chairSpeaking: {},
  backrest: {
    width: 78,
    height: 36,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginBottom: -10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backrestRail: {
    width: 52,
    height: 22,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginBottom: -6,
  },
  backrestEmpty: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
  },
  arms: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 2,
  },
  armsRail: {},
  arm: {
    width: 12,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#252B38',
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  armRail: {
    width: 8,
    height: 24,
    borderRadius: 6,
  },
  armHost: {
    backgroundColor: '#3A3220',
    borderColor: 'rgba(232,200,114,0.35)',
  },
  armEmpty: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
  },
  cushion: {
    width: 78,
    height: 52,
    borderRadius: 20,
    backgroundColor: '#1E2533',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'visible',
  },
  cushionRail: {
    width: 54,
    height: 38,
    borderRadius: 14,
  },
  cushionHost: {
    backgroundColor: '#2E2818',
    borderColor: 'rgba(232,200,114,0.4)',
  },
  cushionEmpty: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderStyle: 'dashed',
  },
  speakRing: {
    position: 'absolute',
    backgroundColor: `${SCREEN_SHARE_ACCENT}28`,
  },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: '#0A0E14',
    zIndex: 2,
  },
  legs: {
    marginTop: 4,
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  legsHost: {
    backgroundColor: 'rgba(232,200,114,0.25)',
  },
  fallback: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}40`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: '#fff', fontWeight: '800', fontSize: 18 },
  micBadge: {
    position: 'absolute',
    right: 4,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C62828',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1E2533',
    zIndex: 3,
  },
  micBadgeRail: {
    width: 16,
    height: 16,
    borderRadius: 8,
    right: 2,
    bottom: 0,
  },
  liveBadge: {
    position: 'absolute',
    right: 4,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1E2533',
    zIndex: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#04110E',
  },
  crown: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E8C872',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  crownRail: {
    width: 14,
    height: 14,
    borderRadius: 7,
    top: -4,
  },
  name: {
    color: '#E8EEF5',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 110,
    textAlign: 'center',
  },
  nameRail: {
    fontSize: 10,
    maxWidth: 72,
    color: '#C5D0DC',
  },
  emptyLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '600',
  },
});
