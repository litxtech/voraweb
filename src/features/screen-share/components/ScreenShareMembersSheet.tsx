import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import {
  kickScreenShareParticipant,
  listScreenShareJoinRequests,
  listScreenShareParticipants,
  respondScreenShareInvite,
} from '@/features/screen-share/services/screenShareSessionService';
import type { ScreenShareJoinRequest, ScreenShareParticipant } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';

type Props = {
  visible: boolean;
  sessionId: string;
  isHost: boolean;
  onClose: () => void;
};

export function ScreenShareMembersSheet({ visible, sessionId, isHost, onClose }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<ScreenShareParticipant[]>([]);
  const [requests, setRequests] = useState<ScreenShareJoinRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listScreenShareParticipants(sessionId);
      setMembers(rows);
      if (isHost) {
        const pending = await listScreenShareJoinRequests(sessionId);
        setRequests(pending);
      } else {
        setRequests([]);
      }
    } catch (err) {
      Alert.alert('Üyeler', err instanceof Error ? err.message : 'Liste alınamadı');
    } finally {
      setLoading(false);
    }
  }, [sessionId, isHost]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const onlineCount = members.filter((m) => m.isOnline).length;

  const onKick = (member: ScreenShareParticipant) => {
    Alert.alert('Üye at', `@${member.username} odadan çıkarılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'At',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(member.userId);
            try {
              await kickScreenShareParticipant(sessionId, member.userId);
              await refresh();
            } catch (err) {
              Alert.alert('Atma', err instanceof Error ? err.message : 'İşlem başarısız');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const onRespond = (req: ScreenShareJoinRequest, approve: boolean) => {
    void (async () => {
      setBusyId(req.id);
      try {
        await respondScreenShareInvite(req.id, approve);
        await refresh();
      } catch (err) {
        Alert.alert('Davet', err instanceof Error ? err.message : 'Yanıtlanamadı');
      } finally {
        setBusyId(null);
      }
    })();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Katılımcılar</Text>
              <Text style={styles.meta}>
                {onlineCount} çevrimiçi · {members.length} toplam
                {isHost && requests.length > 0 ? ` · ${requests.length} istek` : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={22} color="#F4F7FB" />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={SCREEN_SHARE_ACCENT} style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={members}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                isHost && requests.length > 0 ? (
                  <View style={styles.requestsBlock}>
                    <Text style={styles.requestsLabel}>DAVET İSTEKLERİ</Text>
                    {requests.map((req) => (
                      <View key={req.id} style={styles.row}>
                        <View style={[styles.avatar, { backgroundColor: `${SCREEN_SHARE_ACCENT}33` }]}>
                          <Text style={styles.avatarText}>
                            {(req.username || '?').slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.copy}>
                          <Text style={styles.name} numberOfLines={1}>
                            @{req.username}
                          </Text>
                          <Text style={styles.status}>Davet istiyor</Text>
                        </View>
                        <Pressable
                          onPress={() => onRespond(req, false)}
                          disabled={busyId === req.id}
                          style={styles.rejectBtn}
                        >
                          <Text style={styles.rejectText}>Reddet</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => onRespond(req, true)}
                          disabled={busyId === req.id}
                          style={styles.approveBtn}
                        >
                          {busyId === req.id ? (
                            <ActivityIndicator color="#04110E" size="small" />
                          ) : (
                            <Text style={styles.approveText}>Kabul</Text>
                          )}
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                const canKick = isHost && !item.isHost && item.userId !== user?.id && item.isOnline;
                return (
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: item.isOnline ? `${SCREEN_SHARE_ACCENT}33` : '#1A2230' },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {(item.username || '?').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.copy}>
                      <Text style={styles.name} numberOfLines={1}>
                        @{item.username}
                        {item.isHost ? ' · Host' : ''}
                      </Text>
                      <Text style={styles.status}>
                        {item.kickedAt
                          ? 'Atıldı'
                          : item.isOnline
                            ? 'Çevrimiçi'
                            : 'Çevrimdışı'}
                      </Text>
                    </View>
                    {canKick ? (
                      <Pressable
                        onPress={() => onKick(item)}
                        disabled={busyId === item.userId}
                        style={styles.kickBtn}
                      >
                        {busyId === item.userId ? (
                          <ActivityIndicator color="#EF5350" size="small" />
                        ) : (
                          <Text style={styles.kickText}>At</Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>Henüz üye yok</Text>}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#0E141C',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A3444',
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { color: '#F4F7FB', fontWeight: '800', fontSize: 18 },
  meta: { color: '#9AA8BC', fontSize: 12, marginTop: 2 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  requestsBlock: { gap: spacing.sm, marginBottom: spacing.md },
  requestsLabel: {
    color: 'rgba(107,122,143,0.95)',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1F2A38',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#F4F7FB', fontWeight: '800' },
  copy: { flex: 1, gap: 2 },
  name: { color: '#F4F7FB', fontWeight: '700', fontSize: 14 },
  status: { color: '#7A8A9C', fontSize: 12 },
  kickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EF535055',
  },
  kickText: { color: '#EF5350', fontWeight: '800', fontSize: 12 },
  approveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: SCREEN_SHARE_ACCENT,
    minWidth: 58,
    alignItems: 'center',
  },
  approveText: { color: '#04110E', fontWeight: '800', fontSize: 12 },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  rejectText: { color: '#9AA8BC', fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: '#7A8A9C', paddingVertical: 24 },
});
