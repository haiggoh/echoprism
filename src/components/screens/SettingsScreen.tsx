import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { channelCommands, instanceCommands, playModeRuleCommands, settingsCommands } from '../../hooks/useTauriCommands';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { InstanceCard } from '../settings/InstanceCard';
import { useToasts } from '../ui/Toaster';
import { useTheme } from '../../hooks/useTheme';
import type { Channel, PlayModeRule } from '../../types';

export function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<'instances' | 'preferences' | 'podcasts' | 'smart-links' | 'play-modes' | 'shortcuts' | 'about'>('instances');

  const tabs: { id: 'instances' | 'preferences' | 'podcasts' | 'smart-links' | 'play-modes' | 'shortcuts' | 'about'; label: string; icon: string }[] = [
    { id: 'instances', label: 'Instances', icon: 'server' },
    { id: 'preferences', label: 'Preferences', icon: 'settings' },
    { id: 'podcasts', label: 'Podcasts', icon: 'mic' },
    { id: 'smart-links', label: 'Smart Links', icon: 'link' },
    { id: 'play-modes', label: 'Play Modes', icon: 'play' },
    { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
    { id: 'about', label: 'About', icon: 'info' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-2xl font-semibold text-text">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1 px-4" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content. tabIndex + region role: a scrollable area must be
          keyboard-reachable (axe scrollable-region-focusable, 2b). */}
      <div role="region" aria-label="Settings content" tabIndex={0} className="flex-1 overflow-auto p-4">
        {activeTab === 'instances' && (
          <InstanceSettingsTab />
        )}

        {activeTab === 'preferences' && (
          <PreferencesTab />
        )}

        {activeTab === 'podcasts' && (
          <PodcastsTab />
        )}

        {activeTab === 'smart-links' && (
          <SmartLinksTab />
        )}

        {activeTab === 'play-modes' && (
          <PlayModesTab />
        )}

        {activeTab === 'shortcuts' && (
          <ShortcutsTab />
        )}

        {activeTab === 'about' && (
          <AboutTab />
        )}
      </div>
    </div>
  );
}

