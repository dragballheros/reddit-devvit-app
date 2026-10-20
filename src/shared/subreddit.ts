export type ManagedButtonType = 'subreddit';

export type ManagedButton = {
  id: string;
  label: string;
  type: ManagedButtonType;
  url?: string;
  icon?: string;
  background?: string;
  backgroundGradient?: string;
  accent?: string;
  labelFont?: string;
  labelSize?: string;
  labelColor?: string;
  labelWeight?: number;
  backgroundPositionX?: number;
  backgroundPositionY?: number;
  backgroundScale?: number;
  enabled?: boolean;
  outlineStyle?: OutlineStyle;
};

export type ManagedAsset = { id: string; name: string; url: string; type: 'image' | 'gif' };

export type WelcomeGifFit = 'blurred' | 'side' | 'band' | 'natural' | 'canvas';
export type CardStyle = 'glass' | 'solid';

export const WELCOME_GIF_FITS = [
  { id: 'blurred', label: 'Blurred fill' },
  { id: 'side', label: 'Side blur' },
  { id: 'band', label: 'Top/bottom blur' },
  { id: 'natural', label: 'Large / fill height' },
  { id: 'canvas', label: 'Fit app canvas' },
] as const;

export const CARD_STYLES = [
  { id: 'glass', label: 'Glass' },
  { id: 'solid', label: 'Solid' },
] as const;

/** Portrait media gets side bars; widescreen media gets bars above and below. */
export const welcomeFitForAspect = (width: number, height: number): WelcomeGifFit => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'blurred';
  if (height > width * 1.05) return 'side';
  if (width > height * 1.05) return 'band';
  return 'blurred';
};
export type BackgroundStyle = 'petals' | 'custom';
export type OutlineStyle = 'electric' | 'glow' | 'none';

export const OUTLINE_STYLES = [
  { id: 'electric', label: 'Electric' },
  { id: 'glow', label: 'Glow' },
  { id: 'none', label: 'None' },
] as const;

export type AdminConfig = {
  version: 1;
  welcomeGif?: string;
  welcomeGifVariants?: string[];
  welcomeGifFitByUrl?: Record<string, WelcomeGifFit>;
  backgroundStyle?: BackgroundStyle;
  customBackground?: string;
  backgroundDim?: number;
  backgroundBlur?: boolean;
  cardStyle?: CardStyle;
  tagline?: string;
  audioUrl?: string;
  buttons: ManagedButton[];
  managedSubreddits: string[];
  assets: ManagedAsset[];
};

export type AppConfig = {
  introGifFit: 'contain' | 'cover';
  welcomeGif?: string;
  welcomeGifVariants?: string[];
  welcomeGifFitByUrl?: Record<string, WelcomeGifFit>;
  backgroundStyle?: BackgroundStyle;
  customBackground?: string;
  backgroundDim?: number;
  backgroundBlur?: boolean;
  cardStyle?: CardStyle;
  tagline?: string;
  audioUrl?: string;
  buttons?: ManagedButton[];
};

export const APP_CONFIG: AppConfig = {
  introGifFit: 'contain',
};

export const BUTTON_LABEL_MAX = 48;
export const ASSET_NAME_MAX = 60;
export const TAGLINE_MAX = 140;

