import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase/client';
import { edgeFunctionErrorMessage, supabaseErrorMessage } from '@/lib/errors';
import { openUrl } from '@/lib/linking/openUrl';
import type {
  VvAdminCategoryRow,
  VvAdminCreatorRow,
  VvAdminFinanceOverview,
  VvAdminPayoutPeriod,
  VvAdminPayoutRow,
  VvAdminVideoRow,
  VvBookmarkCollection,
  VvCategoryRow,
  VvComment,
  VvConnectResult,
  VvCreatorDashboard,
  VvCreatorPage,
  VvCreatorProfileInput,
  VvFeedPromo,
  VvFeedPromotion,
  VvMyTips,
  VvMyVideo,
  VvPayoutStatus,
  VvSettings,
  VvStreamSyncResult,
  VvTipCheckout,
  VvTipDirection,
  VvUploadTicket,
  VvVideoAnalytics,
  VvVideoCard,
  VvVideoCreateInput,
  VvVideoDeleteResult,
  VvVisibility,
  VvWallet,
  VvWatchDetail,
} from '@/features/vora-video/types';

type RpcError = { message: string } | null;

type RpcResult<T> = { data: T | null; error: string | null };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  const client = supabase as unknown as {
    rpc: (
      name: string,
      params?: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: RpcError }>;
  };
  const { data, error } = await client.rpc(fn, args);
  return { data, error: error ? supabaseErrorMessage(error) : null };
}

async function invoke<T>(
  fn: string,
  body?: Record<string, unknown>,
  fallbackMessage = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
): Promise<RpcResult<T>> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(fn, {
    body: body ?? {},
  });
  if (error) {
    // Non-2xx yanıtın gövdesindeki Türkçe sunucu mesajını koru —
    // aksi halde kullanıcı yalnızca “Sunucu işlemi tamamlanamadı” görür.
    const message = await edgeFunctionErrorMessage(error, null, {
      fallback: fallbackMessage,
    });
    return { data: null, error: message };
  }
  if (!data) return { data: null, error: 'Sunucu yanıtı alınamadı.' };
  if (typeof data === 'object' && data !== null && 'error' in data && data.error) {
    return { data: null, error: String(data.error) };
  }
  return { data: data as T, error: null };
}

export function vvRpc<T>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  return rpc<T>(fn, args);
}

export function vvInvoke<T>(fn: string, body?: Record<string, unknown>): Promise<RpcResult<T>> {
  return invoke<T>(fn, body);
}

// ---------------------------------------------------------------------------
// Ayarlar ve listeler
// ---------------------------------------------------------------------------

export function loadVvSettings() {
  return rpc<VvSettings>('vv_public_settings');
}

export function listVvVideos(input: {
  scope?: 'home' | 'popular' | 'new' | 'vlogs' | 'following' | 'search';
  categoryId?: string | null;
  query?: string | null;
  limit?: number;
  offset?: number;
  creatorId?: string | null;
}) {
  return rpc<VvVideoCard[]>('vv_list_videos', {
    p_scope: input.scope ?? 'home',
    p_category: input.categoryId ?? null,
    p_query: input.query ?? null,
    p_limit: input.limit ?? 12,
    p_offset: input.offset ?? 0,
    p_creator: input.creatorId ?? null,
  });
}

export function loadVvWatchDetail(videoId: string) {
  return rpc<VvWatchDetail>('vv_watch_detail', { p_video_id: videoId });
}

export function listVvComments(
  videoId: string,
  input?: { limit?: number; before?: string | null; parentId?: string | null },
) {
  return rpc<VvComment[]>('vv_list_comments', {
    p_video_id: videoId,
    p_limit: input?.limit ?? 20,
    p_before: input?.before ?? null,
    p_parent_id: input?.parentId ?? null,
  });
}

