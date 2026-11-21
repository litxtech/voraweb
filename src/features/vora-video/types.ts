export type VvVideoStatus =
  | 'draft'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'published'
  | 'failed'
  | 'removed';

export type VvVisibility = 'public' | 'unlisted' | 'private';

export type VvTipStatus =
  | 'pending'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export type VvPayoutStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'held' | 'reversed';

export type VvTipDirection = 'sent' | 'received';

/** Bahşiş geçmişi satırı — hem gönderen hem alan taraf için ortak şekil. */
export type VvTipHistoryRow = {
  id: string;
  direction: VvTipDirection;
  status: VvTipStatus;
  video_id: string | null;
  video_title: string | null;
  thumbnail_url: string | null;
  message: string | null;
  anonymous: boolean;
  gross_minor: number;
  currency: string;
  commission_minor: number;
  creator_share_minor: number;
  creator_net_minor: number;
  processor_fee_minor: number | null;
  refunded_minor: number;
  created_at: string;
  succeeded_at: string | null;
  settled_at: string | null;
  sender_username: string | null;
  sender_full_name: string | null;
  sender_avatar_url: string | null;
  creator_username: string | null;
  creator_full_name: string | null;
  creator_avatar_url: string | null;
};

export type VvTipSummary = {
  count: number;
  succeeded_count: number;
  pending_count: number;
  gross_minor: number;
  creator_net_minor: number;
  commission_minor: number;
  refunded_minor: number;
  currency: string;
};

export type VvMyTips = {
  ok: boolean;
  role: VvTipDirection;
  summary: VvTipSummary;
  rows: VvTipHistoryRow[];
};

export type VvVideoDeleteResult = {
  ok: boolean;
  remote_deleted?: boolean;
  already_deleted?: boolean;
  was_published?: boolean;
  provider?: string | null;
  soft_deleted?: boolean;
};

export type VvVideoCard = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  view_count: number;
  unique_viewer_count?: number;
  like_count: number;
  comment_count: number;
  bookmark_count?: number;
  share_count?: number;
  tip_total_minor: number;
  published_at: string | null;
  created_at?: string;
  status?: VvVideoStatus;
  visibility?: VvVisibility;
  category_id: string | null;
  category_label: string | null;
  creator_id: string;
  creator_username: string;
  creator_full_name: string | null;
  creator_avatar_url: string | null;
  creator_is_verified: boolean;
  creator_follower_count?: number;
  creator_headline?: string | null;
  is_liked: boolean;
  is_bookmarked: boolean;
  is_following?: boolean;
  my_progress_seconds?: number | null;
  progress_seconds?: number | null;
  last_watched_at?: string | null;
  score?: number;
};

export type VvWatchDetail = VvVideoCard & {
  tags: string[];
  playback_id: string | null;
  provider: string;
  creator_about: string | null;
  creator_video_count: number;
  is_watch_later: boolean;
  is_owner: boolean;
  resume_seconds: number | null;
};

export type VvComment = {
  id: string;
  video_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  author_id: string;
  author_username: string;
  author_full_name: string | null;
  author_avatar_url: string | null;
  author_is_verified: boolean;
  is_liked: boolean;
  reply_count: number;
  is_mine: boolean;
};

export type VvBookmarkCollection = 'saved' | 'watch_later';

export type VvSettings = {
  commission_bp: number;
  creator_share_bp: number;
  tip_presets_minor: number[];
  min_tip_minor: number;
  max_tip_minor: number;
  currency: string;
  processor_fee_bearer: 'platform' | 'creator' | 'split';
  payments_enabled: boolean;
  feed_promo_enabled: boolean;
  feed_promo_interval: number;
  feed_promo_max_per_feed: number;
  payout_min_minor: number;
};

export type VvMyVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: VvVideoStatus;
  visibility: VvVisibility;
  view_count: number;
  like_count: number;
  comment_count: number;
  tip_total_minor: number;
  published_at: string | null;
  created_at: string;
  category_id: string | null;
  category_label: string | null;
};

