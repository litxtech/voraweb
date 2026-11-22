import { Alert, ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  TIP_ACCENT,
  TIP_SURFACE_META,
  TIP_SURFACES,
  type TipSurface,
} from '@/features/tips/constants';
import { useTipPreferences } from '@/features/tips/hooks/useTipPreferences';

export function TipPreferencesScreen() {
  const { colors } = useTheme();
  const { prefs, loading, error, update } = useTipPreferences();

  const handleToggle = async (surface: TipSurface, enabled: boolean) => {
    const result = await update(surface, enabled);
    if (result.error) {
      Alert.alert('Kaydedilemedi', result.error);
    }
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerWrap}>
        <AuthHeader title="Bahşiş Ayarları" showBack compact />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.infoCard, { backgroundColor: colors.surfaceElevated }]}>
          <Text variant="label">Bahşiş almayı yönet</Text>
          <Text variant="caption" secondary style={styles.infoText}>
            Burada kapattığın her bölümden bahşiş butonu kaldırılır. Diğer kullanıcılar o bölümde
            sana bahşiş gönderemez; açık bıraktığın bölümlerde buton görünmeye devam eder.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={TIP_ACCENT} />
            <Text variant="caption" secondary>
              Tercihler yükleniyor…
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {TIP_SURFACES.map((surface, index) => {
              const meta = TIP_SURFACE_META[surface];
              const enabled = prefs[surface] !== false;

              return (
                <View
                  key={surface}
                  style={[
                    styles.row,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: `${TIP_ACCENT}14` }]}>
                    <Ionicons name={meta.icon} size={18} color={TIP_ACCENT} />
                  </View>
                  <View style={styles.rowText}>
                    <Text variant="label">{meta.label}</Text>
                    <Text variant="caption" secondary style={styles.rowDescription}>
                      {enabled ? meta.description : 'Kapalı — bu bölümde bahşiş butonu görünmez.'}
                    </Text>
                  </View>
                  <Switch
                    value={enabled}
                    onValueChange={(next) => void handleToggle(surface, next)}
                    trackColor={{ false: colors.border, true: `${TIP_ACCENT}88` }}
                    thumbColor={enabled ? TIP_ACCENT : colors.surfaceElevated}
                    ios_backgroundColor={colors.border}
                    accessibilityLabel={`${meta.label} bahşişini ${enabled ? 'kapat' : 'aç'}`}
                  />
                </View>
              );
            })}
          </View>
        )}

        {error ? (
          <View style={[styles.errorCard, { backgroundColor: `${colors.danger}14` }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text variant="caption" style={{ color: colors.danger, flex: 1 }}>
              {error}
            </Text>
          </View>
        ) : null}

        <Text variant="caption" secondary style={styles.footnote}>
          Tercih kaydedildiği anda sunucuda geçerli olur; kapattığın bölümde bahşiş butonu
          kaldırılır. Daha önce gönderilmiş bahşişler ve geçmiş kayıtlar etkilenmez.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  infoCard: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  infoText: { lineHeight: 18 },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowDescription: { lineHeight: 16 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  footnote: { lineHeight: 17 },
});