export function addVvComment(videoId: string, body: string, parentId?: string | null) {
  return rpc<string>('vv_add_comment', {
    p_video_id: videoId,
    p_body: body,
    p_parent_id: parentId ?? null,
  });
}

export function deleteVvComment(commentId: string) {
  return rpc<boolean>('vv_delete_comment', { p_comment_id: commentId });
}

export function toggleVvCommentLike(commentId: string) {
  return rpc<{ liked: boolean; like_count: number }>('vv_toggle_comment_like', {
    p_comment_id: commentId,
  });
}

export function toggleVvLike(videoId: string) {
  return rpc<{ liked: boolean; like_count: number }>('vv_toggle_like', { p_video_id: videoId });
}

export function toggleVvBookmark(videoId: string, collection: VvBookmarkCollection) {
  return rpc<{ active: boolean; collection: VvBookmarkCollection }>('vv_toggle_bookmark', {
    p_video_id: videoId,
    p_collection: collection,
  });
}

export function toggleVvFollow(creatorId: string) {
  return rpc<{ following: boolean; follower_count: number }>('vv_toggle_follow', {
    p_creator_id: creatorId,
  });
}

export function registerVvShare(videoId: string) {
  return rpc<number>('vv_register_share', { p_video_id: videoId });
}

export function listVvBookmarks(collection: VvBookmarkCollection, offset = 0) {
  return rpc<VvVideoCard[]>('vv_list_bookmarks', {
    p_collection: collection,
    p_limit: 24,
    p_offset: offset,
  });
}

export function listVvHistory(offset = 0) {
  return rpc<VvVideoCard[]>('vv_list_history', { p_limit: 30, p_offset: offset });
}

export function clearVvHistory(videoId?: string | null) {
  return rpc<{ ok: boolean; deleted: number }>('vv_clear_history', {
    p_video_id: videoId ?? null,
  });
}

export function saveVvProgress(input: {
  videoId: string;
  sessionId: string;
  eventKey: string;
  position: number;
  delta: number;
  duration: number;
  eventType?: 'checkpoint' | 'play' | 'pause' | 'seek' | 'complete';
  completed?: boolean;
}) {
  return rpc<{ ok: boolean; reason?: string }>('vv_record_watch_checkpoint', {
    p_video_id: input.videoId,
    p_session_id: input.sessionId,
    p_event_key: input.eventKey,
    p_position: Math.max(0, Math.floor(input.position)),
    p_delta: Math.max(0, Math.floor(input.delta)),
    p_duration: Math.max(0, Math.floor(input.duration)),
    p_event_type: input.eventType ?? 'checkpoint',
    p_completed: input.completed === true,
  });
}

// ---------------------------------------------------------------------------
// İçerik üreticisi
// ---------------------------------------------------------------------------

export function loadVvCreatorPage(creatorId: string) {
  return rpc<VvCreatorPage>('vv_creator_page', { p_creator_id: creatorId });
}

export function loadVvMyVideos(limit = 30, offset = 0) {
  return rpc<VvMyVideo[]>('vv_my_videos', { p_limit: limit, p_offset: offset });
}

export function loadVvCreatorDashboard() {
  return rpc<VvCreatorDashboard>('vv_creator_dashboard');
}

export function loadVvCreatorWallet() {
  return rpc<VvWallet>('vv_creator_wallet');
}

export function loadVvVideoAnalytics(videoId: string) {
  return rpc<VvVideoAnalytics>('vv_video_analytics_detail', { p_video_id: videoId });
}

export function saveVvCreatorProfile(input: VvCreatorProfileInput) {
  return rpc<{ ok: boolean }>('vv_creator_profile_upsert', {
    p_display_name: input.displayName,
    p_headline: input.headline,
    p_about: input.about,
    p_cover_url: input.coverUrl,
  });
}

