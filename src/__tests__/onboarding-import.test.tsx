// @vitest-environment jsdom
/**
 * Phase 2: onboarding step 3's "Import from OPML" is real.
 *
 * The button was `onClick={() => {}}` — one of five dead controls no plan ever
 * inventoried. The backend it needs already exists (`channelCommands.import`,
 * mirrored in the mock router from commands/channels.rs): OPML import
 * REGISTERS feeds without fetching, and a duplicate import imports nothing.
 *
 * Onboarding also had NO toast layer and swallowed its only real error with
 * console.error — the same silent-failure shape 2f fixed on the Search screen.
 * So a rejected import must surface here too, not report success.
 *
 * Discriminants (mutation-checked): pointing Import at a failing command must
 * fail the success assertion; making the button fire on an empty field must
 * fail the disabled assertion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingScreen } from '../components/screens/OnboardingScreen';
import { Toaster, clearToasts } from '../components/ui/Toaster';
import { mockInvoke, resetMockState } from '../mocks/router';
import * as bridge from '../tauri-bridge';

/** OPML with two feeds: one the mock router will register, one it already has. */
const OPML_TWO_FEEDS = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>EchoPrism Subscriptions</title></head>
  <body>
    <outline type="rss" text="A New Show" xmlUrl="https://feeds.example.org/a-new-show.xml"/>
    <outline type="rss" text="Another Show" xmlUrl="https://feeds.example.org/another-show.xml"/>
  </body>
</opml>`;

function renderOnboarding() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OnboardingScreen />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Drive the 4-step wizard to step 3 (Import Subscriptions). */
async function gotoImportStep() {
  fireEvent.click(screen.getByRole('button', { name: /get started/i }));
  fireEvent.change(screen.getByLabelText(/instance url/i), {
    target: { value: 'https://invidious.example.dev' },
  });
  fireEvent.click(screen.getByRole('button', { name: /add instance/i }));
  await screen.findByRole('heading', { name: /import subscriptions/i });
}

beforeEach(() => {
  resetMockState();
  // The toast store is module-level and survives unmount; without this, a
  // toast from an earlier test satisfies (or vacuously passes) these asserts.
  clearToasts();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Phase 2: onboarding imports OPML through the real command', () => {
  it('step 3 offers no dead control — Import calls the import command', async () => {
    renderOnboarding();
    await gotoImportStep();

    const importButton = screen.getByRole('button', { name: /^import$/i });
    expect(importButton).toBeTruthy();
    // No control on this step may still be a no-op.
    expect(importButton.getAttribute('onclick')).toBeNull();

    fireEvent.change(screen.getByLabelText(/opml|subscriptions/i), {
      target: { value: OPML_TWO_FEEDS },
    });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(screen.getByText(/imported 2 feeds/i)).toBeTruthy();
    });
  });

  it('registers the feeds for real — a second import imports nothing', async () => {
    renderOnboarding();
    await gotoImportStep();

    const field = screen.getByLabelText(/opml|subscriptions/i);
    const importButton = screen.getByRole('button', { name: /^import$/i });

    fireEvent.change(field, { target: { value: OPML_TWO_FEEDS } });
    fireEvent.click(importButton);
    await waitFor(() => expect(screen.getByText(/imported 2 feeds/i)).toBeTruthy());

    fireEvent.change(field, { target: { value: OPML_TWO_FEEDS } });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(screen.getByText(/imported 0 feeds/i)).toBeTruthy();
    });
  });

  it('Import is disabled while the field is empty (no wasted command call)', async () => {
    renderOnboarding();
    await gotoImportStep();

    const importButton = screen.getByRole('button', { name: /^import$/i }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/opml|subscriptions/i), {
      target: { value: '   ' },
    });
    expect(importButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/opml|subscriptions/i), {
      target: { value: OPML_TWO_FEEDS },
    });
    expect(importButton.disabled).toBe(false);
  });

  it('DISCRIMINANT: a rejected import surfaces an error toast, never success', async () => {
    vi.spyOn(bridge, 'invoke').mockImplementation((cmd, args) => {
      if (cmd === 'import') {
        return Promise.reject(new Error('unsupported import source: csv'));
      }
      return mockInvoke(cmd as string, args as Record<string, unknown> | undefined);
    });

    renderOnboarding();
    await gotoImportStep();

    fireEvent.change(screen.getByLabelText(/opml|subscriptions/i), {
      target: { value: OPML_TWO_FEEDS },
    });
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText(/import failed/i)).toBeTruthy();
    });
    // `feeds?` — plural only would miss a singular success toast and let a
    // "reports success for work it never did" defect pass here.
    expect(screen.queryByText(/imported \d+ feeds?/i)).toBeNull();
  });

  it('Import from YouTube calls the real command with the step-2 instance URL', async () => {
    renderOnboarding();
    await gotoImportStep();

    // The instance URL typed at step 2 is what the import runs against.
    fireEvent.click(screen.getByRole('button', { name: /import from youtube/i }));

    await waitFor(() => {
      expect(screen.getByText(/imported \d+ subscription/i)).toBeTruthy();
    });
  });

  it('DISCRIMINANT: the wizard cannot reach the YouTube import without a step-2 instance', async () => {
    // The import has no host without an instance, and a button that fired
    // anyway would report "imported 0" — a silent no-op. Step 3 is unreachable
    // with an empty URL (both step-2 advance controls are disabled), so THAT is
    // the guard to pin: re-enabling either one is what would expose the no-op.
    renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    const advance = [
      screen.getByRole('button', { name: /add instance/i }),
      screen.getByRole('button', { name: /^next$/i }),
    ] as HTMLButtonElement[];
    for (const b of advance) expect(b.disabled).toBe(true);

    for (const b of advance) fireEvent.click(b);
    expect(screen.queryByRole('heading', { name: /import subscriptions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /import from youtube/i })).toBeNull();
  });
});
