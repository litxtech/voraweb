import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import {
  youtubeEmbedHtml,
  youtubeRefererOrigin,
} from '@/features/screen-share/services/youtubeEmbed';
import {
  formatYoutubeDuration,
  formatYoutubeViews,
  searchYoutubeVideos,
  type YoutubeRail,
  type YoutubeSearchHit,
} from '@/features/screen-share/services/youtubeSearch';
import {
  ensureYoutubeCatalog,
  readYoutubeCatalogCache,
} from '@/features/screen-share/services/youtubeCatalogCache';
import { fetchYoutubeSuggestions } from '@/features/screen-share/services/youtubeSuggest';
import { spacing } from '@/constants/theme';

const RAILS: { id: YoutubeRail; label: string; hint: string }[] = [
  { id: 'trend', label: 'Trendler', hint: 'Şu an popüler' },
  { id: 'film', label: 'Film', hint: 'Sinema & fragman' },
  { id: 'dizi', label: 'Dizi', hint: 'Yeni sezonlar' },
  { id: 'fragman', label: 'Fragman', hint: 'Öne çıkanlar' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Seçilen video odaya yayınlanır — sahne herkese gösterir. */
  onShare: (hit: YoutubeSearchHit) => void;
  /** Odada şu an yayınlanan video — kart arka planda açılınca kesilmez. */
  nowPlaying?: YoutubeSearchHit | null;
};

type PosterCardProps = {
  item: YoutubeSearchHit;
  width: number;
  height: number;
  active?: boolean;
  onPress: () => void;
};

function PosterCard({ item, width, height, active, onPress }: PosterCardProps) {
  const duration = formatYoutubeDuration(item.duration);
  const views = formatYoutubeViews(item.viewCount);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.poster,
        { width, height },
        active && styles.posterActive,
        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
      ]}
    >
      {item.thumbnailUrl ? (
        <OptimizedImage
          uri={item.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          tier="feed"
          recyclingKey={`yt-p-${item.videoId}`}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.posterFallback]}>
          <Ionicons name="film-outline" size={28} color="#6B7A8C" />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.92)']}
        locations={[0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.playBadge}>
        <Ionicons name="play" size={13} color="#04110E" />
      </View>
      {duration ? (
        <View style={styles.durationPill}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      ) : null}
      <View style={styles.posterMeta}>
        <Text style={styles.posterTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.posterSub} numberOfLines={1}>
          {views ?? item.channelTitle}
        </Text>
      </View>
    </Pressable>
  );
}

