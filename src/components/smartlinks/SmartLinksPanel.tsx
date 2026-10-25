import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { smartLinkCommands } from '../../hooks/useTauriCommands';
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
                <p className="font-mono text-sm text-text truncate">
                  {link.podcast_guid} ↔ {link.youtube_video_id}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {Math.round(link.confidence * 100)}% confidence
                  {link.user_confirmed ? ' · confirmed' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  aria-label={`Confirm link ${link.podcast_guid}`}
                  onClick={() =>
                    confirmMutation.mutate({ linkId: link.id, confirmed: !link.user_confirmed })
                  }
                >
                  {link.user_confirmed ? 'Unconfirm' : 'Confirm'}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Unlink ${link.podcast_guid}`}
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