export function createVvVideo(input: VvVideoCreateInput) {
  return rpc<string>('vv_create_video', {
    p_title: input.title,
    p_description: input.description,
    p_category: input.categoryId,
    p_tags: input.tags,
    p_visibility: input.visibility,
    p_provider_asset_id: input.providerAssetId,
    p_duration: input.durationSeconds,
  });
}

export function updateVvVideo(
  videoId: string,
  input: Omit<VvVideoCreateInput, 'providerAssetId' | 'durationSeconds'>,
) {
  return rpc<void>('vv_update_video', {
    p_video_id: videoId,
    p_title: input.title,
    p_description: input.description,
    p_category: input.categoryId,
    p_tags: input.tags,
    p_visibility: input.visibility,
  });
}

export function setVvVideoThumbnail(videoId: string, thumbnailUrl: string) {
  return rpc<{ ok: boolean; reason?: string }>('vv_set_video_thumbnail', {
    p_video_id: videoId,
    p_thumbnail_url: thumbnailUrl,
  });
}

export function publishVvVideo(videoId: string) {
  return rpc<{ id: string; status: VvVisibility | string }>('vv_publish_video', {
    p_video_id: videoId,
  });
}

export function removeVvVideo(videoId: string, reason?: string | null) {
  return rpc<void>('vv_remove_own_video', {
    p_video_id: videoId,
    p_reason: reason ?? null,
  });
}

/**
 * Videoyu kalıcı olarak siler: sağlayıcıdaki (Cloudflare Stream / Mux) varlık ve
 * veritabanı kaydı kaldırılır. Edge Function henüz kullanılamıyorsa video en azından
 * yayından kaldırılır.
 */
