// @vitest-environment jsdom
/**
 * Phase 4 (docs/plans/2026-10-19-d6-d7-smart-links-and-play-modes.md) — the
 * Settings → Play Modes rule editor: per subscribed channel, list its
 * pattern → mode rules with remove buttons, plus an add form (title-contains
 * input + video/audio radios + add button).
 *
 * Unmocked on purpose: jsdom has no Tauri shell, so the real bridge serves the
 * real mock router — the test exercises the actual command wrappers and IPC
 * keys, and the router's in-memory state is what the UI must reflect.
 *
 * Discriminants: dropping the is_subscribed filter fails the ch-5 exclusion;
 * cutting the rule-list rendering fails the seeded-rule assertions; breaking
 * the mutation invalidation fails the add/remove round-trips.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { Toaster } from '../components/ui/Toaster';
import * as bridge from '../tauri-bridge';
import { mockInvoke, resetMockState } from '../mocks/router';

function openPlayModesTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Play Modes' }));
}

function channelSection(title: string): HTMLElement {
  return screen.getByRole('region', { name: `Play mode rules for ${title}` });
}

beforeEach(() => {
  resetMockState();
});

afterEach(() => {
  cleanup();
});

function renderSettings({ withToaster = false }: { withToaster?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsScreen />
      {withToaster && <Toaster />}
    </QueryClientProvider>
  );
}

describe('Settings → Play Modes rule editor (D7)', () => {
  it('lists each subscribed channel with its seeded rules and modes', async () => {
    renderSettings();
    openPlayModesTab();

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Play mode rules for Some More News' })).toBeTruthy();
    });

    const smn = channelSection('Some More News');
    // Pattern and its mode live on the same rule row (the li also holds the
    // remove button). The channel-type span also reads "video", so assert on
    // the row, not the section.
    const smnRow = within(smn).getByText('"Some More News"').closest('li');
    expect(smnRow?.textContent).toContain('video');

    const emn = channelSection('Even More News');
    const emnRow = within(emn).getByText('"Even More News"').closest('li');
    expect(emnRow?.textContent).toContain('audio');
  });

  it('offers only subscribed channels (unsubscribed are not editable)', async () => {
    renderSettings();
    openPlayModesTab();

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Play mode rules for Tech Talks Weekly' })).toBeTruthy();
    });
    expect(screen.queryByRole('region', { name: 'Play mode rules for Archive Bonus Content' })).toBeNull();
  });

  it('adds a rule through the form and shows it after the refetch', async () => {
    renderSettings();
    openPlayModesTab();

    const section = await waitFor(() => channelSection('Tech Talks Weekly'));
    const input = within(section).getByLabelText('Title contains') as HTMLInputElement;

    // The add button is disabled until a pattern is entered (a mode-less rule
    // would be meaningless).
    const add = within(section).getByRole('button', { name: 'Add rule' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Cody' } });
    fireEvent.click(within(section).getByRole('radio', { name: 'Video' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Add rule' }));

    // After set_play_mode_rule + invalidation, the new rule is listed.
    await waitFor(() => {
      expect(
        within(channelSection('Tech Talks Weekly')).getByRole('button', {
          name: 'Remove "Cody" rule for Tech Talks Weekly',
        })
      ).toBeTruthy();
    });
  });

  it('removes a rule and the list reflects the removal', async () => {
    renderSettings();
    openPlayModesTab();

    await waitFor(() => {
      expect(channelSection('Even More News')).toBeTruthy();
    });
    const remove = within(channelSection('Even More News')).getByRole('button', {
      name: 'Remove "Even More News" rule for Even More News',
    });
    fireEvent.click(remove);

    await waitFor(() => {
      expect(
        within(channelSection('Even More News')).queryByRole('button', {
          name: 'Remove "Even More News" rule for Even More News',
        })
      ).toBeNull();
    });
    // The channel section itself stays (other rules may exist; the form remains).
    expect(channelSection('Even More News')).toBeTruthy();
  });

  // Finding 7 (adversarial review): a failed rule mutation was silent — the
  // form kept its input and the list its old shape with no signal why. The
  // bridge spy rejects ONLY set_play_mode_rule; every other command still
  // routes to the real mock router, so the harness stays unmocked otherwise.
  it('surfaces a danger toast when saving a rule fails', async () => {
    const invokeSpy = vi
      .spyOn(bridge, 'invoke')
      .mockImplementation((cmd: string, args?: Record<string, unknown>) =>
        cmd === 'set_play_mode_rule'
          ? Promise.reject(new Error('mock: rule store unavailable'))
          : mockInvoke(cmd, args)
      );
    try {
      renderSettings({ withToaster: true });
      openPlayModesTab();

      const section = await waitFor(() => channelSection('Tech Talks Weekly'));
      fireEvent.change(within(section).getByLabelText('Title contains') as HTMLInputElement, {
        target: { value: 'Cody' },
      });
      fireEvent.click(within(section).getByRole('button', { name: 'Add rule' }));

      expect(await screen.findByText('Could not save play-mode rule')).toBeTruthy();
      expect(await screen.findByText('mock: rule store unavailable')).toBeTruthy();
      // The failed input is preserved so the user can retry.
      expect(
        (within(section).getByLabelText('Title contains') as HTMLInputElement).value
      ).toBe('Cody');
    } finally {
      invokeSpy.mockRestore();
    }
  });
});