export const LABEL_FONTS = [
  { id: 'sans', label: 'Sans', value: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', value: 'ui-serif, Georgia, serif' },
  { id: 'mono', label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
] as const;

export const LABEL_SIZES = [
  { id: 'small', label: 'Small', value: '0.95rem' },
  { id: 'medium', label: 'Medium', value: '1.15rem' },
  { id: 'large', label: 'Large', value: '1.35rem' },
] as const;

export const LABEL_WEIGHTS = [600, 700, 800] as const;

const LABEL_FONT_VALUES = new Set<string>(LABEL_FONTS.map((font) => font.value));
const LABEL_SIZE_VALUES = new Set<string>(LABEL_SIZES.map((size) => size.value));
const LABEL_WEIGHT_VALUES = new Set<number>(LABEL_WEIGHTS);
const OUTLINE_STYLE_VALUES = new Set<string>(OUTLINE_STYLES.map((style) => style.id));
export const normalizeSubredditName = (subredditName?: string | null): string =>
  (subredditName ?? '').trim().replace(/^r\//i, '').toLowerCase();


/** A valid Reddit post fullname, used to reject arbitrary client-supplied IDs. */
const normalizeRedditPostId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^t3_[a-z0-9]+$/i.test(value) ? value : undefined;

/** Only posts explicitly created as an admin panel are allowed to mutate config. */
export const isAdminPanelPostData = (value: unknown): boolean =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).portalAdmin === true
  );

/**
 * A navigation post that stores its own configuration. Admin panels are excluded
 * so a panel never renders as a target snapshot of itself.
 */
export const readOwnSubredditConfigPayload = (postData: unknown): string | undefined => {
  if (!postData || typeof postData !== 'object' || Array.isArray(postData)) return undefined;
  const data = postData as Record<string, unknown>;
  if (data.portalSubredditConfig !== true || data.portalAdmin === true) return undefined;
  return typeof data.portalConfig === 'string' && data.portalConfig.length > 0 ? data.portalConfig : undefined;
};

/**
 * Resolve the admin configuration for the current custom post.
 * Admin panels use their own post data; managed public posts follow their
 * server-written portalAdminPostId; legacy local posts fall back to this
 * installation's own Redis pointer. Redis itself is per-subreddit install.
 */
export const resolveRuntimeAdminPostId = (input: {
  currentPostId?: unknown;
  postData?: unknown;
  localAdminPostId?: unknown;
}): string | undefined => {
  if (isAdminPanelPostData(input.postData)) {
    return normalizeRedditPostId(input.currentPostId);
  }

  if (input.postData && typeof input.postData === 'object' && !Array.isArray(input.postData)) {
    const linkedId = normalizeRedditPostId((input.postData as Record<string, unknown>).portalAdminPostId);
    if (linkedId) return linkedId;
  }

  return normalizeRedditPostId(input.localAdminPostId);
};

/** Normalize and validate a requested managed subreddit name. */
export const normalizeManagedSubredditName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = normalizeSubredditName(value);
  return /^[a-z0-9_]{2,21}$/.test(normalized) ? normalized : undefined;
};

export const getSubredditTitle = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName);
  return normalized ? `r/${normalized}` : 'Community';
};

export const getSubredditLabel = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName);
  if (!normalized) return 'Community';

  return normalized
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const getSubredditLink = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName);
  return normalized ? `https://www.reddit.com/r/${normalized}/` : '';
};

export const getSubredditAboutLink = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName);
  return normalized ? `https://www.reddit.com/r/${normalized}/about/` : '';
};

/**
 * Accept only a direct subreddit landing-page URL on Reddit. Posts, profiles,
 * query parameters, fragments, and off-platform hosts are deliberately rejected.
 */
export const getSubredditNameFromUrl = (value?: string | null): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      !['reddit.com', 'www.reddit.com', 'old.reddit.com'].includes(hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }

    const match = parsed.pathname.match(/^\/r\/([A-Za-z0-9_]{2,21})\/?$/i);
    return match?.[1];
  } catch {
    return undefined;
  }
};

export const isValidSubredditUrl = (value?: string | null): boolean =>
  Boolean(getSubredditNameFromUrl(value));


export const getDefaultAdminConfig = (): AdminConfig => ({
  version: 1,
  welcomeGif: undefined,
  welcomeGifVariants: [],
  welcomeGifFitByUrl: {},
  backgroundStyle: 'petals',
  customBackground: undefined,
  backgroundDim: 42,
  backgroundBlur: false,
  cardStyle: 'glass',
  tagline: undefined,
  managedSubreddits: [],
  assets: [],
  buttons: [],
});

const REDDIT_MEDIA_HOST = /^(?:[a-z0-9-]+\.)*(?:redd\.it|redditmedia\.com|redditstatic\.com)$/i;

/** Reddit media uploads are served from Reddit-owned hosts. External URLs are rejected. */
const AUDIO_EXTENSION = /\.(?:mp3|ogg|wav|m4a|aac)$/i;

