import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { episodeCommands } from '../../hooks/useTauriCommands';
import { usePlayer } from '../PlayerProvider';
import { Episode } from '../../types';

/**
 * The video/artwork STAGE plus the title/channel line. Since parity audit
 * batch 3 (owner, 2026-11-02: "only one main play bar at the bottom") every
 * transport control lives in the bottom bar (MiniPlayer).
 */
export function PlayerScreen() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { playbackFormat, currentEpisode, load, registerVideoElement } = usePlayer();

  useEffect(() => {
    if (episodeId) {
      loadEpisode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadEpisode changes identity every render; the effect must run only when episodeId changes
  }, [episodeId]);

  const loadEpisode = async () => {
    if (!episodeId) return;
    setIsLoading(true);
    try {
      const data = await episodeCommands.get(episodeId);
      setEpisode(data);
    } catch (error) {
      console.error('Failed to load episode:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // One bar: opening /player/:id with NOTHING loaded puts that episode in the
  // bar, paused — otherwise the stage would show an episode the transport
  // knows nothing about. An engine that already has an episode is left alone
  // (the user navigated here to watch what is playing).
  useEffect(() => {
    if (episode && !currentEpisode) load(episode, { paused: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated per render; react only to the fetched episode
  }, [episode]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="convergence-loader" role="status" aria-label="Loading player">
          <div className="convergence-loader-beams" />
          <div className="convergence-loader-prism" />
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-text mb-2">Episode not found</h2>
          <p className="text-text-muted">The episode could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    // pb-[76px]: the fixed bottom bar is 64px + its seek strip; the stage
    // must never sit underneath it (Review Focus 5).
    <div className="h-screen flex flex-col bg-bg pb-[76px]" data-testid="player-screen">
      {/* Video Player Area */}
      {/* A testid here is what makes the video stage assertable: jsdom does not
          lay out, so "does the video fit the window" can only be pinned as a
          contract on the element. */}
      <div className="relative bg-black flex-1 min-h-0 overflow-hidden" data-testid="video-stage">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="convergence-loader" role="status">
              <div className="convergence-loader-beams" />
              <div className="convergence-loader-prism" />
            </div>
          </div>
        ) : (
          <>
            {/* Render follows the ENGINE's format (what is actually playing —
                D7 chain mode included), not the user's audio-only preference:
                a video rule under an audio-on toggle still shows picture. The
                toggle reaches this through setAudioMode, which updates both. */}
            {playbackFormat === 'video' ? (
              <video
                ref={registerVideoElement}
                title="video-surface"
                className="absolute inset-0 h-full w-full object-contain bg-black"
                poster={episode.thumbnail_url}
                playsInline
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                <div className="w-24 h-24 mb-4 bg-gradient-to-br from-stream-video to-stream-audio rounded-2xl flex items-center justify-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7c0-2.21-1.79-4-4-4H2v2h2v10.55c0 3.87 3.13 7 7 7 1.1 0 2.1-.3 2.8-.86l2.14 2.14 1.41-1.41-2.14-2.14C17.25 12.81 18 10.79 18 8.5c0-2.76-2.24-5-5-5H5.53l3.53-3.53 1.41-1.41L1.82 2.22 3.23 3.64l3.53 3.53 1.41-1.41-3.53-3.53A9.01 9.01 0 0112 2c-4.97 0-9 4.03-9 9s4.03 9 9 9c4.6 0 8.51-3.48 8.84-8H12V3zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1.5-9c0 .83-.67 1.5-1.5 1.5S12 13.83 12 13s.67 1.5 1.5 1.5S15 13.83 15 13s-.67-1.5-1.5-1.5z"></path>
                  </svg>
                </div>
                <p className="text-sm text-text-muted">Audio mode — playback continues in the mini player</p>
              </div>
            )}

          </>
        )}
      </div>

      {/* Title block — 2c: the player never showed which episode is
          playing. line-clamp-2 wraps long real titles onto two lines; the
          channel line truncates. */}
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold text-text line-clamp-2">{episode.title}</h1>
        {/* Live-test batch 2 Task 8: "I should be able to click on the channel
            name when watching one of their videos." This was plain text. Batch 1
            shipped /channels/:id and the channel screen, so it is a link now —
            and the channel screen is where subscribing lives, which is how the
            owner reaches a channel they do not follow yet. */}
        {episode.channel?.title && (
          <p className="text-sm text-text-muted truncate mt-0.5">
            <button
              type="button"
              className="hover:text-text hover:underline transition-colors"
              aria-label={episode.channel.title}
              onClick={() => {
                const channelId = episode.channel?.id;
                // A channel object without an id (e.g. its row was deleted)
                // must not navigate to /channels/undefined.
                if (channelId) navigate(`/channels/${channelId}`);
              }}
            >
              {episode.channel.title}
            </button>
          </p>
        )}
      </div>

      {/* Parity audit batch 3 (owner, 2026-11-02): "we need only one main
          play bar at the bottom." The transport that stood here — timeline,
          prev/play/next/restart/repeat, shuffle, mute, speed, volume,
          fullscreen, PiP, audio-only — is the bottom bar (MiniPlayer) now. */}
    </div>
  );
}
