import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: { password: string | null; coverUri: string | null }) => void;
};

export function ScreenShareCreateSheet({ visible, busy = false, onClose, onSubmit }: Props) {
  const [password, setPassword] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPassword('');
      setCoverUri(null);
    }
  }, [visible]);

  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const trimmed = password.trim();
  const passwordOk = trimmed.length === 0 || trimmed.length >= 4;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Yeni pencere</Text>
          <Text style={styles.subtitle}>
            İstersen kapak resmi ve şifre ekle. Kapak yoksa listenin içinde avatarın görünür.
          </Text>

          <Pressable
            onPress={() => void pickCover()}
            disabled={busy}
            style={({ pressed }) => [styles.coverPick, pressed && { opacity: 0.88 }]}
          >
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverPreview} />
            ) : (
              <View style={styles.coverEmpty}>
                <Ionicons name="image-outline" size={22} color={SCREEN_SHARE_ACCENT} />
                <Text style={styles.coverHint}>Kapak resmi ekle (isteğe bağlı)</Text>
              </View>
            )}
            {coverUri ? (
              <Pressable
                onPress={() => setCoverUri(null)}
                hitSlop={8}
                style={styles.clearCover}
                disabled={busy}
              >
                <Ionicons name="close-circle" size={22} color="#F4F7FB" />
              </Pressable>
            ) : null}
          </Pressable>

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Şifre (isteğe bağlı, en az 4)"
            placeholderTextColor="#5A6A7C"
            secureTextEntry
            editable={!busy}
            style={styles.input}
          />

          <Pressable
            disabled={busy || !passwordOk}
            onPress={() => onSubmit({ password: trimmed || null, coverUri })}
            style={({ pressed }) => [
              styles.primary,
              { opacity: pressed || busy || !passwordOk ? 0.75 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#04110E" />
            ) : (
              <Text style={styles.primaryText}>Pencereyi aç</Text>
            )}
          </Pressable>

          <Pressable
            disabled={busy}
            onPress={() => onSubmit({ password: null, coverUri })}
            style={styles.ghost}
          >
            <Text style={styles.ghostText}>Şifresiz oluştur</Text>
          </Pressable>

          <Pressable disabled={busy} onPress={onClose} style={styles.ghost}>
            <Text style={styles.cancelText}>Vazgeç</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: 20,
    backgroundColor: '#121820',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A3444',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: '#F4F7FB', fontWeight: '800', fontSize: 18 },
  subtitle: { color: '#9AA8BC', fontSize: 13, lineHeight: 18 },
  coverPick: {
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,14,20,0.8)',
  },
  coverPreview: { width: '100%', height: '100%' },
  coverEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverHint: { color: 'rgba(180,196,214,0.9)', fontSize: 12.5, fontWeight: '600' },
  clearCover: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A3444',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: '#F4F7FB',
    backgroundColor: '#0A0E14',
    fontSize: 16,
  },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#04110E', fontWeight: '900', fontSize: 15 },
  ghost: { alignItems: 'center', paddingVertical: 8 },
  ghostText: { color: SCREEN_SHARE_ACCENT, fontWeight: '700' },
  cancelText: { color: '#7A8A9C', fontWeight: '600' },
});
