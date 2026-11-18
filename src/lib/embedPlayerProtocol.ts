/**
 * Task 5: postMessage protocol between the app and the proxy-served YouTube
 * IFrame host page (`/embed/player.html`). Commands go app -> page; events go
 * page -> app.
 */

export type EmbedCommand =
  | { cmd: 'load'; videoId: string; autoplay: boolean }
  | { cmd: 'play' }
  | { cmd: 'pause' }
  | { cmd: 'seek'; t: number };

export type EmbedEvent =
  | { type: 'ready' }
  | { type: 'state'; state: number }
  | { type: 'error'; code: number }
  | { type: 'time'; t: number };

/** YouTube player errors that must fall back to the extractor pipeline. */
export const EMBED_ERROR_FALLBACK_CODES = [150, 101, 153, 5, 100];

export function embedUrl(port: number): string {
  return `http://127.0.0.1:${port}/embed/player.html`;
}

export function sendCommand(iframe: HTMLIFrameElement | null, cmd: EmbedCommand, port: number): void {
  iframe?.contentWindow?.postMessage(cmd, `http://127.0.0.1:${port}`);
}

export function isEmbedEvent(data: unknown): data is EmbedEvent {
  return typeof data === 'object' && data !== null && 'type' in (data as object);
}
