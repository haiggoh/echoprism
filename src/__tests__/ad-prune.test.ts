// @vitest-environment jsdom
/**
 * Task 5 ad blocking: the json-prune of YouTube player responses. Fixture
 * shapes mirror real ytInitialPlayerResponse / /youtubei/v1/player payloads.
 */
import { describe, it, expect } from 'vitest';
import { pruneAdKeys, prunePlayerResponseJson, AD_KEYS } from '../lib/adPrune';

describe('Task 5 ad prune', () => {
  it('drops ad keys at any depth and leaves everything else untouched', () => {
    const input = {
      ytInitialPlayerResponse: {
        adPlacements: [{ adSlot: 'x' }],
        playerAds: [{ id: 1 }],
        videoDetails: { title: 'keep me', videoId: 'abc' },
        streamingData: { formats: [{ url: 'keep', adSlots: [{}] }] },
      },
      playabilityStatus: { status: 'OK' },
    };
    const out = pruneAdKeys(input) as typeof input;
    expect(out.ytInitialPlayerResponse).not.toHaveProperty('adPlacements');
    expect(out.ytInitialPlayerResponse).not.toHaveProperty('playerAds');
    expect(out.ytInitialPlayerResponse.videoDetails).toEqual({ title: 'keep me', videoId: 'abc' });
    // nested inside an array element
    expect(out.ytInitialPlayerResponse.streamingData.formats[0]).not.toHaveProperty('adSlots');
    expect(out.ytInitialPlayerResponse.streamingData.formats[0].url).toBe('keep');
    expect(out.playabilityStatus).toEqual({ status: 'OK' });
    // input not mutated
    expect(input.ytInitialPlayerResponse).toHaveProperty('adPlacements');
  });

  it('prunes a player-response JSON text; non-player JSON passes through unchanged', () => {
    const player = JSON.stringify({ ytInitialPlayerResponse: { adSlots: [1], videoDetails: { title: 't' } } });
    const pruned = prunePlayerResponseJson(player);
    expect(pruned).not.toContain('adSlots');
    expect(pruned).toContain('"title":"t"');

    const other = JSON.stringify({ hello: 'world', adPlacements: 'not-a-player-response' });
    expect(prunePlayerResponseJson(other)).toBe(other);
    expect(prunePlayerResponseJson('not json at all')).toBe('not json at all');
  });

  it('the fallback error codes stay the contract (sanity)', () => {
    expect(AD_KEYS).toEqual(['adPlacements', 'playerAds', 'adSlots']);
  });
});
