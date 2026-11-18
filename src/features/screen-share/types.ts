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
};

export type ScreenShareTokenResponse = {
  token: string;
  url: string;
  roomName: string;
  canPublish: boolean;
  isHost: boolean;
};
