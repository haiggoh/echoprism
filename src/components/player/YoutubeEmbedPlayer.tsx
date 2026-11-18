import { useEffect, useRef } from 'react';
import { embedUrl, sendCommand, isEmbedEvent, type EmbedCommand, type EmbedEvent } from '../../lib/embedPlayerProtocol';

export interface EmbedPlayerApi {
  load: (videoId: string, autoplay: boolean) => void;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
}

interface Props {
  port: number;
  onEvent: (e: EmbedEvent) => void;
  registerApi: (api: EmbedPlayerApi | null) => void;
}

/**
 * Task 5: ONE persistent iframe hosting YouTube's IFrame player, served from
 * the app's own proxy origin (valid 127.0.0.1 referrer — §11 spike). Keeping
 * the instance mounted for the whole session is what makes a warm
 * loadVideoById ~0.46 s.
 *
 * Commands are QUEUED until the host page posts `ready` — a postMessage sent
 * before the iframe's listener attaches is silently lost (measured in e2e).
 */
export function YoutubeEmbedPlayer({ port, onEvent, registerApi }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<EmbedCommand[]>([]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (!isEmbedEvent(ev.data)) return;
      if (ev.data.type === 'ready') {
        readyRef.current = true;
        const q = queueRef.current;
        queueRef.current = [];
        for (const c of q) sendCommand(iframeRef.current, c, port);
      }
      onEvent(ev.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onEvent, port]);

  useEffect(() => {
    readyRef.current = false; // (re)loading the iframe invalidates readiness
    const send = (cmd: EmbedCommand) => {
      if (readyRef.current) sendCommand(iframeRef.current, cmd, port);
      else queueRef.current.push(cmd);
    };
    registerApi({
      load: (videoId, autoplay) => send({ cmd: 'load', videoId, autoplay }),
      play: () => send({ cmd: 'play' }),
      pause: () => send({ cmd: 'pause' }),
      seek: (t) => send({ cmd: 'seek', t }),
    });
    return () => registerApi(null);
  }, [port, registerApi]);

  return (
    <iframe
      ref={iframeRef}
      title="YouTube player"
      src={embedUrl(port)}
      className="absolute inset-0 h-full w-full bg-black"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
}
