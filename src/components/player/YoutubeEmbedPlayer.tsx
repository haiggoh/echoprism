import { useEffect, useRef } from 'react';
import { embedUrl, sendCommand, isEmbedEvent, type EmbedEvent } from '../../lib/embedPlayerProtocol';

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
 */
export function YoutubeEmbedPlayer({ port, onEvent, registerApi }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (isEmbedEvent(ev.data)) onEvent(ev.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onEvent]);

  useEffect(() => {
    registerApi({
      load: (videoId, autoplay) => sendCommand(iframeRef.current, { cmd: 'load', videoId, autoplay }, port),
      play: () => sendCommand(iframeRef.current, { cmd: 'play' }, port),
      pause: () => sendCommand(iframeRef.current, { cmd: 'pause' }, port),
      seek: (t) => sendCommand(iframeRef.current, { cmd: 'seek', t }, port),
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
