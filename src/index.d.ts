export interface PlaybackState {
  visible: boolean; hidden: boolean; reducedMotion: boolean;
  saveData: boolean; userPaused: boolean; blocked: boolean;
}
export interface Controller {
  pause(): void; resume(): void;
  setBlocked(key: unknown, blocked: boolean): void;
  getState(): PlaybackState;
  destroy(): void;
}
export interface Environment {
  document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  matchMedia(query: string): MediaQueryList;
  connection?: EventTarget & { saveData?: boolean };
  IntersectionObserver?: typeof IntersectionObserver;
}
export function shouldPlay(state: PlaybackState): boolean;
export function createMediaController(video: HTMLVideoElement, options: {
  src: string; environment?: Environment; rootMargin?: string;
  threshold?: number; onError?: (error: unknown) => void;
}): Controller;
export function bindForegroundPause(background: Controller, videos: Iterable<HTMLVideoElement>): () => void;
