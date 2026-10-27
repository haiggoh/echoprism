import type { CrashRecord } from '../types';

/** The repo crash issues are filed against (owner-approved remote,
 *  Phase H). One constant; the triage Action matches the `crash:` prefix. */
export const ECHOPRISM_REPO = 'haiggoh/echoprism';

/**
 * The prefilled GitHub issue for one crash capture (4f): the signature in
 * the title is what the scheduled triage Action groups duplicates by. The
 * report itself is already sanitized backend-side (no home paths, no
 * usernames) — this only shapes it into an issue.
 */
export function crashIssueUrl(record: CrashRecord): string {
  const title = `crash: ${record.kind} ${record.signature}`;
  const body = [
    `**Kind:** ${record.kind}`,
    `**Signature:** \`${record.signature}\``,
    `**App version:** ${record.app_version}`,
    `**When:** ${record.at}`,
    '',
    '```',
    record.message,
    '```',
  ].join('\n');
  return `https://github.com/${ECHOPRISM_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
