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

export type ManagedButtonType = 'subreddit' | 'discord' | 'modmail' | 'external';

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

export type AdminConfig = {
  version: 1;
  welcomeGif?: string;
  welcomeGifVariants?: string[];
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
  buttons?: ManagedButton[];
  links: {
    discord: string;
    twitter: string;
    otherSubreddits: string[];
  };
  portals: {
    animeh34: PortalAsset;
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
    animeh34: {},
    discord: {},
    modmail: {},
    x: {},
    subreddits: {},
    createPost: {},
  },
};
export const isCatboxAssetUrl = (value?: string | null): boolean =>
  /^https:\/\/(?:files\.)?catbox\.moe\//i.test((value ?? '').trim());

export const getRenderableAssetUrl = (value?: string | null): string | undefined => {
  const url = value?.trim();
  if (!url) return undefined;
  return isCatboxAssetUrl(url)
    ? `/api/catbox-asset?url=${encodeURIComponent(url)}`
    : url;
};

export const normalizeSubredditName = (subredditName?: string | null): string =>
  (subredditName ?? '').trim().replace(/^r\//i, '').toLowerCase();

export const getSubredditTitle = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName);
  return normalized ? `r/${normalized}` : 'r/hentai';
};

export const getSubredditLabel = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName);
  if (!normalized) return 'Hentai';

  return normalized
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const getModmailLink = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName) || 'hentai';
  return `https://www.reddit.com/message/compose?to=r/${normalized}`;
};

export const getSubredditLink = (subredditName?: string | null): string => {
  const normalized = normalizeSubredditName(subredditName) || 'hentai';
  return `https://www.reddit.com/r/${normalized}`;
};


export const getDefaultAdminConfig = (): AdminConfig => ({
  version: 1,
  welcomeGif: undefined,
  welcomeGifVariants: [],
  managedSubreddits: [],
  assets: [],
  buttons: [],
});