function InstanceSettingsTab() {
  const queryClient = useQueryClient();
  const { data: instances } = useQuery({ queryKey: ['instances'], queryFn: instanceCommands.list });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newInstanceUrl, setNewInstanceUrl] = useState('');
  const [newInstanceType, setNewInstanceType] = useState<'invidious' | 'piped'>('invidious');

  const addMutation = useMutation({
    mutationFn: ({ url, type }: { url: string; type: 'invidious' | 'piped' }) =>
      instanceCommands.add(url, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      setShowAddDialog(false);
      setNewInstanceUrl('');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Instance Pool</h2>
        <Button onClick={() => setShowAddDialog(true)} variant="unified">
          Add Instance
        </Button>
      </div>

      {instances && instances.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {instances.map((instance) => (
            <InstanceCard key={instance.id} instance={instance as any} />
          ))}
        </div>
      ) : (
        <EmptyState variant="feed" />
      )}

      {/* Add Instance Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay">
          <div className="bg-bg-elevated rounded-xl p-6 w-full max-w-md mx-4 animate-in">
            <h3 className="text-lg font-semibold mb-4">Add Instance</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <input
                  type="url"
                  value={newInstanceUrl}
                  onChange={(e) => setNewInstanceUrl(e.target.value)}
                  placeholder="https://invidious.example.com"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newInstanceType}
                  onChange={(e) => setNewInstanceType(e.target.value as 'invidious' | 'piped')}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
                >
                  <option value="invidious">Invidious</option>
                  <option value="piped">Piped</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddDialog(false)} className="btn-ghost">Cancel</button>
              <button 
                onClick={() => addMutation.mutate({ url: newInstanceUrl, type: newInstanceType })}
                className="btn-unified"
                disabled={!newInstanceUrl.trim()}
              >
                Add Instance
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
  );
}

function PreferencesTab() {
  const { data: preferences } = useQuery({ queryKey: ['preferences'], queryFn: settingsCommands.get });
  const queryClient = useQueryClient();
  // The live theme mechanism (ThemeProvider + localStorage) — the control
  // below writes through this, not only the DB preference.
  const { theme: currentTheme, setTheme } = useTheme();

  const updateMutation = useMutation({
    mutationFn: (prefs: Partial<any>) => settingsCommands.update(prefs),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Default Format</h3>
        <div className="grid grid-cols-3 gap-3">
          {['unified', 'video', 'audio'].map((format) => (
            <label key={format} className="relative cursor-pointer">
              <input
                type="radio"
                name="default_format"
                value={format}
                checked={preferences?.default_format === format}
                onChange={() => updateMutation.mutate({ default_format: format })}
                className="sr-only peer"
              />
              <div className={`p-4 rounded-lg border-2 text-center transition-colors ${
                preferences?.default_format === format
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border hover:border-input'
              }`}>
                <p className="font-medium capitalize">{format}</p>
                <p className="text-sm text-text-muted mt-1">
                  {format === 'unified' && 'Video + audio unified'}
                  {format === 'video' && 'Video only'}
                  {format === 'audio' && 'Audio only'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-4">Queue Behavior</h3>
        <div className="grid grid-cols-2 gap-3">
          {['play_next', 'add_end'].map((behavior) => (
            <label key={behavior} className="relative cursor-pointer">
              <input
                type="radio"
                name="queue_behavior"
                value={behavior}
                checked={preferences?.queue_behavior === behavior}
                onChange={() => updateMutation.mutate({ queue_behavior: behavior })}
                className="sr-only peer"
              />
              <div className={`p-4 rounded-lg border-2 text-center ${
                preferences?.queue_behavior === behavior
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border hover:border-input'
              }`}>
                <span className="font-medium">{behavior === 'play_next' ? 'Play Next' : 'Add to End'}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-4">Card Click Behavior</h3>
        <div className="space-y-2">
          {([
            { value: 'auto', label: 'Smart (recommended)', hint: 'Play now when nothing is playing; add to queue otherwise' },
            { value: 'play_now', label: 'Always play now', hint: 'Open the player and start playback immediately' },
            { value: 'load_paused', label: 'Open paused', hint: 'Load the episode in the player without starting playback' },
            { value: 'queue', label: 'Always add to queue', hint: 'Never interrupt current playback' },
          ] as const).map((opt) => (
            <label key={opt.value} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border hover:border-input transition-colors">
              <input
                type="radio"
                name="card_click_action"
                value={opt.value}
                checked={preferences?.card_click_action === opt.value}
                onChange={() => updateMutation.mutate({ card_click_action: opt.value })}
                className="mt-1 w-4 h-4 accent-accent"
              />
              <span>
                <span className="text-sm font-medium text-text block">{opt.label}</span>
                <span className="text-xs text-text-muted">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences?.auto_download_wifi}
            onChange={(e) => updateMutation.mutate({ auto_download_wifi: e.target.checked })}
            className="w-4 h-4 accent-accent rounded border-border"
          />
          <span>Auto-download on WiFi</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences?.sponsorblock_enabled}
            onChange={(e) => updateMutation.mutate({ sponsorblock_enabled: e.target.checked })}
            className="w-4 h-4 accent-accent rounded border-border"
          />
          <span>SponsorBlock (skip sponsors)</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences?.keyboard_shortcuts_enabled}
            onChange={(e) => updateMutation.mutate({ keyboard_shortcuts_enabled: e.target.checked })}
            className="w-4 h-4 accent-accent rounded border-border"
          />
          <span>Keyboard shortcuts</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences?.cross_device_sync_enabled}
            onChange={(e) => updateMutation.mutate({ cross_device_sync_enabled: e.target.checked })}
            className="w-4 h-4 accent-accent rounded border-border"
          />
          <span>Cross-device sync (experimental)</span>
        </label>
      </div>

      <div>
        <h3 className="font-semibold mb-4">Theme</h3>
        {/* 2a audit: this control was decoration — every radio rendered
            checked with an empty onChange, so it neither showed nor changed
            anything. It now drives the live theme mechanism (ThemeProvider;
            localStorage), and 'light' is gone: brand.md defines a dark-first
            palette and index.css carries no light rules, so the option never
            did anything. */}
        <div className="grid grid-cols-2 gap-3">
          {(['system', 'dark'] as const).map((theme) => (
            <label key={theme} className="relative cursor-pointer">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={currentTheme === theme}
                onChange={() => setTheme(theme)}
                className="sr-only peer"
              />
              <div className={`p-4 rounded-lg border-2 text-center ${
                currentTheme === theme ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:border-input'
              }`}>
                <span className="font-medium capitalize">{theme}</span>
              </div>
            </label>
          ))}
        </div>
        <p className="text-sm text-text-muted mt-3">
          A light theme is not designed yet — EchoPrism is dark-first.
        </p>
      </div>
    </div>
  );
}

function PodcastsTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Podcast Feeds</h2>
        <Button variant="unified">Add Feed</Button>
      </div>
      <EmptyState variant="feed" />
    </div>
  );
}

function SmartLinksTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Smart Episode Links</h2>
        <Button variant="unified" onClick={() => {}}>
          Run Matching
        </Button>
      </div>
      <EmptyState variant="feed" />
    </div>
  );
}

/**
 * D7 rule editor (design-decisions.md): per-channel, per-title-family default
 * play modes. handleCardClick consults these rules (first match wins) before
 * the channel's format_preference, so a pattern here overrides that channel
 * default for matching episodes.
 */
function PlayModesTab() {
  const { data: channels } = useQuery({
    queryKey: ['channels', 'for-play-mode'],
    queryFn: () => channelCommands.list(),
  });
  const { data: rules = [] } = useQuery({
    queryKey: ['play-mode-rules'],
    queryFn: () => playModeRuleCommands.list(),
  });

  const subscribed = (channels ?? []).filter((c) => c.is_subscribed);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Play Modes</h2>
        <p className="text-sm text-text-muted mt-1 max-w-2xl">
          Give episodes a default play mode by title family — e.g. "Some More News" titled episodes
          play video while "Even More News" titled episodes play audio, even though both belong to
          the same show. The first matching rule wins; without a rule the channel default applies.
        </p>
      </div>

      {subscribed.map((channel) => (
        <ChannelRulesSection
          key={channel.id}
          channel={channel}
          rules={rules.filter((r) => r.channel_id === channel.id)}
        />
      ))}
    </div>
  );
}

