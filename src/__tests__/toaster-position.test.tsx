// @vitest-environment jsdom
/**
 * Batch 4 follow-up (owner 2026-11-02): "the infobox telling the user that a
 * clip has been added to the queue should not overlap with the playbar."
 * The toaster is anchored bottom-right; it must sit ABOVE the fixed mini-player
 * bar (72px, 80px on lg), not on top of it.
 *
 * Discriminant: a toaster still anchored at bottom-4 (16px) fails — it would
 * cover the bar.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Toaster, useToasts, clearToasts } from '../components/ui/Toaster';

function Probe() {
  const { addToast } = useToasts();
  return <button type="button" onClick={() => addToast({ title: 'Added to end of queue', variant: 'success' })}>toast</button>;
}

beforeEach(clearToasts);
afterEach(cleanup);

describe('toaster position (batch 4 follow-up)', () => {
  it('the toast stack is anchored above the play bar, not over it', async () => {
    const { getByText } = render(
      <>
        <Probe />
        <Toaster />
      </>,
    );
    fireEvent.click(getByText('toast'));
    const stack = getByText('Added to end of queue').closest('.fixed') as HTMLElement;
    expect(stack).toBeTruthy();
    // 96px bottom clears the 80px bar + its seek strip; bottom-4 would cover it.
    expect(stack.className).toContain('bottom-24');
    expect(stack.className).not.toMatch(/bottom-4\b/);
  });
});
