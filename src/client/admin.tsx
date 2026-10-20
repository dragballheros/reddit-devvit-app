import { requestExpandedMode, showForm, showToast } from '@devvit/web/client';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './admin.css';
import {
  BUTTON_LABEL_MAX,
  LABEL_FONTS,
  LABEL_SIZES,
  LABEL_WEIGHTS,
  OUTLINE_STYLES,
  getDefaultAdminConfig,
  getSubredditLink,
  getSubredditNameFromUrl,
  normalizeManagedSubredditName,
  type AdminConfig,
  type BackgroundStyle,
  type ManagedAsset,
  type ManagedButton,
  type WelcomeGifFit,
} from '../shared/subreddit';
import { useWebViewMode } from './useWebViewMode';

type TargetRecord = { subredditName: string; postId: string };
type AccessLevel = 'everything' | 'delegatedModerator';
type ModeratorRosterEntry = { username: string; everything: boolean };
type CommunityRole = 'home' | 'connected';

type CommunityRecord = {
  subredditName: string;
  role: CommunityRole;
  canEdit: boolean;
  canRead: boolean;
  followsHome: boolean;
  postId?: string;
  config?: AdminConfig;
  warnings?: string[];
};

type AdminPayload = {
  config: AdminConfig;
  warnings?: string[];
  targets: TargetRecord[];
  accessLevel?: AccessLevel;
  canManageAccess?: boolean;
  homeSubreddit?: string;
  communities?: CommunityRecord[];
};

type CopiedConfig = { source: string; config: AdminConfig };

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  let body: { error?: string } = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) throw new ApiError(body.error ?? 'Request failed.', response.status);
  return body as T;
};

const cloneDefault = (): AdminConfig => JSON.parse(JSON.stringify(getDefaultAdminConfig())) as AdminConfig;

const colorValue = (value: string | undefined, fallback: string) => {
  const color = value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
  if (color.length === 4) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  return color.slice(0, 7);
};