function ChannelRulesSection({
  channel,
  rules,
}: {
  channel: Channel;
  rules: PlayModeRule[];
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToasts();
  const [pattern, setPattern] = useState('');
  const [mode, setMode] = useState<'video' | 'audio'>('video');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['play-mode-rules'] });
  // Rule mutations are otherwise silent on failure — the form would just
  // keep its input and the list would keep its old shape with no signal why.
  const onError = (err: unknown) =>
    addToast({
      title: 'Could not save play-mode rule',
      description: err instanceof Error ? err.message : 'Unknown error',
      variant: 'danger',
    });
  const setMutation = useMutation({
    mutationFn: () => playModeRuleCommands.set(channel.id, pattern.trim(), mode),
    onSuccess: () => {
      invalidate();
      setPattern('');
    },
    onError,
  });
  const removeMutation = useMutation({
    mutationFn: (ruleId: string) => playModeRuleCommands.remove(ruleId),
    onSuccess: invalidate,
    onError,
  });

  return (
    <section
      aria-label={`Play mode rules for ${channel.title}`}
      className="rounded-lg border border-border p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text">{channel.title}</h3>
        <span className="text-xs text-text-muted capitalize">{channel.type}</span>
      </div>

      {rules.length > 0 ? (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-text">"{rule.title_pattern}"</span>
              <span className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-surface text-xs font-medium capitalize text-text">
                  {rule.play_mode}
                </span>
                <button
                  type="button"
                  aria-label={`Remove "${rule.title_pattern}" rule for ${channel.title}`}
                  onClick={() => removeMutation.mutate(rule.id)}
                  className="text-sm text-text-muted hover:text-text"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">
          No rules yet — episodes play with the channel default.
        </p>
      )}

      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (pattern.trim()) setMutation.mutate();
        }}
      >
        <div className="flex-1">
          <label htmlFor={`rule-pattern-${channel.id}`} className="block text-sm font-medium mb-1">
            Title contains
          </label>
          <input
            id={`rule-pattern-${channel.id}`}
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={`e.g. ${channel.title}`}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
        <fieldset>
          <legend className="block text-sm font-medium mb-1">Default mode</legend>
          <div className="flex gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name={`play-mode-${channel.id}`}
                checked={mode === 'video'}
                onChange={() => setMode('video')}
                className="w-4 h-4 accent-accent"
              />
              Video
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name={`play-mode-${channel.id}`}
                checked={mode === 'audio'}
                onChange={() => setMode('audio')}
                className="w-4 h-4 accent-accent"
              />
              Audio
            </label>
          </div>
        </fieldset>
        <button
          type="submit"
          className="btn-unified"
          disabled={!pattern.trim() || setMutation.isPending}
        >
          Add rule
        </button>
      </form>
    </section>
  );
}

function ShortcutsTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text">Keyboard Shortcuts</h2>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="bg-bg-elevated">
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Action</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Shortcut</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">Context</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Play / Pause</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">Space</kbd></td>
              <td className="px-4 py-3 text-text-muted">Global</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Next Track</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">Shift + →</kbd></td>
              <td className="px-4 py-3 text-text-muted">Global</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Previous Track</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">Shift + ←</kbd></td>
              <td className="px-4 py-3 text-text-muted">Global</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Seek Forward</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">→</kbd></td>
              <td className="px-4 py-3 text-text-muted">Player</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Seek Backward</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">←</kbd></td>
              <td className="px-4 py-3 text-text-muted">Player</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Volume Up</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">↑</kbd></td>
              <td className="px-4 py-3 text-text-muted">Global</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Volume Down</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">↓</kbd></td>
              <td className="px-4 py-3 text-text-muted">Global</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Toggle Audio/Video</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">A</kbd></td>
              <td className="px-4 py-3 text-text-muted">Player</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Toggle Queue</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">Q</kbd></td>
              <td className="px-4 py-3 text-text-muted">Global</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Search</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">/</kbd></td>
              <td className="px-4 py-3 text-text-muted">Global</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Toggle Fullscreen</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">F</kbd></td>
              <td className="px-4 py-3 text-text-muted">Player</td>
            </tr>
            <tr className="hover:bg-surface-hover">
              <td className="px-4 py-3">Picture in Picture</td>
              <td className="px-4 py-3"><kbd className="px-2 py-1 bg-surface rounded border border-border text-sm">P</kbd></td>
              <td className="px-4 py-3 text-text-muted">Player</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-center py-12">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-stream-video to-stream-audio rounded-2xl flex items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-text">EchoPrism</h2>
        <p className="text-text-muted mt-2">Two streams become one</p>
        <p className="text-text-muted mt-4 max-w-md mx-auto">
          A unified video & podcast player that converges YouTube watching and podcast listening 
          into one seamless stream. Built with Tauri, Rust, and love for privacy.
        </p>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Version</h3>
        <p className="text-text-muted">0.1.0-alpha</p>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Links</h3>
        <div className="flex flex-wrap gap-4">
          <a href="https://github.com/echoprism" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            GitHub
          </a>
          <a href="https://echoprism.app" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Website
          </a>
          <a href="https://discord.gg/echoprism" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Discord
          </a>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="font-semibold mb-4">License</h3>
        <p className="text-text-muted">
          MIT License — Free, open source, forever.
        </p>
      </div>
    </div>
  );
}