export const isRedditHostedAudioUrl = (value: unknown): value is string => {
  if (!isRedditHostedMediaUrl(value)) return false;
  try {
    return AUDIO_EXTENSION.test(new URL(value).pathname);
  } catch {
    return false;
  }
};

export const isRedditHostedMediaUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500 || /["'()\\\s]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      REDDIT_MEDIA_HOST.test(parsed.hostname)
    );
  } catch {
    return false;
  }
};

const sanitizeText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!text || text.length > max) return undefined;
  return text;
};

const sanitizeId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id) ? id : undefined;
};

const sanitizeColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color.toLowerCase() : undefined;
};

const sanitizeGradient = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const gradient = value.trim();
  if (!gradient) return undefined;
  if (gradient.length > 240) return undefined;
  if (!/^linear-gradient\([a-z0-9#%,.\s()-]+\)$/i.test(gradient)) return undefined;
  if (/url|expression|javascript|@import|;|\{|\}|\\|\/\*/i.test(gradient)) return undefined;
  return gradient;
};

const clampNumber = (value: unknown, min: number, max: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped * 100) / 100;
};

const optionalMedia = (
  value: unknown,
  label: string,
  mode: 'strict' | 'coerce',
  warnings: string[],
): string | undefined | null => {
  if (value == null || value === '') return undefined;
  if (isRedditHostedMediaUrl(value)) return value;
  if (mode === 'strict') return null;
  warnings.push(`${label} was removed because it is not hosted by Reddit.`);
  return undefined;
};

export type NormalizedAdminConfig = { ok: true; config: AdminConfig; warnings: string[] } | { ok: false; error: string };

/**
 * Strict mode rejects the whole configuration with a moderator-facing error.
 * Coerce mode drops legacy or unsafe pieces so a stored panel can still open.
 */
export const normalizeAdminConfig = (value: unknown, mode: 'strict' | 'coerce'): NormalizedAdminConfig => {
  const warnings: string[] = [];
  const fail = (error: string): NormalizedAdminConfig => {
    if (mode === 'coerce') {
      warnings.push(error);
      return { ok: true, config: getDefaultAdminConfig(), warnings };
    }
    return { ok: false, error };
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('Invalid admin configuration.');
  }

  const raw = value as Partial<AdminConfig>;
  if (raw.version !== 1) return fail('Unsupported configuration version.');
  if (!Array.isArray(raw.buttons)) return fail('Navigation buttons are missing.');
  if (!Array.isArray(raw.managedSubreddits)) return fail('Managed subreddits are missing.');
  if (raw.assets != null && !Array.isArray(raw.assets)) return fail('Asset library is invalid.');

  const buttons: ManagedButton[] = [];
  const seenButtonIds = new Set<string>();
  for (const [index, button] of raw.buttons.entries()) {
    if (!button || typeof button !== 'object') {
      if (mode === 'strict') return { ok: false, error: 'A navigation button is invalid.' };
      warnings.push('Removed a navigation button that could not be read.');
      continue;
    }

    const label = sanitizeText(button.label, BUTTON_LABEL_MAX);
    const subredditName = button.type === 'subreddit' ? getSubredditNameFromUrl(button.url) : undefined;
    if (!label || !subredditName) {
      const message = `“${label || `Button ${index + 1}`}” needs a label and a direct Reddit subreddit URL.`;
      if (mode === 'strict') return { ok: false, error: message };
      warnings.push(`Removed “${label || `button ${index + 1}`}” because it was not a subreddit destination.`);
      continue;
    }

    let id = sanitizeId(button.id);
    if (!id || seenButtonIds.has(id)) {
      if (mode === 'strict') return { ok: false, error: `“${label}” needs a unique button id.` };
      id = `button-${index + 1}`;
      while (seenButtonIds.has(id)) id = `${id}-x`;
    }
    seenButtonIds.add(id);

    const background = optionalMedia(button.background, `“${label}” background`, mode, warnings);
    if (background === null) return { ok: false, error: `“${label}” has a background that is not hosted by Reddit.` };
    const icon = optionalMedia(button.icon, `“${label}” icon`, mode, warnings);
    if (icon === null) return { ok: false, error: `“${label}” has an icon that is not hosted by Reddit.` };

    let backgroundGradient: string | undefined;
    if (button.backgroundGradient) {
      backgroundGradient = sanitizeGradient(button.backgroundGradient);
      if (!backgroundGradient) {
        const message = `“${label}” has a gradient that is not a plain linear-gradient.`;
        if (mode === 'strict') return { ok: false, error: message };
        warnings.push(message);
      }
    }

    let outlineStyle: OutlineStyle | undefined;
    const rawOutline = (button as { outlineStyle?: unknown }).outlineStyle;
    if (rawOutline != null && rawOutline !== '') {
      if (typeof rawOutline === 'string' && OUTLINE_STYLE_VALUES.has(rawOutline)) {
        outlineStyle = rawOutline as OutlineStyle;
      } else {
        const message = `“${label}” has an outline style that is not Electric, Glow, or None.`;
        if (mode === 'strict') return { ok: false, error: message };
        warnings.push(message);
      }
    }

    buttons.push({
      id,
      label,
      type: 'subreddit',
      url: getSubredditLink(subredditName),
      enabled: button.enabled !== false,
      outlineStyle,
      accent: sanitizeColor(button.accent),
      background,
      backgroundGradient,
      icon,
      labelFont: typeof button.labelFont === 'string' && LABEL_FONT_VALUES.has(button.labelFont) ? button.labelFont : undefined,
      labelSize: typeof button.labelSize === 'string' && LABEL_SIZE_VALUES.has(button.labelSize) ? button.labelSize : undefined,
      labelColor: sanitizeColor(button.labelColor),
      labelWeight: typeof button.labelWeight === 'number' && LABEL_WEIGHT_VALUES.has(button.labelWeight) ? button.labelWeight : undefined,
      backgroundPositionX: clampNumber(button.backgroundPositionX, 0, 100),
      backgroundPositionY: clampNumber(button.backgroundPositionY, 0, 100),
      backgroundScale: clampNumber(button.backgroundScale, 0.5, 3),
    });
  }

  const managedSubreddits: string[] = [];
  for (const name of raw.managedSubreddits) {
    const normalized = normalizeManagedSubredditName(name);
    if (!normalized) {
      const message = 'A managed subreddit name is invalid. Use 2–21 letters, numbers, or underscores.';
      if (mode === 'strict') return { ok: false, error: message };
      warnings.push(message);
      continue;
    }
    if (!managedSubreddits.includes(normalized)) managedSubreddits.push(normalized);
  }

  const assets: ManagedAsset[] = [];
  const seenAssetIds = new Set<string>();
  for (const [index, asset] of (raw.assets ?? []).entries()) {
    if (!asset || typeof asset !== 'object') {
      if (mode === 'strict') return { ok: false, error: 'An asset library entry is invalid.' };
      warnings.push('Removed an asset that could not be read.');
      continue;
    }
    const name = sanitizeText(asset.name, ASSET_NAME_MAX);
    if (!name || (asset.type !== 'image' && asset.type !== 'gif') || !isRedditHostedMediaUrl(asset.url)) {
      const message = `“${name || `Asset ${index + 1}`}” must be a named PNG, JPEG, WEBP, or GIF hosted by Reddit.`;
      if (mode === 'strict') return { ok: false, error: message };
      warnings.push(`Removed “${name || `asset ${index + 1}`}” because it is not Reddit-hosted media.`);
      continue;
    }
    let id = sanitizeId(asset.id);
    if (!id || seenAssetIds.has(id)) {
      if (mode === 'strict') return { ok: false, error: `“${name}” needs a unique asset id.` };
      id = `asset-${index + 1}`;
      while (seenAssetIds.has(id)) id = `${id}-x`;
    }
    seenAssetIds.add(id);
    assets.push({ id, name, url: asset.url, type: asset.type });
  }

  const welcomeSources = [
    ...(Array.isArray(raw.welcomeGifVariants) ? raw.welcomeGifVariants : []),
    ...(raw.welcomeGif ? [raw.welcomeGif] : []),
  ];
  const welcomeGifVariants: string[] = [];
  for (const url of welcomeSources) {
    if (!isRedditHostedMediaUrl(url)) {
      if (url) {
        const message = 'A welcome image was removed because it is not hosted by Reddit.';
        if (mode === 'strict') return { ok: false, error: message };
        warnings.push(message);
      }
      continue;
    }
    if (!welcomeGifVariants.includes(url)) welcomeGifVariants.push(url);
  }

  const welcomeGifFitByUrl: Record<string, WelcomeGifFit> = {};
  const welcomeFitValues = new Set<string>(WELCOME_GIF_FITS.map((fit) => fit.id));
  for (const url of welcomeGifVariants) {
    const fit = (raw.welcomeGifFitByUrl as Record<string, unknown> | undefined)?.[url];
    if (fit == null || fit === '') continue;
    if (typeof fit === 'string' && welcomeFitValues.has(fit)) {
      welcomeGifFitByUrl[url] = fit as WelcomeGifFit;
      continue;
    }
    const message = 'A welcome image has a display fit that is not Blurred fill, Side blur, Top/bottom blur, Large / fill height, or Fit app canvas.';
    if (mode === 'strict') return { ok: false, error: message };
    warnings.push(message);
  }

  let backgroundDim = 42;
  if (typeof raw.backgroundDim === 'number' && Number.isFinite(raw.backgroundDim)) {
    backgroundDim = Math.round(Math.min(80, Math.max(0, raw.backgroundDim)));
  } else if (raw.backgroundDim != null) {
    const message = 'Background dim must be a number from 0 to 80.';
    if (mode === 'strict') return { ok: false, error: message };
    warnings.push(message);
  }

  if (raw.backgroundBlur != null && typeof raw.backgroundBlur !== 'boolean') {
    const message = 'Background blur must be on or off.';
    if (mode === 'strict') return { ok: false, error: message };
    warnings.push(message);
  }

  let cardStyle: CardStyle = 'glass';
  const rawCard = (raw as { cardStyle?: unknown }).cardStyle;
  if (rawCard == null || rawCard === '' || rawCard === 'glass') cardStyle = 'glass';
  else if (rawCard === 'solid') cardStyle = 'solid';
  else {
    const message = 'Card style must be Glass or Solid.';
    if (mode === 'strict') return { ok: false, error: message };
    warnings.push(message);
  }

  let tagline: string | undefined;
  if (typeof raw.tagline === 'string' && raw.tagline.trim()) {
    tagline = sanitizeText(raw.tagline, TAGLINE_MAX);
    if (!tagline) {
      const message = `Tagline must be ${TAGLINE_MAX} characters or fewer.`;
      if (mode === 'strict') return { ok: false, error: message };
      warnings.push(message);
    }
  }

  let audioUrl: string | undefined;
  if (raw.audioUrl != null && raw.audioUrl !== '') {
    if (isRedditHostedAudioUrl(raw.audioUrl)) audioUrl = raw.audioUrl;
    else {
      const message = 'Background audio must be an MP3, OGG, WAV, M4A, or AAC file hosted by Reddit.';
      if (mode === 'strict') return { ok: false, error: message };
      warnings.push(message);
    }
  }

  const customBackground = optionalMedia(raw.customBackground, 'Custom background', mode, warnings);
  if (customBackground === null) {
    return { ok: false, error: 'The custom background is not hosted by Reddit.' };
  }

  return {
    ok: true,
    warnings,
    config: {
      version: 1,
      welcomeGif: welcomeGifVariants[0],
      welcomeGifVariants,
      welcomeGifFitByUrl,
      backgroundStyle: raw.backgroundStyle === 'custom' ? 'custom' : 'petals',
      customBackground,
      backgroundDim,
      backgroundBlur: raw.backgroundBlur === true,
      cardStyle,
      tagline,
      audioUrl,
      buttons,
      managedSubreddits,
      assets,
    },
  };
};
