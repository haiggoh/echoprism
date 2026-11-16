import { describe, it, expect } from 'vitest';
// @ts-expect-error the repo does not ship @types/node (see seed-script.test.ts)
import fs from 'node:fs';
// @ts-expect-error the repo does not ship @types/node
import path from 'node:path';

/**
 * Task 1 (2026-11-16-followups-plan, M1 validator finding): nothing committed
 * previously verified the fixture BYTES — a missing segment ladder or a wrong
 * variant path would have been masked by the fallback.mp4 in the e2e specs.
 * These tests pin the fixture layout on disk so that class of defect goes red.
 */
const root = path.resolve(
// @ts-expect-error the repo does not ship @types/node
  process.cwd(),
  'e2e/fixtures/hls',
);

interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

const walk = (d: string): number => {
  const entries = fs.readdirSync(d, { withFileTypes: true }) as DirEntry[];
  let n = 0;
  for (const e of entries) {
    n += e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size;
  }
  return n;
};

describe('e2e HLS fixtures (e2e/fixtures/hls)', () => {
  it('master.m3u8 lists exactly the 180p and 360p rungs, each resolving to an existing VOD playlist with existing segments', () => {
    const master = fs.readFileSync(path.join(root, 'master.m3u8'), 'utf8') as string;
    const rungs = [...master.matchAll(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x(\d+)[^\n]*\n([^\n#]+)/g)];
    expect(rungs.map((m) => [Number(m[1]), m[2].trim()])).toEqual([
      [180, 'v180/playlist.m3u8'],
      [360, 'v360/playlist.m3u8'],
    ]);
    for (const rung of rungs) {
      const rel = rung[2].trim();
      const pl = fs.readFileSync(path.join(root, rel), 'utf8') as string;
      expect(pl).toContain('#EXT-X-ENDLIST'); // VOD, not live
      const segs = [...pl.matchAll(/^([^\n#][^\n]*\.ts)$/gm)].map((m) => m[1]);
      expect(segs.length).toBeGreaterThanOrEqual(2);
      for (const seg of segs) {
        const segPath = path.join(root, path.dirname(rel), seg);
        expect(fs.existsSync(segPath), `segment ${seg} of ${rel} must exist`).toBe(true);
        expect(fs.statSync(segPath).size).toBeGreaterThan(1000); // not a stub
      }
    }
  });

  it('audio/media.m3u8 exists with existing aac segments (Task 2a audio-only rendition)', () => {
    const pl = fs.readFileSync(path.join(root, 'audio/media.m3u8'), 'utf8') as string;
    expect(pl).toContain('#EXT-X-ENDLIST');
    const segs = [...pl.matchAll(/^([^\n#][^\n]*\.ts)$/gm)].map((m) => m[1]);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const seg of segs) {
      expect(fs.existsSync(path.join(root, 'audio', seg)), `audio segment ${seg} must exist`).toBe(true);
    }
    const fb = fs.readFileSync(path.join(root, 'audio-fallback.m4a')) as unknown as { length: number; subarray(s: number, e: number): { toString(enc: string): string } };
    expect(fb.length).toBeGreaterThan(1000);
    expect(fb.subarray(4, 8).toString('latin1')).toBe('ftyp');
  });

  it('fallback.mp4 exists and is a real mp4 (ftyp box)', () => {
    const buf = fs.readFileSync(path.join(root, 'fallback.mp4')) as unknown as {
      length: number;
      subarray(start: number, end: number): { toString(encoding: string): string };
    };
    expect(buf.length).toBeGreaterThan(10_000);
    expect(buf.subarray(4, 8).toString('latin1')).toBe('ftyp');
  });

  it('total fixture size stays under the 300 KB plan budget', () => {
    expect(walk(root)).toBeLessThan(300 * 1024);
  });
});
