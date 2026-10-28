import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { smartLinkCommands } from '../../hooks/useTauriCommands';
import type { EpisodeLink } from '../../types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

/**
 * The real Smart Links surface — list, run the matcher, confirm/unlink pairs,
 * with the loading/error/empty states every data screen needs (2c).
 *
 * Extracted from SmartLinksScreen so BOTH surfaces render ONE implementation:
 * the `/smart-links` route and Settings > Smart Links used to be a real screen
 * beside a Settings tab that was a heading, a dead "Run Matching" button and a
 * permanent EmptyState — the 2c "static stub" defect, surviving in the one
 * place nobody re-checked. Two copies would drift the same way.
 *
 * `heading` and `showHeading` let each caller keep its own chrome: the route
 * owns a full-width app header, the Settings tab wants a compact section title.
 */
/**
 * One side of a pair. With a local episode it shows the episode's real title —
 * the owner's ask ("user-readable title"), because a guid or a video id is
 * something they cannot judge. With NO local episode it falls back to the raw
 * id in monospace + muted, so the two cases are visibly different and nothing
 * is ever invented: an absent title is honest, a fabricated one is not.
 */
function LinkSide({ title, id }: { title?: string; id: string }) {
  if (title) {
    return <span className="text-sm text-text">{title}</span>;
  }
  return (
    <span className="font-mono text-xs text-text-muted" title={id}>
      {id}
    </span>
  );
}

/**
 * The best human-readable name for a link: an episode TITLE beats an opaque
 * guid. The owner's complaint was ids a person "doesn't know how to judge" —
 * and a screen-reader user hears the row's BUTTON names rather than the
 * rendered text, so an action still labelled with the raw guid is the same
 * defect on a different surface. (Live-test Task 5 follow-up.)
 */
function linkLabel(link: EpisodeLink): string {
  return link.podcast_title ?? link.podcast_guid;
}

export function SmartLinksPanel({
  showHeading = true,
  headingLevel = 1,
}: {
  showHeading?: boolean;
  headingLevel?: 1 | 2;
}) {
  const queryClient = useQueryClient();
  const { data: links, isLoading, isError, refetch } = useQuery({
    queryKey: ['smart-links'],
    queryFn: () => smartLinkCommands.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['smart-links'] });

  const matchMutation = useMutation({
    mutationFn: () => smartLinkCommands.match(),
    onSuccess: invalidate,
  });

  const confirmMutation = useMutation({
    mutationFn: ({ linkId, confirmed }: { linkId: string; confirmed: boolean }) =>
      smartLinkCommands.confirm(linkId, confirmed),
    onSuccess: invalidate,
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => smartLinkCommands.unlink(linkId),
    onSuccess: invalidate,
  });

  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {showHeading && (
          <Heading className={headingLevel === 1 ? 'text-2xl font-semibold text-text' : 'text-lg font-semibold text-text'}>
            Smart Episode Links
          </Heading>
        )}
        <div className="flex items-center gap-3 ml-auto">
          {matchMutation.isSuccess && (
            <span className="text-sm text-text-muted" role="status">
              {matchMutation.data.matched_count} new match
              {matchMutation.data.matched_count === 1 ? '' : 'es'}
            </span>
          )}
          <Button
            variant="unified"
            onClick={() => matchMutation.mutate()}
            disabled={matchMutation.isPending}
          >
            {matchMutation.isPending ? 'Matching…' : 'Run Matching'}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-text-muted">Loading smart links…</p>}

      {isError && !isLoading && (
        <div className="text-center py-8">
          <p className="text-danger">Couldn&apos;t load smart links.</p>
          <Button variant="ghost" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && links && links.length === 0 && <EmptyState variant="smart-links" />}

      {!isLoading && !isError && links && links.length > 0 && (
        <ul className="space-y-2" aria-label="Smart links">
          {links.map((link) => (
            <li
              key={link.id}
              data-testid="smart-link-row"
              className="flex items-center justify-between gap-4 bg-surface border border-border rounded-lg px-4 py-3"
            >
              <div className="min-w-0">
                {/* Live-test Task 5: was `{podcast_guid} ↔ {youtube_video_id}`
                    — "long id strings the user doesn't know how to judge". */}
                <p className="text-sm truncate flex items-baseline gap-2 flex-wrap">
                  <LinkSide title={link.podcast_title} id={link.podcast_guid} />
                  <span className="text-text-muted" aria-hidden="true">
                    ↔
                  </span>
                  <LinkSide title={link.video_title} id={link.youtube_video_id} />
                </p>
                {(link.podcast_channel || link.video_channel) && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">
                    {[link.podcast_channel, link.video_channel].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-xs text-text-muted mt-1">
                  {Math.round(link.confidence * 100)}% confidence
                  {link.user_confirmed ? ' · confirmed' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  aria-label={`Confirm link ${linkLabel(link)}`}
                  onClick={() =>
                    confirmMutation.mutate({ linkId: link.id, confirmed: !link.user_confirmed })
                  }
                >
                  {link.user_confirmed ? 'Unconfirm' : 'Confirm'}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Unlink ${linkLabel(link)}`}
                  onClick={() => unlinkMutation.mutate(link.id)}
                >
                  Unlink
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
