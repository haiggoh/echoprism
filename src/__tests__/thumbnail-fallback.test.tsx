// @vitest-environment jsdom
/**
 * 2c: broken or missing thumbnails must degrade to a branded fallback, not
 * the browser's broken-image glyph. Discriminant: removing the onError swap
 * leaves the <img> in the DOM after the error event.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Thumbnail } from '../components/ui/Thumbnail';

afterEach(() => cleanup());

describe('2c: Thumbnail fallback', () => {
  it('renders the image when a src is present', () => {
    render(<Thumbnail src="https://example.org/a.jpg" alt="Episode artwork" className="w-10 h-10" />);
    const img = screen.getByAltText('Episode artwork');
    expect(img.tagName).toBe('IMG');
  });

  it('swaps to the fallback when the image fails to load', () => {
    render(<Thumbnail src="https://example.org/dead.jpg" alt="Episode artwork" className="w-10 h-10" />);
    fireEvent.error(screen.getByAltText('Episode artwork'));
    expect(screen.queryByAltText('Episode artwork')).toBeNull();
    expect(screen.getByTestId('thumbnail-fallback')).toBeTruthy();
  });

  it('renders the fallback immediately when there is no src at all', () => {
    render(<Thumbnail alt="Missing artwork" className="w-10 h-10" />);
    expect(screen.queryByAltText('Missing artwork')).toBeNull();
    expect(screen.getByTestId('thumbnail-fallback')).toBeTruthy();
  });
});
