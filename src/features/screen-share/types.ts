export type ScreenSharePreviewMember = {
  userId: string;
  username: string;
  avatarUrl: string | null;
};

export type ScreenShareSession = {
  id: string;
  joinCode: string;
  livekitRoomName: string;
  hostUserId: string;
  title: string;
  status: 'live' | 'ended';
  participantCount: number;
  createdAt: string;
  endedAt: string | null;
  hasPassword: boolean;
  isHost?: boolean;
  /** Hub kartında altta gösterilen 2–3 üye önizlemesi */
  previewMembers?: ScreenSharePreviewMember[];
  /** Host’un eklediği kapak; yoksa host avatarı kullanılır */
  coverImageUrl?: string | null;
  hostAvatarUrl?: string | null;
  hostUsername?: string | null;
};

export type ScreenShareParticipant = {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  isOnline: boolean;
  joinedAt: string;
  kickedAt: string | null;
};

export type ScreenShareJoinRequest = {
  id: string;
  requesterId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
};

export type ScreenShareTokenResponse = {
  token: string;
  url: string;
  roomName: string;
  canPublish: boolean;
  isHost: boolean;
};