const BackgroundEditor = ({ button, onChange }: { button: ManagedButton; onChange: (patch: Partial<ManagedButton>) => void }) => {
  const start = useRef<{ x: number; y: number; scale: number; sx: number; sy: number; px: number; py: number; mode: 'resize' | 'pan' } | null>(null);

  const track = (mode: 'resize' | 'pan', event: React.PointerEvent<HTMLElement>, sx = 0, sy = 0) => {
    event.preventDefault();
    event.stopPropagation();
    start.current = {
      x: event.clientX,
      y: event.clientY,
      scale: button.backgroundScale ?? 1,
      px: button.backgroundPositionX ?? 50,
      py: button.backgroundPositionY ?? 50,
      sx,
      sy,
      mode,
    };
    const move = (next: PointerEvent) => {
      if (!start.current) return;
      if (start.current.mode === 'resize') {
        const dx = (next.clientX - start.current.x) * start.current.sx;
        const dy = (next.clientY - start.current.y) * start.current.sy;
        const nextScale = Math.min(3, Math.max(0.5, start.current.scale + (dx + dy) / 260));
        onChange({ backgroundScale: Number(nextScale.toFixed(2)) });
        return;
      }
      const dx = next.clientX - start.current.x;
      const dy = next.clientY - start.current.y;
      onChange({
        backgroundPositionX: Math.min(100, Math.max(0, Math.round(start.current.px - dx / 2))),
        backgroundPositionY: Math.min(100, Math.max(0, Math.round(start.current.py - dy / 2))),
      });
    };
    const end = () => {
      start.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };

  return (
    <div
      className="fit-preview"
      onPointerDown={(event) => track('pan', event)}
      style={{
        backgroundImage: button.background ? `url("${button.background}")` : button.backgroundGradient,
        backgroundPosition: `${button.backgroundPositionX ?? 50}% ${button.backgroundPositionY ?? 50}%`,
        backgroundSize: button.background ? `${(button.backgroundScale ?? 1) * 100}% auto` : '220% 220%',
      }}
    >
      <span>{button.label}</span>
      <span className="resize-handle resize-handle--tl" onPointerDown={(event) => track('resize', event, 1, 1)} />
      <span className="resize-handle resize-handle--tr" onPointerDown={(event) => track('resize', event, -1, 1)} />
      <span className="resize-handle resize-handle--bl" onPointerDown={(event) => track('resize', event, 1, -1)} />
      <span className="resize-handle resize-handle--br" onPointerDown={(event) => track('resize', event, -1, -1)} />
    </div>
  );
};

export const AdminApp = () => {
  const mode = useWebViewMode();
  const drafts = useRef<Record<string, AdminConfig>>({});
  const [config, setConfig] = useState<AdminConfig>(cloneDefault());
  const [targets, setTargets] = useState<TargetRecord[]>([]);
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [homeSubreddit, setHomeSubreddit] = useState('');
  const [selected, setSelected] = useState('');
  const [copied, setCopied] = useState<CopiedConfig | null>(null);
  const [pasteConfirm, setPasteConfirm] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [newSubreddit, setNewSubreddit] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('delegatedModerator');
  const [moderators, setModerators] = useState<ModeratorRosterEntry[]>([]);
  const [delegates, setDelegates] = useState<string[]>([]);
  const [accessRefreshing, setAccessRefreshing] = useState(false);
  const [accessSaving, setAccessSaving] = useState<string | null>(null);

  const refreshModeratorRoster = async () => {
    setAccessRefreshing(true);
    try {
      const data = await api<{ moderators: ModeratorRosterEntry[]; delegates: string[] }>('/api/admin/access');
      setModerators(data.moderators ?? []);
      setDelegates(data.delegates ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not scan the live moderator team.');
    } finally {
      setAccessRefreshing(false);
    }
  };

  const applyLoaded = (data: AdminPayload, prefer?: string, keepDrafts = false) => {
    if (!keepDrafts) drafts.current = {};
    const nextCommunities = data.communities?.length
      ? data.communities
      : [{
          subredditName: data.homeSubreddit || 'community',
          role: 'home' as const,
          canEdit: true,
          canRead: true,
          followsHome: false,
          config: data.config,
          warnings: data.warnings ?? [],
        }];
    const home = data.homeSubreddit || nextCommunities.find((item) => item.role === 'home')?.subredditName || '';
    const nextName = prefer && nextCommunities.some((item) => item.subredditName === prefer) ? prefer : home;
    const community = nextCommunities.find((item) => item.subredditName === nextName);
    setCommunities(nextCommunities);
    setHomeSubreddit(home);
    setTargets(data.targets ?? []);
    setAccessLevel(data.accessLevel ?? 'delegatedModerator');
    setSelected(nextName);
    const draft = keepDrafts ? drafts.current[nextName] : undefined;
    if (community?.canRead) {
      setConfig(draft ?? community.config ?? cloneDefault());
      setWarnings(draft ? [] : (community.warnings ?? data.warnings ?? []));
    } else {
      setConfig(cloneDefault());
      setWarnings([]);
    }
    setReady(true);
  };

  const loadConfig = async () => {
    setReady(false);
    setLoadError(null);
    setAccessDenied(null);
    try {
      const data = await api<AdminPayload>('/api/admin/config');
      applyLoaded(data);
      if (data.canManageAccess) await refreshModeratorRoster();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load admin panel.';
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAccessDenied(message);
      } else {
        setLoadError(message);
      }
    }
  };

  const refreshConfig = async (prefer: string) => {
    const data = await api<AdminPayload>('/api/admin/config');
    applyLoaded(data, prefer, true);
  };

  useEffect(() => {
    if (mode !== 'expanded') return;
    void loadConfig();
  }, [mode]);

  const updateButton = (id: string, patch: Partial<ManagedButton>) =>
    setConfig((current) => ({
      ...current,
      buttons: current.buttons.map((button) => (button.id === id ? { ...button, ...patch } : button)),
    }));

  const addButton = () => setConfig((current) => ({
    ...current,
    buttons: [...current.buttons, {
      id: `button-${crypto.randomUUID()}`,
      label: 'New Subreddit',
      type: 'subreddit',
      url: '',
      accent: '#b18cff',
      backgroundGradient: 'linear-gradient(120deg,#1b1b2f,#3d2c63,#090a12)',
      labelFont: LABEL_FONTS[0].value,
      labelSize: LABEL_SIZES[1].value,
      labelWeight: 800,
      outlineStyle: 'electric',
      enabled: true,
    }],
  }));

  const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return btoa(binary);
  };

  const uploadMedia = async (kind: 'welcome' | 'background' | 'icon', buttonId?: string) => {
    try {
      const result = await showForm({
        title: kind === 'welcome' ? 'Upload Welcome Media' : kind === 'background' ? (buttonId ? 'Upload Button Background' : 'Upload Custom Background') : 'Upload Button Icon',
        fields: [
          { type: 'string', name: 'name', label: 'Asset name', required: true },
        ],
      });

      if (!result || result.action === 'CANCELED' || !result.values?.name) return;

      const file = await new Promise<File | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
      });

      if (!file) return;

      const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
      if (!allowedTypes.has(file.type)) {
        showToast('Unsupported image type. Use PNG, JPEG, WEBP, or GIF.');
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        showToast('Reddit media uploads are limited to 20 MB.');
        return;
      }

      const totalBytes = file.size;
      const chunkBytes = 1.25 * 1024 * 1024;
      const totalChunks = Math.ceil(totalBytes / chunkBytes);
      const uploadId = crypto.randomUUID();

      showToast(totalChunks > 1 ? `Uploading asset 0/${totalChunks}…` : 'Uploading asset…');

      for (let index = 0; index < totalChunks; index += 1) {
        const startByte = index * chunkBytes;
        const endByte = Math.min(startByte + chunkBytes, totalBytes);
        const bytes = new Uint8Array(await file.slice(startByte, endByte).arrayBuffer());
        await api('/api/admin/upload-asset/chunk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            uploadId,
            index,
            totalChunks,
            totalBytes,
            type: file.type === 'image/gif' ? 'gif' : 'image',
            mimeType: file.type,
            data: bytesToBase64(bytes),
          }),
        });
        showToast(`Uploading asset ${index + 1}/${totalChunks}…`);
      }

      showToast('Finalizing asset…');
      const uploaded = await api<{ url: string; type: 'image' | 'gif' }>('/api/admin/upload-asset/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadId }),
      });

      const asset: ManagedAsset = {
        id: `asset-${crypto.randomUUID()}`,
        name: String(result.values.name),
        url: uploaded.url,
        type: uploaded.type,
      };

      setConfig((current) => ({
        ...current,
        assets: [...current.assets, asset],
        ...(kind === 'background' && !buttonId
          ? {
              backgroundStyle: 'custom' as BackgroundStyle,
              customBackground: uploaded.url,
            }
          : {}),
        ...(kind === 'welcome'
          ? {
              welcomeGif: current.welcomeGifVariants?.[0] ?? current.welcomeGif,
              welcomeGifVariants: [...(current.welcomeGifVariants ?? (current.welcomeGif ? [current.welcomeGif] : [])), uploaded.url],
              welcomeGifFitByUrl: {
                ...(current.welcomeGifFitByUrl ?? {}),
                [uploaded.url]: 'natural' as WelcomeGifFit,
              },
            }
          : {}),
      }));

      if (buttonId) {
        updateButton(buttonId, kind === 'background' ? { background: uploaded.url } : { icon: uploaded.url });
      }

      showToast(`Asset uploaded. Choose Save & Apply to r/${selected || 'this community'} to persist it.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Asset upload failed.');
    }
  };

  const removeAsset = (assetId: string) => {
    setConfig((current) => {
      const asset = current.assets.find((item) => item.id === assetId);
      if (!asset) return current;

      const nextWelcome = (current.welcomeGifVariants ?? []).filter((url) => url !== asset.url);
      const welcomeGifWasRemoved = current.welcomeGif === asset.url;

      return {
        ...current,
        assets: current.assets.filter((item) => item.id !== assetId),
        welcomeGif: welcomeGifWasRemoved ? nextWelcome[0] : current.welcomeGif,
        welcomeGifVariants: nextWelcome,
        welcomeGifFitByUrl: Object.fromEntries(
          Object.entries(current.welcomeGifFitByUrl ?? {}).filter(([url]) => url !== asset.url),
        ),
        customBackground: current.customBackground === asset.url ? undefined : current.customBackground,
        backgroundStyle: current.customBackground === asset.url ? 'petals' : current.backgroundStyle,
        buttons: current.buttons.map((button) => ({
          ...button,
          background: button.background === asset.url ? undefined : button.background,
          icon: button.icon === asset.url ? undefined : button.icon,
        })),
      };
    });
    showToast(`Asset removed. Choose Save & Apply to r/${selected || 'this community'} to keep the change.`);
  };

  const rememberDraft = () => {
    const community = communities.find((item) => item.subredditName === selected);
    if (community?.canRead && community.canEdit && selected) drafts.current[selected] = config;
  };

  const switchCommunity = (name: string) => {
    if (!name || name === selected) return;
    rememberDraft();
    setPasteConfirm(false);
    const community = communities.find((item) => item.subredditName === name);
    setSelected(name);
    if (community?.canRead) {
      setConfig(drafts.current[name] ?? community.config ?? cloneDefault());
      setWarnings(community.warnings ?? []);
    } else {
      setConfig(cloneDefault());
      setWarnings([]);
    }
  };

  const setModeratorAccess = async (username: string, granted: boolean) => {
    setAccessSaving(username);
    try {
      const data = await api<{ delegates: string[]; message?: string }>('/api/admin/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, granted }),
      });
      setDelegates(data.delegates ?? []);
      showToast(data.message ?? (granted ? `Granted admin access to u/${username}.` : `Revoked admin access from u/${username}.`));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update moderator access.');
      void refreshModeratorRoster();
    } finally {
      setAccessSaving(null);
    }
  };

  const selectedCommunity = communities.find((item) => item.subredditName === selected);
  const canEditSelected = selectedCommunity?.canEdit === true;
  const canReadSelected = selectedCommunity?.canRead === true;

  const save = async () => {
    if (!canEditSelected) {
      showToast(`Could not confirm that you have the Everything moderator permission in r/${selected}. No changes were made.`);
      return;
    }
    const invalidButton = config.buttons.find((button) => (
      !button.label.trim() ||
      button.label.trim().length > BUTTON_LABEL_MAX ||
      !getSubredditNameFromUrl(button.url)
    ));
    if (invalidButton) {
      showToast(`“${invalidButton.label.trim() || 'Subreddit button'}” needs a label and a valid Reddit subreddit URL, such as https://www.reddit.com/r/YourSubreddit/.`);
      return;
    }

    setSaving(true);
    try {
      await api('/api/admin/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subredditName: selected, config }),
      });
      delete drafts.current[selected];
      await refreshConfig(selected);
      showToast(`Saved r/${selected}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const connectSubreddit = async () => {
    const normalized = normalizeManagedSubredditName(newSubreddit);
    if (!normalized) {
      showToast('Enter a subreddit name with 2–21 letters, numbers, or underscores.');
      return;
    }
    if (normalized === homeSubreddit) {
      showToast('This community is already in the editor. Choose it under Editing.');
      return;
    }
    setConnecting(true);
    try {
      await api('/api/admin/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subredditName: normalized }),
      });
      setNewSubreddit('');
      delete drafts.current[normalized];
      await refreshConfig(normalized);
      showToast(`Connected r/${normalized}. A new connection starts from this community’s saved configuration.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not connect that subreddit.');
    } finally {
      setConnecting(false);
    }
  };

  const disconnectSubreddit = async () => {
    if (!selected || selected === homeSubreddit) return;
    const name = selected;
    setConnecting(true);
    try {
      await api('/api/admin/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subredditName: name }),
      });
      delete drafts.current[name];
      await refreshConfig(homeSubreddit);
      showToast(`Disconnected r/${name}. Its navigation post was kept.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not disconnect that subreddit.');
    } finally {
      setConnecting(false);
    }
  };

  const copyConfig = () => {
    if (!canReadSelected || !selected) {
      showToast(`You cannot copy r/${selected || 'this subreddit'}.`);
      return;
    }
    setCopied({ source: selected, config: JSON.parse(JSON.stringify(config)) as AdminConfig });
    setPasteConfirm(false);
    showToast(`Copied r/${selected}. Select another subreddit, then choose Paste Config.`);
  };

  const requestPaste = () => {
    if (!copied) {
      showToast('Copy a configuration first, then choose Paste Config.');
      return;
    }
    if (copied.source === selected) {
      showToast('Select a different subreddit before pasting.');
      return;
    }
    if (!canEditSelected) {
      showToast(`Could not confirm that you have the Everything moderator permission in r/${selected}. No changes were made.`);
      return;
    }
    setPasteConfirm(true);
  };

  const confirmPaste = async () => {
    if (!copied || !selected || copied.source === selected) return;
    setSaving(true);
    try {
      await api('/api/admin/paste', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceSubreddit: copied.source,
          targetSubreddit: selected,
          config: copied.config,
        }),
      });
      const source = copied.source;
      setPasteConfirm(false);
      delete drafts.current[selected];
      await refreshConfig(selected);
      showToast(`Replaced r/${selected} with the configuration copied from r/${source}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not paste that configuration.');
    } finally {
      setSaving(false);
    }
  };

  const removeButton = (id: string) => setConfig((current) => ({
    ...current,
    buttons: current.buttons.filter((button) => button.id !== id),
  }));

  if (mode === 'inline') {
    return (
      <main className="admin admin--inline">
        <div className="panel">
          <header className="hero">
            <div>
              <p className="eyebrow">Moderator Configuration</p>
              <h1>Community Navigation Admin</h1>
              <p className="hint">Opens the expanded editor. Requires Everything in this subreddit, or an explicit grant.</p>
            </div>
          </header>
          <section className="section">
            <button
              type="button"
              className="primary"
              onClick={(event) => {
                try {
                  requestExpandedMode(event.nativeEvent, 'admin');
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'Could not open the expanded editor.');
                }
              }}
            >
              Open admin editor
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="admin admin--expanded">
        <div className="panel">
          <header className="hero">
            <div>
              <p className="eyebrow">Access restricted</p>
              <h1>Admin access required</h1>
              <p className="hint">Only a moderator with Everything in this subreddit can open this dashboard, unless a moderator with Everything has explicitly granted access to another current moderator. Being a moderator somewhere else does not grant access here.</p>
            </div>
          </header>
          <section className="section">
            <h2>Dashboard unavailable</h2>
            <p className="validation-error" role="alert">{accessDenied}</p>
            <p className="hint">Access is checked on the server for every admin action. If your moderator role just changed, refresh this post and try again.</p>
          </section>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="admin admin--expanded">
        <div className="panel">
          <header className="hero">
            <div>
              <p className="eyebrow">Moderator Configuration</p>
              <h1>Community Navigation Admin</h1>
              <p className="hint">The editor stays closed until the saved configuration loads, so an empty form cannot replace it.</p>
            </div>
          </header>
          <section className="section">
            <p className="validation-error" role="alert">{loadError}</p>
            <button type="button" className="secondary" onClick={() => void loadConfig()}>Try again</button>
          </section>
        </div>
      </main>
    );
  }

  if (!ready) {
    return <main className="admin admin--expanded"><div className="panel"><h1>Community Navigation Admin</h1><p>Checking access and loading configuration…</p></div></main>;
  }

  const welcomeUrls = config.welcomeGifVariants?.length
    ? config.welcomeGifVariants
    : config.welcomeGif
      ? [config.welcomeGif]
      : [];

  return (
    <main className="admin admin--expanded">
      <div className="panel">
        <header className="hero">
          <div>
            <p className="eyebrow">Moderator Configuration</p>
            <h1>Community Navigation Admin</h1>
            <p className="hint">Each connected subreddit keeps its own navigation. Use Editing to switch, then save only that community. {accessLevel === 'everything' ? 'You have the Everything moderator permission in this community.' : 'You have delegated access from a moderator with Everything.'}</p>
          </div>
          <button type="button" className="primary" onClick={() => void save()} disabled={saving || !canEditSelected}>{saving ? 'Applying…' : `Save & Apply to r/${selected}`}</button>
        </header>
        {warnings.length > 0 && (
          <ul className="warning-list">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
        <section className="section">
          <div className="section-title"><h2>Connected Subreddits</h2><span>{Math.max(communities.length - 1, 0)} connected</span></div>
          <label className="background-style-select">Editing
            <select value={selected} onChange={(event) => switchCommunity(event.target.value)}>
              {communities.map((community) => (
                <option key={community.subredditName} value={community.subredditName}>
                  {community.role === 'home'
                    ? `r/${community.subredditName} (this community)`
                    : community.canEdit
                      ? `r/${community.subredditName}`
                      : `r/${community.subredditName} (Everything only)`}
                </option>
              ))}
            </select>
          </label>
          <div className="community-actions">
            <button type="button" className="secondary" onClick={copyConfig} disabled={!canReadSelected || saving}>Copy Config</button>
            <button type="button" className="secondary" onClick={requestPaste} disabled={!copied || !canEditSelected || copied.source === selected || saving}>Paste Config</button>
            {selected !== homeSubreddit && (
              <button type="button" className="danger" onClick={() => void disconnectSubreddit()} disabled={connecting || saving}>Disconnect</button>
            )}
          </div>
          {pasteConfirm && copied && (
            <div className="confirm-box" role="alertdialog" aria-label="Replace configuration">
              <p>Replace r/{selected} with the config copied from r/{copied.source}? This overwrites its buttons, welcome media, backgrounds, and label styles.</p>
              <div className="community-actions">
                <button type="button" className="primary" onClick={() => void confirmPaste()} disabled={saving}>Replace Config</button>
                <button type="button" className="secondary" onClick={() => setPasteConfirm(false)} disabled={saving}>Cancel</button>
              </div>
            </div>
          )}
          <div className="sub-add">
            <input value={newSubreddit} onChange={(event) => setNewSubreddit(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void connectSubreddit(); }} placeholder="Subreddit name, e.g. YourSubreddit" />
            <button type="button" className="secondary" onClick={() => void connectSubreddit()} disabled={connecting}>{connecting ? 'Connecting…' : 'Connect Subreddit'}</button>
          </div>
          <p className="hint">Type a subreddit name and choose Connect Subreddit. Reddit does not provide a list of communities you moderate, so the server checks the name: the app must already be installed there, and you must have the Everything moderator permission there. Connecting copies this community’s saved configuration, not unsaved edits. Save this community first if the new post should start from changes you have not saved yet.</p>
          <p className="hint">Choose Editing to switch communities. Copy Config keeps the configuration on screen, including unsaved edits. Select another community, choose Paste Config, then Replace Config to overwrite it. Disconnect removes a community from this panel and keeps its navigation post.</p>
          {selectedCommunity?.followsHome && selected !== homeSubreddit && (
            <p className="hint">r/{selected} still shows this community’s saved configuration. Saving stores an independent copy on its navigation post.</p>
          )}
          {selectedCommunity?.postId && selected !== homeSubreddit && (
            <div className="targets"><div className="target"><span>r/{selected}</span><small>{selectedCommunity.postId}</small></div></div>
          )}
          {targets.filter((target) => !communities.some((community) => community.subredditName === target.subredditName)).length > 0 && (
            <p className="hint">Previously connected navigation posts are remembered, so connecting the same subreddit again updates that post.</p>
          )}
        </section>
        {canReadSelected ? (
        <fieldset className="editor-lock" disabled={!canEditSelected}>
        {!canEditSelected && <p className="hint">You can copy this configuration. Only a moderator with Everything in r/{selected} can change or publish it.</p>}
        <section className="section">
          <div className="section-title"><h2>Welcome Screen</h2><span>{welcomeUrls.length} item{welcomeUrls.length === 1 ? '' : 's'}</span></div>
          <div className="upload-row">
            <div className="welcome-gif-grid">
              {welcomeUrls.map((url, index) => (
                <div className="welcome-gif-card" key={`${url}-${index}`}>
                  <img src={url} className="preview-gif" alt={`Welcome media ${index + 1}`} />
                  <label className="welcome-gif-fit">Display
                    <select
                      value={config.welcomeGifFitByUrl?.[url] ?? 'natural'}
                      onChange={(event) => setConfig((current) => ({
                        ...current,
                        welcomeGifFitByUrl: { ...(current.welcomeGifFitByUrl ?? {}), [url]: event.target.value as WelcomeGifFit },
                      }))}
                    >
                      <option value="natural">Large / fill height</option>
                      <option value="canvas">Fit app canvas</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setConfig((current) => {
                      const variants = (current.welcomeGifVariants?.length ? current.welcomeGifVariants : current.welcomeGif ? [current.welcomeGif] : []).filter((_, itemIndex) => itemIndex !== index);
                      const fits = { ...(current.welcomeGifFitByUrl ?? {}) };
                      delete fits[url];
                      return { ...current, welcomeGif: variants[0], welcomeGifVariants: variants, welcomeGifFitByUrl: fits };
                    })}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {welcomeUrls.length === 0 && <div className="empty-preview">No welcome media configured</div>}
            </div>
            <div>
              <button type="button" className="secondary" onClick={() => void uploadMedia('welcome')}>Add Welcome Media</button>
              {welcomeUrls.length > 0 && (
                <button type="button" className="ghost" onClick={() => setConfig((current) => ({ ...current, welcomeGif: undefined, welcomeGifVariants: [], welcomeGifFitByUrl: {} }))}>Clear Welcome Media</button>
              )}
              <p className="hint">Add SFW images or GIFs. One is selected at random each time the expanded post loads. Remove them all to skip the intro.</p>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="section-title"><h2>Background</h2><span>Petals or custom media</span></div>
          <label className="background-style-select">Background type
            <select value={config.backgroundStyle ?? 'petals'} onChange={(event) => setConfig((current) => ({ ...current, backgroundStyle: event.target.value as BackgroundStyle }))}>
              <option value="petals">Flower Petals</option>
              <option value="custom">Custom Background</option>
            </select>
          </label>
          {(config.backgroundStyle ?? 'petals') === 'custom' && (
            <label className="background-style-select">Custom media
              <select
                value={config.customBackground ?? ''}
                onChange={(event) => setConfig((current) => ({
                  ...current,
                  customBackground: event.target.value || undefined,
                  backgroundStyle: event.target.value ? 'custom' : current.backgroundStyle,
                }))}
              >
                <option value="">Choose an image or GIF...</option>
                {config.assets.filter((asset) => asset.type === 'image' || asset.type === 'gif').map((asset) => (
                  <option key={asset.id} value={asset.url}>{asset.name} ({asset.type.toUpperCase()})</option>
                ))}
              </select>
            </label>
          )}
          <div className="background-actions">
            <button type="button" className="secondary" onClick={() => void uploadMedia('background')}>Add Custom Background</button>
            {config.customBackground && (
              <button type="button" className="ghost" onClick={() => setConfig((current) => ({ ...current, customBackground: undefined, backgroundStyle: 'petals' }))}>Clear Custom Background</button>
            )}
          </div>
          <p className="hint">Custom backgrounds use Reddit-hosted images or GIFs from the asset library.</p>
        </section>
        <section className="section">
          <div className="section-title"><h2>Asset Library</h2><span>{config.assets.length} reusable assets</span></div>
          <div className="asset-grid">
            {config.assets.map((asset) => (
              <div className="asset-card" key={asset.id}>
                <img src={asset.url} alt="" />
                <div className="asset-card__info"><strong>{asset.name}</strong><small>{asset.type}</small></div>
                <button type="button" className="danger asset-card__delete" onClick={() => removeAsset(asset.id)}>Delete</button>
              </div>
            ))}
            {config.assets.length === 0 && <div className="empty-preview">No reusable assets configured</div>}
          </div>
          <p className="hint">Assets are uploaded through Reddit and can be reused for welcome media, backgrounds, and icons. Deleting an asset clears references to it. Save this community to store the change.</p>
        </section>
        <section className="section">
          <div className="section-title"><h2>Navigation Buttons</h2><button type="button" className="secondary" onClick={addButton}>+ Add Subreddit Button</button></div>
          <p className="hint">A built-in Subreddit Menu button is always shown on the public navigation post. It opens this subreddit’s /about/ page and cannot be edited here. Buttons below accept direct Reddit subreddit links only.</p>
          <div className="buttons">
            {config.buttons.map((button, index) => (
              <article className="button-card" key={button.id}>
                <div className="button-head">
                  <strong>{index + 1}. {button.label}</strong>
                  <div className="button-head__actions">
                    <label className="check">
                      <input type="checkbox" checked={button.enabled !== false} onChange={(event) => updateButton(button.id, { enabled: event.target.checked })} />
                      Enabled
                    </label>
                    <button type="button" className="danger" onClick={() => removeButton(button.id)}>Remove</button>
                  </div>
                </div>
                <div className="fields">
                  <label>Label
                    <input maxLength={BUTTON_LABEL_MAX} value={button.label} onChange={(event) => updateButton(button.id, { label: event.target.value })} />
                  </label>
                  <label className="wide">Subreddit URL
                    <input
                      value={button.url ?? ''}
                      onChange={(event) => updateButton(button.id, { url: event.target.value })}
                      onBlur={() => {
                        const subredditName = getSubredditNameFromUrl(button.url);
                        if (subredditName) updateButton(button.id, { url: getSubredditLink(subredditName) });
                      }}
                      placeholder="https://www.reddit.com/r/YourSubreddit/"
                      aria-invalid={Boolean(button.url && !getSubredditNameFromUrl(button.url))}
                    />
                  </label>
                  {!button.url && <p className="hint wide">Required. Enter a direct Reddit subreddit URL. Posts, profiles, and external links are not accepted.</p>}
                  {Boolean(button.url && !getSubredditNameFromUrl(button.url)) && <p className="hint wide validation-error">Invalid destination. Use a direct https://www.reddit.com/r/SubredditName/ link only.</p>}
                  <label>Accent
                    <input type="color" value={colorValue(button.accent, '#ffffff')} onChange={(event) => updateButton(button.id, { accent: event.target.value })} />
                  </label>
                  <label>Outline
                    <select value={button.outlineStyle ?? 'electric'} onChange={(event) => updateButton(button.id, { outlineStyle: event.target.value as 'electric' | 'glow' | 'none' })}>
                      {OUTLINE_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
                    </select>
                  </label>
                  <label>Label color
                    <input type="color" value={colorValue(button.labelColor, '#ffffff')} onChange={(event) => updateButton(button.id, { labelColor: event.target.value })} />
                  </label>
                  <label>Font
                    <select value={button.labelFont ?? LABEL_FONTS[0].value} onChange={(event) => updateButton(button.id, { labelFont: event.target.value })}>
                      {LABEL_FONTS.map((font) => <option key={font.id} value={font.value}>{font.label}</option>)}
                    </select>
                  </label>
                  <label>Label size
                    <select value={button.labelSize ?? LABEL_SIZES[1].value} onChange={(event) => updateButton(button.id, { labelSize: event.target.value })}>
                      {LABEL_SIZES.map((size) => <option key={size.id} value={size.value}>{size.label}</option>)}
                    </select>
                  </label>
                  <label>Label weight
                    <select value={button.labelWeight ?? 800} onChange={(event) => updateButton(button.id, { labelWeight: Number(event.target.value) })}>
                      {LABEL_WEIGHTS.map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                    </select>
                  </label>
                  <label className="wide">Gradient
                    <input value={button.backgroundGradient ?? ''} onChange={(event) => updateButton(button.id, { backgroundGradient: event.target.value })} placeholder="linear-gradient(120deg,#1b1b2f,#3d2c63,#090a12)" />
                  </label>
                </div>
                <div className="media-row">
                  <button type="button" className="secondary" onClick={() => void uploadMedia('background', button.id)}>Upload Background</button>
                  <button type="button" className="secondary" onClick={() => void uploadMedia('icon', button.id)}>Upload Icon</button>
                  <label>Existing Background
                    <select value={button.background ?? ''} onChange={(event) => updateButton(button.id, { background: event.target.value || undefined })}>
                      <option value="">None</option>
                      {config.assets.map((asset) => <option key={asset.id} value={asset.url}>{asset.name}</option>)}
                    </select>
                  </label>
                  <label>Existing Icon
                    <select value={button.icon ?? ''} onChange={(event) => updateButton(button.id, { icon: event.target.value || undefined })}>
                      <option value="">None</option>
                      {config.assets.map((asset) => <option key={asset.id} value={asset.url}>{asset.name}</option>)}
                    </select>
                  </label>
                  {button.background && <img src={button.background} className="thumb" alt="" />}
                  {button.icon && <img src={button.icon} className="thumb icon-thumb" alt="" />}
                </div>
                <div className="transform">
                  <div className="section-title"><h3>Background Fit</h3><span>Drag to move, corners to scale</span></div>
                  <div className="fields">
                    <label>Position X
                      <input type="number" min="0" max="100" value={button.backgroundPositionX ?? 50} onChange={(event) => updateButton(button.id, { backgroundPositionX: Number(event.target.value) })} />
                    </label>
                    <label>Position Y
                      <input type="number" min="0" max="100" value={button.backgroundPositionY ?? 50} onChange={(event) => updateButton(button.id, { backgroundPositionY: Number(event.target.value) })} />
                    </label>
                    <label>Scale
                      <input type="number" min="0.5" max="3" step="0.05" value={button.backgroundScale ?? 1} onChange={(event) => updateButton(button.id, { backgroundScale: Number(event.target.value) })} />
                    </label>
                  </div>
                  <BackgroundEditor button={button} onChange={(patch) => updateButton(button.id, patch)} />
                  <p className="hint">The button frame stays fixed. Drag the preview to move the image, or use the corners to scale it.</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        </fieldset>
        ) : (
          <section className="section">
            <h2>Configuration hidden</h2>
            <p className="hint">Only a moderator with Everything in r/{selected} can view this configuration.</p>
          </section>
        )}
        {accessLevel === 'everything' ? (
          <section className="section">
            <div className="section-title">
              <h2>Moderator Access</h2>
              <button type="button" className="secondary" onClick={() => void refreshModeratorRoster()} disabled={accessRefreshing}>{accessRefreshing ? 'Scanning…' : 'Scan Mod Team'}</button>
            </div>
            <p className="hint">Only a moderator with Everything can grant or revoke admin access. The live moderator list is checked before every grant, and a moderator who leaves the team loses access immediately. Replacing this panel clears every grant. Several moderators can have Everything, and any of them can change grants.</p>
            <div className="moderator-access-list">
              {moderators.map((moderator) => {
                const granted = delegates.includes(moderator.username);
                return (
                  <div className="moderator-access-row" key={moderator.username}>
                    <div>
                      <strong>u/{moderator.username}</strong>
                      <small>{moderator.everything ? 'Everything' : granted ? 'Delegated admin' : 'Moderator'}</small>
                    </div>
                    {moderator.everything ? <span className="owner-pill">Everything</span> : (
                      <button type="button" className={granted ? 'danger' : 'secondary'} onClick={() => void setModeratorAccess(moderator.username, !granted)} disabled={accessSaving === moderator.username || accessRefreshing}>
                        {accessSaving === moderator.username ? 'Saving…' : granted ? 'Revoke Access' : 'Grant Access'}
                      </button>
                    )}
                  </div>
                );
              })}
              {moderators.length === 0 && <p className="hint">{accessRefreshing ? 'Loading Reddit moderator roster…' : 'No moderator accounts were returned. Refresh the scan before changing access.'}</p>}
            </div>
          </section>
        ) : (
          <section className="section">
            <div className="section-title"><h2>Moderator Access</h2><span>Delegated</span></div>
            <p className="hint">A moderator with Everything granted you portal access. Reddit moderator status is rechecked on every admin request. If you leave the moderator team, or the grant is revoked, this access stops.</p>
          </section>
        )}
        <footer className="footer">
          <button type="button" className="primary" onClick={() => void save()} disabled={saving || !canEditSelected}>{saving ? 'Applying…' : `Save & Apply to r/${selected}`}</button>
          <p>Create Navigation Post remains a separate moderator action for a review post in this subreddit.</p>
        </footer>
      </div>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
