import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { Text } from '@/components/ui/Text';
import {
  SCREEN_SHARE_ACCENT,
  SCREEN_SHARE_DRM_HINT,
  screenShareSessionPath,
} from '@/features/screen-share/constants';
import {
  createScreenShareSession,
  joinScreenShareSession,
} from '@/features/screen-share/services/screenShareSessionService';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

export function ScreenShareHubScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const openSession = (sessionId: string) => {
    router.replace(screenShareSessionPath(sessionId) as Href);
  };

  const onCreate = async () => {
    setBusy('create');
    try {
      const session = await createScreenShareSession('Sesli oda');
      openSession(session.id);
    } catch (err) {
      Alert.alert('Sesli oda', err instanceof Error ? err.message : 'Oda açılamadı');
    } finally {
      setBusy(null);
    }
  };

  const onJoin = async () => {
    const normalized = code.replace(/\D/g, '');
    if (normalized.length !== 6) {
      Alert.alert('Kod', '6 haneli oda kodunu gir.');
      return;
    }
    setBusy('join');
    try {
      const session = await joinScreenShareSession(normalized);
      openSession(session.id);
    } catch (err) {
      Alert.alert('Katıl', err instanceof Error ? err.message : 'Odaya girilemedi');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#041F1C', '#05070A', '#05070A']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + spacing.sm,
              paddingBottom: insets.bottom + spacing.xl,
            },
          ]}
        >
          <ScreenBackButton />

          <View style={styles.hero}>
            <View style={styles.badge}>
              <Ionicons name="people-outline" size={16} color={SCREEN_SHARE_ACCENT} />
              <Text style={styles.badgeText}>BAĞIMSIZ SESLİ ODA</Text>
            </View>
            <Text style={styles.title}>
              Konuş.{'\n'}Ekranı paylaş.{'\n'}Rahatça izle.
            </Text>
            <Text style={styles.subtitle}>
              Şehir sistemi yok. Kendi odanı aç, kodu gönder, mikrofon + ekran aynı anda.
            </Text>
          </View>

          <View style={styles.points}>
            {[
              { icon: 'mic-outline' as const, t: 'Sesli konuşma' },
              { icon: 'desktop-outline' as const, t: 'Ekran paylaşımı' },
              { icon: 'eye-outline' as const, t: 'Akıcı izleme (720p)' },
            ].map((item) => (
              <View key={item.t} style={styles.point}>
                <Ionicons name={item.icon} size={16} color={SCREEN_SHARE_ACCENT} />
                <Text style={styles.pointText}>{item.t}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => void onCreate()}
            disabled={busy != null}
            style={({ pressed }) => [
              styles.primaryCta,
              { opacity: pressed || busy === 'create' ? 0.85 : 1 },
            ]}
          >
            {busy === 'create' ? (
              <ActivityIndicator color="#04110E" />
            ) : (
              <>
                <Ionicons name="add-circle" size={22} color="#04110E" />
                <Text style={styles.primaryCtaText}>Sesli oda aç</Text>
              </>
            )}
          </Pressable>

          <View style={[styles.joinCard, { borderColor: colors.border }]}>
            <Text style={styles.joinLabel}>ODA KODU İLE GİR</Text>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor="#5A6A7C"
              style={styles.codeInput}
              maxLength={6}
            />
            <Pressable
              onPress={() => void onJoin()}
              disabled={busy != null}
              style={({ pressed }) => [
                styles.secondaryCta,
                { opacity: pressed || busy === 'join' ? 0.8 : 1 },
              ]}
            >
              {busy === 'join' ? (
                <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
              ) : (
                <Text style={styles.secondaryCtaText}>Odaya katıl</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footnote}>{SCREEN_SHARE_DRM_HINT}</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070A' },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  hero: { gap: spacing.md, marginTop: spacing.md },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: `${SCREEN_SHARE_ACCENT}22`,
  },
  badgeText: { color: SCREEN_SHARE_ACCENT, fontWeight: '800', fontSize: 11, letterSpacing: 0.6 },
  title: {
    color: '#F4F7FB',
    fontWeight: '900',
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  subtitle: { color: '#9AA8BC', fontSize: 15, lineHeight: 22, maxWidth: 340 },
  points: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pointText: { color: '#D5DEE8', fontSize: 12, fontWeight: '600' },
  primaryCta: {
    marginTop: spacing.sm,
    minHeight: 58,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: SCREEN_SHARE_ACCENT,
  },
  primaryCtaText: { color: '#04110E', fontWeight: '900', fontSize: 17 },
  joinCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(18,24,32,0.92)',
  },
  joinLabel: { color: '#6B7A8F', fontWeight: '800', fontSize: 11, letterSpacing: 0.8 },
  codeInput: {
    borderWidth: 1,
    borderColor: '#2A3444',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    color: '#F4F7FB',
    backgroundColor: '#0A0E14',
  },
  secondaryCta: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaText: { color: SCREEN_SHARE_ACCENT, fontWeight: '800' },
  footnote: { fontSize: 11, textAlign: 'center', color: '#6B7A8F', marginTop: 'auto' },
});
