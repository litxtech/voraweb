import { create } from 'zustand';
import type { ScreenShareSession } from '@/features/screen-share/types';

export type ScreenSharePipToken = {
  token: string;
  url: string;
  canPublish: boolean;
  isHost: boolean;
};

type ScreenSharePipState = {
  /** Oda bağlantısı canlı (tam ekran veya küçük pencere) */
  active: boolean;
  /** Küçük pencere modu — kullanıcı uygulamada gezebilir */
  minimized: boolean;
  /** Minimize anında mik açıksa PiP’te de açık kalsın */
  micEnabled: boolean;
  session: ScreenShareSession | null;
  tokenBundle: ScreenSharePipToken | null;
  activate: (session: ScreenShareSession, token: ScreenSharePipToken) => void;
  /** Oda ekranından çıkarken tek set — küçük pencere hemen görünsün */
  activateMinimized: (
    session: ScreenShareSession,
    token: ScreenSharePipToken,
    micEnabled?: boolean,
  ) => void;
  patchSession: (next: ScreenShareSession) => void;
  setMicEnabled: (micEnabled: boolean) => void;
  minimize: () => void;
  expand: () => void;
  clear: () => void;
};

export const useScreenSharePipStore = create<ScreenSharePipState>((set) => ({
  active: false,
  minimized: false,
  micEnabled: false,
  session: null,
  tokenBundle: null,
  activate: (session, tokenBundle) =>
    set({ active: true, minimized: false, session, tokenBundle }),
  activateMinimized: (session, tokenBundle, micEnabled = false) =>
    set({ active: true, minimized: true, session, tokenBundle, micEnabled }),
  patchSession: (session) => set({ session }),
  setMicEnabled: (micEnabled) => set({ micEnabled }),
  minimize: () => set((s) => (s.active ? { minimized: true } : s)),
  expand: () => set((s) => (s.active ? { minimized: false } : s)),
  clear: () =>
    set({
      active: false,
      minimized: false,
      micEnabled: false,
      session: null,
      tokenBundle: null,
    }),
}));
