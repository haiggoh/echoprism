// @vitest-environment jsdom
/**
 * Task 5: the embed player component — commands are posted to the
 * proxy-origin iframe, and only messages FROM that iframe are dispatched.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { YoutubeEmbedPlayer, type EmbedPlayerApi } from '../components/player/YoutubeEmbedPlayer';
import { embedUrl, EMBED_ERROR_FALLBACK_CODES } from '../lib/embedPlayerProtocol';

describe('Task 5 embed player component', () => {
  it('posts commands to the proxy-origin iframe and dispatches only its messages', () => {
    let api: EmbedPlayerApi | null = null;
    const onEvent = vi.fn();
    const { container } = render(
      <YoutubeEmbedPlayer port={4321} onEvent={onEvent} registerApi={(a) => { api = a; }} />,
    );
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.src).toBe(embedUrl(4321));
    expect(iframe.src).toContain('http://127.0.0.1:4321/embed/player.html');

    const posted: unknown[] = [];
    vi.spyOn(iframe.contentWindow as unknown as Window, 'postMessage').mockImplementation((msg: unknown) => {
      posted.push(msg);
    });

    // commands are QUEUED until the host page posts `ready` (a postMessage sent
    // before the iframe's listener attaches is lost)
    const a = api as EmbedPlayerApi | null;
    if (!a) throw new Error('registerApi was not called');
    act(() => {
      a.load('abc', true);
    });
    expect(posted, 'nothing is posted before ready').toEqual([]);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'ready' }, source: iframe.contentWindow }),
      );
    });
    expect(posted).toEqual([{ cmd: 'load', videoId: 'abc', autoplay: true }]);
    act(() => {
      a.play();
      a.pause();
      a.seek(12);
    });
    expect(posted).toEqual([
      { cmd: 'load', videoId: 'abc', autoplay: true },
      { cmd: 'play' },
      { cmd: 'pause' },
      { cmd: 'seek', t: 12 },
    ]);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'state', state: 1 }, source: iframe.contentWindow }),
      );
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'state', state: 1 });

    onEvent.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'error', code: 150 } }));
    });
    expect(onEvent, 'a message from another frame must be ignored').not.toHaveBeenCalled();
    expect(EMBED_ERROR_FALLBACK_CODES).toContain(150);
  });
});