export async function deleteVvVideo(
  videoId: string,
  reason?: string | null,
): Promise<{ data: VvVideoDeleteResult | null; error: string | null }> {
  const result = await invoke<VvVideoDeleteResult>(
    'vv-delete-video',
    { videoId, reason: reason ?? null },
    'Video silinemedi. Lütfen tekrar dene.',
  );
  if (!result.error) return result;

  const fallback = await removeVvVideo(videoId, reason ?? 'İçerik üreticisi sildi');
  if (fallback.error) {
    return { data: null, error: result.error || fallback.error };
  }
  return {
    data: { ok: true, remote_deleted: false, soft_deleted: true },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Bahşiş geçmişi (gönderen + alan)
// ---------------------------------------------------------------------------

export function loadVvMyTips(role: VvTipDirection, offset = 0, limit = 30) {
  return rpc<VvMyTips>('vv_my_tips', {
    p_role: role,
    p_limit: limit,
    p_offset: offset,
  });
}

export function failVvVideo(videoId: string) {
  return rpc<void>('vv_set_video_failed', { p_video_id: videoId });
}

// ---------------------------------------------------------------------------
// Cloudflare Stream yükleme + Stripe Edge Function'ları
// ---------------------------------------------------------------------------

export function createVvStreamUpload(input: {
  videoId: string;
  mode: 'multipart' | 'resumable';
  sizeBytes?: number;
  fileName?: string;
  maxDurationSeconds?: number;
}) {
  return invoke<VvUploadTicket>(
    'vv-stream-create-upload',
    input,
    'Video yükleme sunucusuna ulaşılamadı. Lütfen tekrar dene.',
  );
}

export function syncVvStreamUpload(videoId: string) {
  return invoke<VvStreamSyncResult>(
    'vv-stream-sync-upload',
    { videoId },
    'Video durumu alınamadı. Lütfen tekrar dene.',
  );
}

export function createVvTipCheckout(input: {
  videoId?: string | null;
  creatorId?: string | null;
  amountMinor: number;
  message?: string | null;
  anonymous?: boolean;
}) {
  return invoke<VvTipCheckout>('stripe-create-video-tip', {
    videoId: input.videoId ?? null,
    creatorId: input.creatorId ?? null,
    amountMinor: input.amountMinor,
    message: input.message ?? null,
    anonymous: input.anonymous === true,
    successUrl: Linking.createURL(
      input.videoId ? `vora-video/watch/${input.videoId}` : `vora-video/creator/${input.creatorId}`,
    ),
    cancelUrl: Linking.createURL(input.videoId ? `vora-video/watch/${input.videoId}` : 'vora-video'),
  });
}

/**
 * Stripe Checkout sayfasını açar. Ödeme yalnızca dönen `url` varsa başlatılır;
 * istemci hiçbir tutarı veya komisyonu kendi hesaplamaz.
 */
export async function openVvTipCheckout(input: {
  videoId?: string | null;
  creatorId?: string | null;
  amountMinor: number;
  message?: string | null;
  anonymous?: boolean;
}): Promise<{ error: string | null; tipId: string | null }> {
  const created = await createVvTipCheckout(input);
  if (created.error) return { error: created.error, tipId: null };
  if (!created.data?.url) return { error: 'Ödeme sayfası oluşturulamadı.', tipId: null };
  const successUrl = Linking.createURL(
    input.videoId ? `vora-video/watch/${input.videoId}` : `vora-video/creator/${input.creatorId}`,
  );
  try {
    await WebBrowser.openAuthSessionAsync(created.data.url, successUrl);
  } catch {
    await openUrl(created.data.url);
  }
  return { error: null, tipId: created.data.tip_id };
}

export function startVvConnectOnboarding(input?: {
  returnUrl?: string;
  refreshUrl?: string;
  country?: string;
}) {
  return invoke<VvConnectResult>('stripe-connect-video-creator', {
    action: 'start',
    returnUrl: input?.returnUrl ?? Linking.createURL('vora-video/wallet'),
    refreshUrl: input?.refreshUrl ?? Linking.createURL('vora-video/wallet'),
    country: input?.country,
  });
}

export function syncVvConnectStatus() {
  return invoke<VvConnectResult>('stripe-connect-video-creator', { action: 'status' });
}

// ---------------------------------------------------------------------------
// Ana feed tanıtım kartı
// ---------------------------------------------------------------------------

export function loadVvFeedPromoCandidates(limit = 3) {
  return rpc<VvFeedPromo[]>('vv_feed_promo_candidates', { p_limit: limit });
}

export function trackVvFeedPromo(promoId: string, kind: 'impression' | 'click') {
  return rpc<{ ok: boolean; reason?: string; kind?: string }>('vv_track_feed_promo', {
    p_promo_id: promoId,
    p_kind: kind,
  });
}

// ---------------------------------------------------------------------------
// Kategoriler
// ---------------------------------------------------------------------------

export function loadVvCategories() {
  return rpc<VvCategoryRow[]>('vv_list_categories');
}

export function adminListVvCategories() {
  return rpc<VvAdminCategoryRow[]>('vv_admin_list_categories');
}

export function adminUpsertVvCategory(input: {
  id: string;
  label: string;
  description?: string | null;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return rpc<{ ok: boolean; id: string; created: boolean }>('vv_admin_upsert_category', {
    p_id: input.id,
    p_label: input.label,
    p_description: input.description ?? null,
    p_icon: input.icon ?? 'film-outline',
    p_sort_order: input.sortOrder ?? 100,
    p_is_active: input.isActive ?? true,
  });
}

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export function adminListVvVideos(input?: { query?: string; status?: string; offset?: number }) {
  return rpc<VvAdminVideoRow[]>('vv_admin_list_videos', {
    p_query: input?.query ?? null,
    p_status: input?.status ?? null,
    p_limit: 30,
    p_offset: input?.offset ?? 0,
  });
}

export function adminTakeDownVvVideo(videoId: string, reason: string) {
  return rpc<{ ok: boolean; reason?: string }>('vv_admin_take_down_video', {
    p_video_id: videoId,
    p_reason: reason,
  });
}

export function adminListVvPromotions() {
  return rpc<VvFeedPromotion[]>('vv_admin_list_feed_promotions', { p_limit: 50 });
}

export function adminUpsertVvPromotion(input: {
  promoId?: string | null;
  videoId?: string | null;
  status?: 'draft' | 'active' | 'paused' | 'ended';
  headline?: string | null;
  weight?: number;
  dailyCapPerUser?: number | null;
  cooldownHours?: number | null;
}) {
  return rpc<{ ok: boolean; promo_id?: string; reason?: string }>(
    'vv_admin_upsert_feed_promotion',
    {
      p_promo_id: input.promoId ?? null,
      p_video_id: input.videoId ?? null,
      p_status: input.status ?? 'active',
      p_headline: input.headline ?? null,
      p_weight: input.weight ?? 100,
      p_daily_cap_per_user: input.dailyCapPerUser ?? null,
      p_cooldown_hours: input.cooldownHours ?? null,
      p_start_at: null,
      p_end_at: null,
    },
  );
}

export function adminListVvCreators(query?: string) {
  return rpc<VvAdminCreatorRow[]>('vv_admin_list_creators', {
    p_query: query ?? null,
    p_limit: 50,
    p_offset: 0,
  });
}

export function adminSetVvCreatorFlags(input: {
  userId: string;
  isVerified?: boolean;
  isActive?: boolean;
}) {
  return rpc<{ ok: boolean; reason?: string }>('vv_admin_set_creator_flags', {
    p_user_id: input.userId,
    p_is_verified: input.isVerified ?? null,
    p_is_active: input.isActive ?? null,
  });
}

export function adminListVvPayoutPeriods() {
  return rpc<VvAdminPayoutPeriod[]>('vv_admin_payout_periods', { p_limit: 12 });
}

export function adminListVvPayouts(status?: VvPayoutStatus | null) {
  return rpc<VvAdminPayoutRow[]>('vv_admin_list_payouts', {
    p_status: status ?? null,
    p_limit: 50,
  });
}

export function adminReviewVvPayout(
  payoutId: string,
  action: 'hold' | 'release' | 'fail' | 'reverse',
  reason: string,
) {
  return rpc<{ ok: boolean; reason?: string }>('vv_admin_review_payout', {
    p_payout_id: payoutId,
    p_action: action,
    p_reason: reason,
  });
}

export function adminVvFinanceOverview() {
  return rpc<VvAdminFinanceOverview>('vv_admin_finance_overview');
}

export function adminUpdateVvSettings(input: {
  commissionBp?: number;
  tipPresetsMinor?: number[];
  minTipMinor?: number;
  maxTipMinor?: number;
  paymentsEnabled?: boolean;
  processorFeeBearer?: 'platform' | 'creator' | 'split';
  payoutMinMinor?: number;
  feedPromoEnabled?: boolean;
  feedPromoInterval?: number;
  feedPromoMaxPerFeed?: number;
  promoDailyCapPerUser?: number;
  promoCooldownHours?: number;
}) {
  return rpc<{ ok: boolean }>('vv_admin_update_settings', {
    p_commission_bp: input.commissionBp ?? null,
    p_tip_presets_minor: input.tipPresetsMinor ?? null,
    p_min_tip_minor: input.minTipMinor ?? null,
    p_max_tip_minor: input.maxTipMinor ?? null,
    p_payments_enabled: input.paymentsEnabled ?? null,
    p_processor_fee_bearer: input.processorFeeBearer ?? null,
    p_payout_min_minor: input.payoutMinMinor ?? null,
    p_feed_promo_enabled: input.feedPromoEnabled ?? null,
    p_feed_promo_interval: input.feedPromoInterval ?? null,
    p_feed_promo_max_per_feed: input.feedPromoMaxPerFeed ?? null,
    p_promo_daily_cap_per_user: input.promoDailyCapPerUser ?? null,
    p_promo_cooldown_hours: input.promoCooldownHours ?? null,
  });
}
