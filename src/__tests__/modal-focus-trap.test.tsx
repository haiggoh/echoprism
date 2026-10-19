// @vitest-environment jsdom
/**
 * Modal keyboard focus trap — F05 review #3. QueueScreen's clear-queue
 * confirmation is the Modal's first consumer, so this hole became reachable
 * with F05: on open, focus sits on the (untabbable) container, the old trap
 * only intercepted Tab when focus was exactly on the first/last focusable, so
 * Shift+Tab from the initial focus escaped into the page behind the overlay.
 *
 * jsdom does not move focus on Tab by itself, so each test fires the keydown
 * and asserts the trap's own decision: either it moved focus inside the
 * dialog, or (if it did nothing) the browser default would have escaped.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '../components/ui/Modal';

afterEach(() => cleanup());

function renderModal() {
  render(
    <>
      <button>Behind the overlay</button>
      <Modal
        isOpen
        onClose={() => {}}
        variant="confirmation"
        title="Clear queue?"
        footer={
          <>
            <button>Cancel</button>
            <button>Clear</button>
          </>
        }
      >
        body
      </Modal>
    </>
  );
  return screen.getByRole('dialog');
}

describe('Modal focus trap', () => {
  it('Shift+Tab from the initial focus wraps to the LAST control in the dialog', () => {
    const dialog = renderModal();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear' }));
  });

  it('Tab from the initial focus lands on the FIRST control in the dialog', () => {
    renderModal();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('focus that has escaped the dialog is pulled back in on the next Tab', () => {
    renderModal();
    screen.getByRole('button', { name: 'Behind the overlay' }).focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('keeps the existing wrap at both ends', () => {
    renderModal();
    screen.getByRole('button', { name: 'Clear' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear' }));
  });
});
