export type PortalAsset = {
  background?: string;
  backgroundGradient?: string;
  labelFont?: string;
  labelSize?: string;
  labelColor?: string;
  labelWeight?: number;
  icon?: string;
  accent?: string;
};

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
};

export type ManagedAsset = { id: string; name: string; url: string; type: 'image' | 'gif' };

export type WelcomeGifFit = 'natural' | 'canvas';
export type BackgroundStyle = 'petals' | 'custom';

export type AdminConfig = {
  version: 1;
  welcomeGif?: string;
  welcomeGifVariants?: string[];
  welcomeGifFitByUrl?: Record<string, WelcomeGifFit>;
  backgroundStyle?: BackgroundStyle;
  customBackground?: string;
  buttons: ManagedButton[];
  managedSubreddits: string[];
  assets: ManagedAsset[];
};

export type AppConfig = {
  introGifDesktop: string;
  introGifDesktopVariants?: string[];
  menuGifDesktop: string;
  introGifMobile: string;
  introGifMobileVariants?: string[];
  menuGifMobile: string;
  introGifFit: 'contain' | 'cover';
  welcomeGif?: string;
  welcomeGifVariants?: string[];
  welcomeGifFitByUrl?: Record<string, WelcomeGifFit>;
  backgroundStyle?: BackgroundStyle;
  customBackground?: string;
  buttons?: ManagedButton[];
  links: {
    discord: string;
    twitter: string;
    otherSubreddits: string[];
  };
  portals: {
    discord: PortalAsset;
    modmail: PortalAsset;
    x: PortalAsset;
    subreddits: Record<string, PortalAsset>;
    createPost: PortalAsset;
  };
};

export const APP_CONFIG: AppConfig = {
  introGifDesktop: '',
  introGifDesktopVariants: [],
  menuGifDesktop: '',
  introGifMobile: '',
  introGifMobileVariants: [],
  menuGifMobile: '',
  introGifFit: 'contain',
  links: {
    discord: '',
    twitter: '',
    otherSubreddits: [],
  },
  portals: {
    discord: {},
    modmail: {},
    x: {},
    subreddits: {},
    createPost: {},
  },
};
export const normalizeSubredditName = (subredditName?: string | null): string =>
  (subredditName ?? '').trim().replace(/^r\//i, '').toLowerCase();

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

export const getModmailLink = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName);
  return normalized ? `https://www.reddit.com/message/compose?to=r/${normalized}` : '';
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
  managedSubreddits: [],
  assets: [],
  buttons: [],
});