export type VvCreatorPage = {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  headline: string | null;
  about: string | null;
  is_verified: boolean;
  follower_count: number;
  video_count: number;
  total_views: number;
  total_tips_minor: number;
  is_following: boolean;
  is_me: boolean;
};

export type VvPayoutHistoryRow = {
  id: string;
  amount_minor: number;
  currency: string;
  status: VvPayoutStatus;
  period_start: string;
  period_end: string;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
  held_reason: string | null;
  processed_at: string | null;
  created_at: string;
};

export type VvWallet = {
  creator_id: string;
  currency: string;
  lifetime_gross_minor: number;
  lifetime_commission_minor: number;
  lifetime_creator_minor: number;
  lifetime_fee_minor: number;
  tip_count: number;
  pending_minor: number;
  available_minor: number;
  paid_minor: number;
  held_minor: number;
  next_period_start: string;
  next_period_end: string;
  next_payout_at: string;
  stripe_status: 'not_connected' | 'onboarding_incomplete' | 'ready' | 'rejected';
  stripe_onboarding_status: string | null;
  stripe_payouts_enabled: boolean;
  stripe_requirements_due: Record<string, unknown>;
  payout_history: VvPayoutHistoryRow[];
};

export type VvDashboardVideoRow = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds?: number | null;
  status?: VvVideoStatus;
  view_count: number;
  like_count?: number;
  comment_count?: number;
  tip_total_minor?: number;
  published_at: string | null;
  created_at?: string;
};

export type VvCreatorDashboard = {
  video_count: number;
  published_count: number;
  total_views: number;
  unique_viewers: number;
  watch_seconds: number;
  likes: number;
  comments: number;
  follower_count: number;
  tips_gross_minor: number;
  pending_minor: number;
  available_minor: number;
  paid_minor: number;
  next_period_start: string;
  next_period_end: string;
  next_payout_at: string;
  top_videos: VvDashboardVideoRow[];
  recent_videos: VvDashboardVideoRow[];
};

export type VvRetentionBucket = { bucket: number; viewers: number };
export type VvDailyViews = { day: string; views: number };

export type VvVideoAnalytics = {
  video: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    status: VvVideoStatus;
    visibility: VvVisibility;
    published_at: string | null;
    view_count: number;
    like_count: number;
    comment_count: number;
    share_count: number;
    tip_total_minor: number;
  };
  metrics: {
    total_views: number;
    unique_viewers: number;
    watch_seconds: number;
    avg_watch_seconds: number;
    avg_watch_percent: number;
    completed_views: number;
    completion_rate: number;
    rewatch_count: number;
    likes: number;
    comments: number;
    shares: number;
    tips_minor: number;
  };
  retention: VvRetentionBucket[];
  daily: VvDailyViews[];
};

export type VvFeedPromo = {
  promo_id: string;
  badge_text: string | null;
  headline: string | null;
  video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  view_count: number;
  published_at: string | null;
  creator_id: string;
  creator_username: string;
  creator_full_name: string | null;
  creator_avatar_url: string | null;
  creator_is_verified: boolean;
  category_id: string | null;
  category_label: string | null;
};

export type VvTipPrepare = {
  ok: boolean;
  reason?: string;
  tip_id?: string;
  creator_id?: string;
  video_id?: string | null;
  gross_minor?: number;
  commission_bp?: number;
  commission_minor?: number;
  creator_share_minor?: number;
  currency?: string;
  status?: VvTipStatus;
  min_tip_minor?: number;
  max_tip_minor?: number;
};

export type VvTipCheckout = {
  ok: boolean;
  tip_id: string;
  session_id: string;
  url: string;
  gross_minor: number;
  commission_minor: number;
  creator_share_minor: number;
  currency: string;
};

