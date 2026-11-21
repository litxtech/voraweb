import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { Screen } from '@/components/ui/Screen';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  VV_ACCENT,
  VV_STATUS_LABELS,
  VV_UNCONFIGURED_NOTES,
  type VvVisibility,
} from '@/features/vora-video';
import { useVvCategories } from '../hooks/useVvCategories';
import {
  createVvVideo,
  publishVvVideo,
  setVvVideoThumbnail,
  syncVvStreamUpload,
} from '../services/api';
import {
  pickVvThumbnail,
  pickVvVideo,
  uploadVvThumbnail,
  uploadVvVideo,
  type VvPickedVideo,
  type VvUploadProgress,
} from '../services/uploader';
import { vvFormatDuration } from '../services/format';
import { supabase } from '@/lib/supabase/client';
import { VvNotice } from './VvUi';

type Phase = 'form' | 'uploading' | 'processing' | 'ready' | 'published' | 'error';

const VISIBILITY: { id: VvVisibility; label: string; hint: string }[] = [
  { id: 'public', label: 'Herkese açık', hint: 'Sahne ana sayfasında yayınlanır' },
  { id: 'unlisted', label: 'Bağlantı ile', hint: 'Yalnızca bağlantıya sahip olanlar izler' },
  { id: 'private', label: 'Yalnızca ben', hint: 'Sadece sen görebilirsin' },
];

