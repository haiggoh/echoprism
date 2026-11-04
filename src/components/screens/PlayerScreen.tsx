import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { episodeCommands } from '../../hooks/useTauriCommands';
import { usePlayer } from '../PlayerProvider';
import { Episode } from '../../types';
import { Thumbnail } from '../ui/Thumbnail';
import { HeadphonesIcon } from '../ui/HeadphonesIcon';

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
  // Batch 4 items 3+4: the artwork shown in audio-only mode — the episode's own
  // art, else the channel's (podcast cover or YouTube channel avatar).
  const art = episode?.thumbnail_url ?? episode?.channel?.thumbnail_url;
  // Owner 2026-11-04 round 3: audio-only is a NO-OP for episodes without video
  // — a podcast is audio regardless of the toggle, so the stage must render
  // identically either way (previously the toggle flipped podcast playback
  // between the empty <video> branch and the art stage).
  const hasVideo = !!episode?.video_id || !!episode?.video_url;
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
            {playbackFormat === 'video' && hasVideo ? (
              <video
                ref={registerVideoElement}
                title="video-surface"
                className="absolute inset-0 h-full w-full object-contain bg-black"
                poster={episode.thumbnail_url}
                preload="metadata"
                playsInline
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                {/* Batch 4 items 3+4 (owner 2026-11-02): audio-only means NO
                    VIDEO, not no images — show the episode's cover art (podcast
                    itunes image, or the YouTube thumbnail for a video); only fall
                    back to the headphones mark when there is no art at all. */}
                {art ? (
                  // Owner 2026-11-03: full-sized art on the audio stage — 16:9
                  // for YouTube videos; square podcast covers keep their shape
                  // (2026-11-04: object-cover would crop them to 16:9).
                  <Thumbnail
                    src={art}
                    alt=""
                    className={
                      hasVideo
                        ? 'w-full max-w-2xl aspect-video rounded-2xl object-cover'
                        : 'w-full max-w-md aspect-square rounded-2xl object-cover'
                    }
                  />
                ) : (
                  <div className="w-24 h-24 mb-4 bg-gradient-to-br from-stream-video to-stream-audio rounded-2xl flex items-center justify-center">
                    <HeadphonesIcon size={48} className="text-white" data-testid="audio-stage-headphones" />
                  </div>
                )}
                <p className="text-sm text-text-muted mt-4">Audio only{art ? ' — cover art shown' : ' — playback continues in the mini player'}</p>
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