export type VvUploadTicket = {
  ok: boolean;
  mode: 'multipart' | 'resumable' | 'put';
  uploadUrl: string;
  /** Mux için `PUT`, Cloudflare için `POST` kullanılır */
  uploadMethod?: 'POST' | 'PUT';
  uploadId?: string;
  streamUid: string;
  maxDurationSeconds: number;
  provider?: string;
  tus?: Record<string, string>;
};

export type VvStreamSyncResult = {
  ok: boolean;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  playbackId?: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  reason?: string;
  state?: string;
  provider?: string;
};

export type VvConnectResult = {
  ok: boolean;
  connected: boolean;
  status?: string;
  account_id?: string;
  onboarding_url?: string;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements_due?: Record<string, unknown>;
};

export type VvCreatorProfileInput = {
  displayName: string;
  headline: string;
  about: string;
  coverUrl: string | null;
};

export type VvVideoCreateInput = {
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  visibility: VvVisibility;
  providerAssetId: string | null;
  durationSeconds: number | null;
};

export type VvAdminVideoRow = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  status: VvVideoStatus;
  visibility: VvVisibility;
  feed_eligible: boolean;
  duration_seconds: number | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  tip_total_minor: number;
  category_id: string | null;
  category_label: string | null;
  creator_id: string;
  creator_username: string;
  creator_full_name: string | null;
  creator_avatar_url: string | null;
  published_at: string | null;
  created_at: string;
  removal_reason: string | null;
};

export type VvFeedPromotion = {
  id: string;
  video_id: string;
  video_title: string;
  thumbnail_url: string | null;
  creator_username: string;
  status: 'draft' | 'active' | 'paused' | 'ended';
  headline: string | null;
  badge_text: string | null;
  weight: number;
  daily_cap_per_user: number;
  cooldown_hours: number;
  start_at: string;
  end_at: string | null;
  impression_count: number;
  click_count: number;
  created_at: string;
};

export type VvCategoryRow = {
  id: string;
  label: string;
  description: string | null;
  icon: string;
  sort_order: number;
};

export type VvAdminCategoryRow = VvCategoryRow & {
  is_active: boolean;
  video_count: number;
};

export type VvAdminCreatorRow = {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  video_count: number;
  follower_count: number;
  total_views: number;
  total_tips_minor: number;
  pending_minor: number;
  available_minor: number;
  paid_minor: number;
  stripe_status: 'not_connected' | 'onboarding_incomplete' | 'ready' | 'rejected';
  stripe_onboarding_status: string | null;
  created_at: string;
};

export type VvAdminPayoutPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  gross_tips_minor: number;
  commission_minor: number;
  creator_share_minor: number;
  processor_fee_minor: number;
  refunded_minor: number;
  disputed_minor: number;
  transferred_minor: number;
  payout_count: number;
  tip_count: number;
  reconciled_at: string | null;
  processed_at: string | null;
};

export type VvAdminPayoutRow = {
  id: string;
  creator_id: string;
  creator_username?: string;
  creator_full_name?: string | null;
  amount_minor: number;
  currency: string;
  status: VvPayoutStatus;
  period_start: string;
  period_end: string;
  stripe_account_id?: string | null;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
  held_reason: string | null;
  attempts?: number;
  processed_at: string | null;
  created_at: string;
};

export type VvAdminFinanceOverview = {
  tips_gross_minor: number;
  commission_minor: number;
  creator_share_minor: number;
  processor_fee_minor: number;
  refunded_minor: number;
  disputed_minor: number;
  tip_count: number;
  pending_minor: number;
  available_minor: number;
  paid_minor: number;
  held_minor: number;
  creator_count: number;
  video_count: number;
  published_count: number;
  active_promo_count: number;
  current_period_start: string;
  current_period_end: string;
  next_payout_at: string;
  recent_payouts: VvAdminPayoutRow[];
  recent_periods: VvAdminPayoutPeriod[];
};