export function VoraVideoUploadScreen() {
  const { colors } = useTheme();
  const [video, setVideo] = useState<VvPickedVideo | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const categories = useVvCategories();
  const [categoryId, setCategoryId] = useState<string>('camp-nature');

  useEffect(() => {
    if (categories.length > 0 && !categories.some((category) => category.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<VvVisibility>('public');
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState<VvUploadProgress | null>(null);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [publishNow, setPublishNow] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    },
    [],
  );

  const pickVideo = useCallback(async () => {
    const result = await pickVvVideo();
    if (result.error) Alert.alert('Video seçilemedi', result.error);
    if (result.video) {
      setVideo(result.video);
      setPhase('form');
      setProgress(null);
      if (!title) setTitle(result.video.fileName.replace(/\.[a-z0-9]+$/i, ''));
    }
  }, [title]);

  const pickThumbnail = useCallback(async () => {
    const result = await pickVvThumbnail();
    if (result.error) Alert.alert('Kapak seçilemedi', result.error);
    if (result.uri) setThumbnailUri(result.uri);
  }, []);

  const waitForStreamReady = useCallback(async (id: string, attempt = 0): Promise<boolean> => {
    const sync = await syncVvStreamUpload(id);
    if (sync.error) {
      if (attempt >= 30) {
        setPhase('error');
        setError(sync.error);
        return false;
      }
    } else {
      const state = sync.data?.status;
      if (state === 'ready') {
        setPhase('ready');
        setStatusLabel(VV_STATUS_LABELS.ready ?? 'Yayına hazır');
        return true;
      }
      if (state === 'error') {
        setPhase('error');
        setError(sync.data?.reason ?? 'Video işlenemedi.');
        return false;
      }
      setStatusLabel(VV_STATUS_LABELS.processing ?? 'Video işleniyor');
    }

    if (attempt >= 60) {
      setPhase('error');
      setError('Video işleme zaman aşımına uğradı. Daha sonra stüdyodan durumu kontrol et.');
      return false;
    }

    await new Promise<void>((resolve) => {
      pollingRef.current = setTimeout(resolve, 4000);
    });
    return waitForStreamReady(id, attempt + 1);
  }, []);

  const submit = useCallback(async () => {
    if (!video) {
      Alert.alert('Video seç', 'Önce bir video dosyası seçmelisin.');
      return;
    }
    if (title.trim().length < 3) {
      Alert.alert('Başlık gerekli', 'En az 3 karakterlik bir başlık yaz.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Oturum gerekli', 'Video yüklemek için giriş yapmalısın.');
      return;
    }

    setPhase('uploading');
    setError(null);
    setProgress({ sentBytes: 0, totalBytes: video.sizeBytes, phase: 'preparing' });
    setStatusLabel(VV_STATUS_LABELS.uploading ?? 'Yükleniyor');

    const created = await createVvVideo({
      title: title.trim(),
      description: description.trim(),
      categoryId,
      tags: tags
        .split(',')
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 12),
      visibility,
      providerAssetId: null,
      durationSeconds: video.durationSeconds,
    });

    if (created.error || !created.data) {
      setPhase('error');
      setError(created.error ?? 'Video kaydı oluşturulamadı.');
      return;
    }
    const id = created.data;
    setVideoId(id);

    if (thumbnailUri) {
      const thumb = await uploadVvThumbnail({ userId: user.id, uri: thumbnailUri });
      if (thumb.url) await setVvVideoThumbnail(id, thumb.url);
    }

    const upload = await uploadVvVideo({
      videoId: id,
      video,
      onProgress: (next) => {
        setProgress(next);
        if (next.phase === 'finalizing') setStatusLabel('Yükleme tamamlandı, işleniyor');
      },
    });

    if (upload.error) {
      setPhase('error');
      setError(upload.error);
      return;
    }

    setPhase('processing');
    setStatusLabel(VV_STATUS_LABELS.processing ?? 'Video işleniyor');
    const ready = await waitForStreamReady(id);
    if (!ready) return;

    if (publishNow) {
      const published = await publishVvVideo(id);
      if (published.error) {
        setPhase('error');
        setError(published.error);
        return;
      }
      setPhase('published');
      setStatusLabel(VV_STATUS_LABELS.published ?? 'Yayınlandı');
    }
  }, [
    categoryId,
    description,
    publishNow,
    tags,
    thumbnailUri,
    title,
    video,
    visibility,
    waitForStreamReady,
  ]);

  const percent = progress && progress.totalBytes > 0
    ? Math.min(100, Math.round((progress.sentBytes / progress.totalBytes) * 100))
    : 0;

  const busy = phase === 'uploading' || phase === 'processing';

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <ScreenBackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="h3">Video yükle</Text>
          <Text variant="caption" muted>
            Uzun video ve vlog yükle
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/vora-video/studio' as never)}
          style={styles.headerLink}
          hitSlop={8}
        >
          <Text variant="caption" style={{ color: VV_ACCENT }}>
            Stüdyo
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {phase === 'error' && error ? <VvNotice tone="danger">{error}</VvNotice> : null}

        {busy || phase === 'ready' || phase === 'published' ? (
          <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.statusHead}>
              <Ionicons
                name={
                  phase === 'published'
                    ? 'checkmark-circle'
                    : phase === 'ready'
                      ? 'cloud-done-outline'
                      : 'cloud-upload-outline'
                }
                size={22}
                color={phase === 'published' || phase === 'ready' ? colors.success : VV_ACCENT}
              />
              <Text variant="label">{statusLabel || 'İşleniyor'}</Text>
              {busy ? <ActivityIndicator size="small" color={VV_ACCENT} /> : null}
            </View>
            {phase === 'uploading' ? (
              <>
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={[styles.progressFill, { width: `${percent}%` }]} />
                </View>
                <Text variant="caption" muted>
                  %{percent} · {progress ? `${(progress.sentBytes / 1_048_576).toFixed(1)} / ${(progress.totalBytes / 1_048_576).toFixed(1)} MB` : ''}
                </Text>
              </>
            ) : null}
            {phase === 'ready' || phase === 'published' ? (
              <View style={styles.statusActions}>
                <Pressable
                  onPress={() =>
                    videoId ? router.replace(`/vora-video/watch/${videoId}` as never) : undefined
                  }
                  style={[styles.smallButton, { backgroundColor: VV_ACCENT }]}
                >
                  <Text variant="caption" style={styles.smallButtonText}>
                    Videoyu aç
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/vora-video/studio' as never)}
                  style={[styles.smallButton, { borderWidth: 1, borderColor: colors.border }]}
                >
                  <Text variant="caption">Stüdyoya git</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {phase === 'form' || phase === 'error' ? (
          <>
            <Pressable
              onPress={() => void pickVideo()}
              style={[styles.picker, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              {video ? (
                <View style={styles.pickerFilled}>
                  <Ionicons name="videocam" size={26} color={VV_ACCENT} />
                  <View style={styles.pickerInfo}>
                    <Text variant="label" numberOfLines={1}>
                      {video.fileName}
                    </Text>
                    <Text variant="caption" muted>
                      {(video.sizeBytes / 1_048_576).toFixed(1)} MB
                      {video.durationSeconds ? ` · ${vvFormatDuration(video.durationSeconds)}` : ''}
                    </Text>
                  </View>
                  <Text variant="caption" style={{ color: VV_ACCENT }}>
                    Değiştir
                  </Text>
                </View>
              ) : (
                <View style={styles.pickerEmpty}>
                  <Ionicons name="cloud-upload-outline" size={34} color={colors.textMuted} />
                  <Text variant="label">Video dosyası seç</Text>
                  <Text variant="caption" muted style={styles.pickerHint}>
                    MP4, MOV · Büyük dosyalar parçalı (resumable) yüklenir
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => void pickThumbnail()}
              style={[styles.thumbPicker, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              {thumbnailUri ? (
                <OptimizedImage uri={thumbnailUri} style={styles.thumbPreview} />
              ) : (
                <View style={[styles.thumbPreview, styles.thumbEmpty, { backgroundColor: colors.surfaceElevated }]}>
                  <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.thumbText}>
                <Text variant="label">Kapak görseli</Text>
                <Text variant="caption" muted>
                  16:9 oranında bir görsel seç. Seçilmezse Stream kapak üretir.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>

            <Field label="Başlık" required>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Video başlığı"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                maxLength={120}
              />
            </Field>

            <Field label="Açıklama">
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Videoyu anlat…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={4000}
                style={[
                  styles.input,
                  styles.textarea,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
            </Field>

            <Field label="Kategori" required>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {categories.map((category) => {
                  const active = categoryId === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => setCategoryId(category.id as string)}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? VV_ACCENT : colors.border,
                          backgroundColor: active ? `${VV_ACCENT}1F` : colors.surface,
                        },
                      ]}
                    >
                      <Text variant="caption" style={{ color: active ? VV_ACCENT : colors.textSecondary }}>
                        {category.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Field>

            <Field label="Etiketler">
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="kamp, karadeniz, doğa"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
              <Text variant="caption" muted>
                Virgülle ayır. En fazla 12 etiket.
              </Text>
            </Field>

            <Field label="Gizlilik">
              <View style={styles.visibilityList}>
                {VISIBILITY.map((item) => {
                  const active = visibility === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setVisibility(item.id)}
                      style={[
                        styles.visibilityRow,
                        { borderColor: active ? VV_ACCENT : colors.border, backgroundColor: colors.surface },
                      ]}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={active ? VV_ACCENT : colors.textMuted}
                      />
                      <View style={styles.visibilityText}>
                        <Text variant="label">{item.label}</Text>
                        <Text variant="caption" muted>
                          {item.hint}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            <Pressable
              onPress={() => setPublishNow((value) => !value)}
              style={styles.checkboxRow}
            >
              <Ionicons
                name={publishNow ? 'checkbox' : 'square-outline'}
                size={20}
                color={publishNow ? VV_ACCENT : colors.textMuted}
              />
              <Text variant="caption">
                Yükleme ve işleme tamamlandığında hemen yayınla (aksi halde taslak olarak kalır)
              </Text>
            </Pressable>

            <View style={[styles.note, { borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text variant="caption" muted style={styles.noteText}>
                {VV_UNCONFIGURED_NOTES.stream}
              </Text>
            </View>

            <Pressable
              onPress={() => void submit()}
              style={[styles.submit, !video && styles.submitDisabled]}
              disabled={!video}
            >
              <Ionicons name="cloud-upload" size={17} color="#FFFFFF" />
              <Text variant="label" style={styles.submitText}>
                {publishNow ? 'Yükle ve yayınla' : 'Yükle ve taslak bırak'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text variant="label">
        {label}
        {required ? <Text style={{ color: VV_ACCENT }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1 },
  headerLink: { paddingHorizontal: spacing.sm },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  statusCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: VV_ACCENT },
  statusActions: { flexDirection: 'row', gap: spacing.sm },
  smallButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  smallButtonText: { color: '#FFFFFF', fontWeight: '700' },
  picker: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: spacing.md },
  pickerEmpty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  pickerHint: { textAlign: 'center' },
  pickerFilled: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pickerInfo: { flex: 1 },
  thumbPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  thumbPreview: { width: 88, height: 50, borderRadius: radius.sm },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { flex: 1, gap: 1 },
  field: { gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  chips: { gap: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1 },
  visibilityList: { gap: spacing.xs },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  visibilityText: { flex: 1, gap: 1 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  note: { flexDirection: 'row', gap: spacing.xs, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  noteText: { flex: 1, lineHeight: 17 },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: VV_ACCENT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
});