export function ScreenShareYoutubeSheet({ visible, onClose, onShare, nowPlaying = null }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const initialCatalog = readYoutubeCatalogCache();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(!initialCatalog);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchItems, setSearchItems] = useState<YoutubeSearchHit[]>([]);
  const [rails, setRails] = useState<Record<YoutubeRail, YoutubeSearchHit[]>>(
    () => initialCatalog ?? { trend: [], film: [], dizi: [], fragman: [] },
  );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<YoutubeSearchHit | null>(
    () => initialCatalog?.trend[0] ?? initialCatalog?.film[0] ?? null,
  );
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [activeRail, setActiveRail] = useState<YoutubeRail>('trend');
  const refererOrigin = useMemo(() => youtubeRefererOrigin(), []);
  const suggestSeq = useRef(0);
  const loadedRef = useRef(false);

  const posterW = Math.min(148, Math.max(128, winW * 0.34));
  const posterH = posterW * 1.42;
  const heroH = Math.min(232, winW * 0.5);
  const isSearchMode = query.trim().length >= 2 && searchItems.length > 0;
  const featured = preview ?? rails.trend[0] ?? rails.film[0] ?? null;

  const loadCatalog = useCallback(async (force = false) => {
    const cached = readYoutubeCatalogCache();
    if (cached) {
      setRails(cached);
      setPreview((prev) => prev ?? cached.trend[0] ?? cached.film[0] ?? null);
      setCatalogBusy(false);
    }
    // TTL taze ise ensure ağ çağırmaz; bayatsa tek sefer yeniler.
    if (!force && cached) {
      void ensureYoutubeCatalog({ force: false }).then((data) => {
        setRails(data);
        setPreview((prev) => prev ?? data.trend[0] ?? data.film[0] ?? null);
      });
      return;
    }
    setCatalogBusy(!cached);
    setError(null);
    try {
      const data = await ensureYoutubeCatalog({ force: true });
      setRails(data);
      setPreview((prev) => prev ?? data.trend[0] ?? data.film[0] ?? null);
    } catch (err) {
      if (!readYoutubeCatalogCache()) {
        setError(err instanceof Error ? err.message : 'Katalog yüklenemedi');
      }
    } finally {
      setCatalogBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setPreviewPlaying(false);
      setShowSuggestions(false);
      setSuggestions([]);
      setError(null);
      loadedRef.current = false;
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    // Cache varsa anında boya; ağ sadece TTL dolunca.
    void loadCatalog(false);
  }, [visible, loadCatalog]);

  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 1 || previewPlaying) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const seq = ++suggestSeq.current;
    setSuggestBusy(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await fetchYoutubeSuggestions(q);
          if (suggestSeq.current !== seq) return;
          setSuggestions(rows);
          setShowSuggestions(rows.length > 0);
        } catch {
          if (suggestSeq.current !== seq) return;
          setSuggestions([]);
          setShowSuggestions(false);
        } finally {
          if (suggestSeq.current === seq) setSuggestBusy(false);
        }
      })();
    }, 220);
    return () => clearTimeout(timer);
  }, [query, visible, previewPlaying]);

  const runSearch = async (
    pageToken?: string | null,
    append = false,
    forcedQuery?: string,
  ) => {
    const q = (forcedQuery ?? query).trim();
    if (q.length < 2) {
      setError('En az 2 karakter yaz');
      return;
    }
    if (forcedQuery != null) setQuery(forcedQuery);
    setBusy(true);
    setError(null);
    setShowSuggestions(false);
    setSuggestions([]);
    setPreviewPlaying(false);
    try {
      const res = await searchYoutubeVideos({ q, pageToken, maxResults: 24 });
      setSearchItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNextPageToken(res.nextPageToken);
      if (!append && res.items[0]) setPreview(res.items[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arama başarısız');
    } finally {
      setBusy(false);
    }
  };

  const onPickSuggestion = (text: string) => {
    setQuery(text);
    setShowSuggestions(false);
    void runSearch(null, false, text);
  };

  const onFocusVideo = (hit: YoutubeSearchHit) => {
    setShowSuggestions(false);
    setPreview(hit);
    setPreviewPlaying(true);
  };

  const onPublish = () => {
    if (!featured) return;
    onShare(featured);
    onClose();
  };

  const watchingLive = Boolean(nowPlaying?.videoId);

  const clearSearch = () => {
    setQuery('');
    setSearchItems([]);
    setNextPageToken(null);
    setPreviewPlaying(false);
    if (rails.trend[0]) setPreview(rails.trend[0]);
  };

  const visibleRails =
    activeRail === 'trend' ? RAILS : RAILS.filter((r) => r.id === activeRail);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 4, paddingBottom: insets.bottom }]}>
        <View style={styles.sheet}>
          <LinearGradient colors={['#140A12', '#070B12', '#05070A']} style={StyleSheet.absoluteFill} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.cinemaBadge}>
                <Ionicons name="film-outline" size={12} color={SCREEN_SHARE_ACCENT} />
                <Text style={styles.cinemaBadgeText}>SİNEMA</Text>
              </View>
              <Text style={styles.title}>İzle & yayınla</Text>
              <Text style={styles.subtitle}>
                {watchingLive
                  ? 'Oda izlemeye devam ediyor · yeni video seçince herkese geçer'
                  : 'Trend · film · dizi — seçince herkes görür'}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.close}
              accessibilityLabel={watchingLive ? 'İzlemeye dön' : 'Kapat'}
            >
              <Ionicons name={watchingLive ? 'play-back-outline' : 'close'} size={20} color="#F4F7FB" />
            </Pressable>
          </View>

          {watchingLive && nowPlaying ? (
            <Pressable onPress={onClose} style={styles.nowPlayingBar}>
              <View style={styles.nowPlayingDot} />
              <View style={styles.nowPlayingCopy}>
                <Text style={styles.nowPlayingLabel}>Şu an odada</Text>
                <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                  {nowPlaying.title}
                </Text>
              </View>
              <Text style={styles.nowPlayingAction}>İzlemeye dön</Text>
            </Pressable>
          ) : null}

          <View style={styles.searchBlock}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color="#7A8A9C" style={{ marginLeft: 12 }} />
              <TextInput
                value={query}
                onChangeText={(v) => {
                  setQuery(v);
                  setShowSuggestions(true);
                  if (!v.trim()) clearSearch();
                }}
                placeholder="Film, dizi, fragman ara…"
                placeholderTextColor="#5A6A7C"
                style={styles.input}
                returnKeyType="search"
                onSubmitEditing={() => void runSearch()}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                autoCorrect={false}
              />
              {query.length > 0 ? (
                <Pressable onPress={clearSearch} hitSlop={8} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color="#6B7A8C" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => void runSearch()}
                disabled={busy}
                style={({ pressed }) => [styles.searchBtn, { opacity: pressed || busy ? 0.75 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator color="#04110E" size="small" />
                ) : (
                  <Ionicons name="arrow-forward" size={16} color="#04110E" />
                )}
              </Pressable>
            </View>

            {showSuggestions && !previewPlaying ? (
              <View style={styles.suggestBox}>
                {suggestBusy && suggestions.length === 0 ? (
                  <Text style={styles.suggestHint}>Öneriler…</Text>
                ) : null}
                {suggestions.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => onPickSuggestion(item)}
                    style={({ pressed }) => [styles.suggestRow, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="sparkles-outline" size={14} color="#9AA8BC" />
                    <Text style={styles.suggestText} numberOfLines={1}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {featured ? (
            <View style={[styles.hero, { height: heroH }]}>
              {previewPlaying ? (
                <WebView
                  source={{
                    html: youtubeEmbedHtml(featured.videoId, { autoplay: true, mute: true }),
                    baseUrl: refererOrigin,
                  }}
                  style={styles.heroPlayer}
                  originWhitelist={['*']}
                  allowsFullscreenVideo
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  javaScriptEnabled
                  domStorageEnabled
                  mixedContentMode="always"
                  setSupportMultipleWindows={false}
                  onShouldStartLoadWithRequest={() => true}
                />
              ) : (
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewPlaying(true)}>
                  {featured.thumbnailUrl ? (
                    <OptimizedImage
                      uri={featured.thumbnailUrl}
                      style={StyleSheet.absoluteFill}
                      tier="feed"
                      recyclingKey={`yt-hero-${featured.videoId}`}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.posterFallback]} />
                  )}
                  <LinearGradient
                    colors={['rgba(5,7,10,0.1)', 'rgba(5,7,10,0.5)', 'rgba(5,7,10,0.98)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.heroPlay}>
                    <Ionicons name="play" size={26} color="#04110E" />
                  </View>
                </Pressable>
              )}
              <View style={styles.heroInfo} pointerEvents="box-none">
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {featured.title}
                </Text>
                <Text style={styles.heroMeta} numberOfLines={1}>
                  {featured.channelTitle}
                  {formatYoutubeViews(featured.viewCount)
                    ? ` · ${formatYoutubeViews(featured.viewCount)}`
                    : ''}
                </Text>
                <View style={styles.heroActions}>
                  <Pressable
                    onPress={onPublish}
                    style={({ pressed }) => [styles.heroCta, { opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Ionicons name="radio-outline" size={15} color="#04110E" />
                    <Text style={styles.heroCtaText}>{watchingLive ? 'Bunu yayınla' : 'Odaya yayınla'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPreviewPlaying((p) => !p)}
                    style={styles.heroGhost}
                  >
                    <Text style={styles.heroGhostText}>
                      {previewPlaying ? 'Önizlemeyi kapat' : 'Önizle'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : catalogBusy ? (
            <View style={[styles.hero, styles.heroLoading, { height: heroH }]}>
              <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
              <Text style={styles.loadingHint}>Trendler yükleniyor…</Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.railsScroll}
            contentContainerStyle={styles.railsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isSearchMode ? (
              <View style={styles.railBlock}>
                <View style={styles.railHead}>
                  <Text style={styles.railTitle}>Arama</Text>
                  <Text style={styles.railHint}>{searchItems.length} video</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.railRow}
                >
                  {searchItems.map((item) => (
                    <PosterCard
                      key={item.videoId}
                      item={item}
                      width={posterW}
                      height={posterH}
                      active={preview?.videoId === item.videoId}
                      onPress={() => onFocusVideo(item)}
                    />
                  ))}
                  {nextPageToken ? (
                    <Pressable
                      onPress={() => void runSearch(nextPageToken, true)}
                      style={[styles.moreCard, { width: posterW * 0.7, height: posterH }]}
                    >
                      <Text style={styles.moreCardText}>{busy ? '…' : 'Daha'}</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              </View>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {RAILS.map((rail) => {
                    const active = activeRail === rail.id;
                    return (
                      <Pressable
                        key={rail.id}
                        onPress={() => setActiveRail(rail.id)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {rail.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {visibleRails.map((rail) => {
                  const items = rails[rail.id];
                  if (items.length === 0 && !catalogBusy) return null;
                  return (
                    <View key={rail.id} style={styles.railBlock}>
                      <View style={styles.railHead}>
                        <Text style={styles.railTitle}>{rail.label}</Text>
                        <Text style={styles.railHint}>{rail.hint}</Text>
                      </View>
                      {items.length === 0 ? (
                        <ActivityIndicator
                          color={SCREEN_SHARE_ACCENT}
                          style={{ marginVertical: 24 }}
                        />
                      ) : (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.railRow}
                        >
                          {items.map((item) => (
                            <PosterCard
                              key={`${rail.id}-${item.videoId}`}
                              item={item}
                              width={posterW}
                              height={posterH}
                              active={preview?.videoId === item.videoId}
                              onPress={() => onFocusVideo(item)}
                            />
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#070B12',
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  headerCopy: { flex: 1, gap: 4 },
  cinemaBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: `${SCREEN_SHARE_ACCENT}22`,
    marginBottom: 4,
  },
  cinemaBadgeText: {
    color: SCREEN_SHARE_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: '#F4F7FB', fontWeight: '800', fontSize: 24, letterSpacing: -0.3 },
  subtitle: { color: 'rgba(180,196,214,0.85)', fontSize: 13 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  searchBlock: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    zIndex: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(12,16,24,0.9)',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: 46,
    color: '#F4F7FB',
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 15,
  },
  clearBtn: { paddingHorizontal: 4 },
  searchBtn: {
    width: 44,
    height: 46,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestBox: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,18,28,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  suggestHint: {
    color: '#7A8A9C',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  suggestText: { flex: 1, color: '#F4F7FB', fontSize: 14, fontWeight: '600' },
  error: {
    color: '#FF8A80',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 12.5,
  },
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0A0E14',
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroLoading: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingHint: { color: '#7A8A9C', fontSize: 12 },
  heroPlayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  heroPlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    gap: 4,
  },
  heroTitle: { color: '#fff', fontWeight: '800', fontSize: 16, lineHeight: 21 },
  heroMeta: { color: 'rgba(200,210,220,0.85)', fontSize: 12 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SCREEN_SHARE_ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  heroCtaText: { color: '#04110E', fontWeight: '800', fontSize: 13 },
  heroGhost: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroGhostText: { color: '#E8EEF5', fontWeight: '700', fontSize: 12 },
  railsScroll: { flex: 1 },
  railsContent: { paddingBottom: spacing.xl, gap: spacing.md },
  chipRow: {
    paddingHorizontal: spacing.lg,
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}28`,
    borderColor: `${SCREEN_SHARE_ACCENT}66`,
  },
  chipText: { color: '#9AA8BC', fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: SCREEN_SHARE_ACCENT },
  railBlock: { gap: 10 },
  railHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  railTitle: { color: '#F4F7FB', fontWeight: '800', fontSize: 17 },
  railHint: { color: '#7A8A9C', fontSize: 12, fontWeight: '600' },
  railRow: {
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  poster: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#121820',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  posterActive: {
    borderColor: `${SCREEN_SHARE_ACCENT}99`,
    borderWidth: 1.5,
  },
  posterFallback: {
    backgroundColor: '#121820',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  durationText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  posterMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    gap: 2,
  },
  posterTitle: { color: '#fff', fontWeight: '800', fontSize: 12.5, lineHeight: 16 },
  posterSub: { color: 'rgba(200,210,220,0.8)', fontSize: 10.5 },
  moreCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  moreCardText: { color: SCREEN_SHARE_ACCENT, fontWeight: '800' },
  nowPlayingBar: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,194,168,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,194,168,0.35)',
  },
  nowPlayingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SCREEN_SHARE_ACCENT,
  },
  nowPlayingCopy: { flex: 1, gap: 1 },
  nowPlayingLabel: {
    color: SCREEN_SHARE_ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  nowPlayingTitle: { color: '#F4F7FB', fontSize: 13, fontWeight: '700' },
  nowPlayingAction: { color: SCREEN_SHARE_ACCENT, fontWeight: '800', fontSize: 12 },
});
