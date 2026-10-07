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
  introGifDesktop: '/hentai-desktop.gif',
  introGifDesktopVariants: ['/intro-hentai-desktop.gif', '/intro-desktop.gif'],
  menuGifDesktop: '/hentai-desktop.gif',
  introGifMobile: '/hentai-mobile.gif',
  introGifMobileVariants: ['/hentai-mobile.gif'],
  menuGifMobile: '/hentai-mobilebg.gif',
  introGifFit: 'cover',
  links: {
    discord: 'https://discord.com/invite/WeWrKMZEa2',
    twitter: 'https://x.com/ElfariaNSFW',
    otherSubreddits: ['AlyaNSFW', 'HentaiGIFS', 'DragonBallNSFW', 'AnimeAI'],
  },
  portals: {
    animeh34: {
      background:
        'https://styles.redditmedia.com/t5_8885uq/styles/mobileBannerImage_omhpdnktxjqh1.png',
      icon: '/portals/AnimeH34Icon.png',
      accent: '#ff5ca8',
    },
    discord: {
      backgroundGradient: 'linear-gradient(120deg, #f6c453 0%, #b83a3a 48%, #3b1d2a 100%)',
      icon: '/portals/AnimeH34Icon.png',
      accent: '#f0be46',
    },
    modmail: {
      backgroundGradient: 'linear-gradient(120deg, #073a46 0%, #155c73 45%, #071521 100%)',
      icon: '/portals/ModmailIcon.svg',
      accent: '#72bfff',
    },
    x: {
      backgroundGradient: 'linear-gradient(120deg, #1b1b2f 0%, #3d2c63 45%, #090a12 100%)',
      icon: '/portals/ElfariaNSFWIcon.png',
      accent: '#f2f2f4',
    },
    subreddits: {
      alyansfw: {
        background: '/portals/AlyaNSFWBanner.png',
        icon: '/portals/AlyaNSFWIcon.jpg',
        accent: '#ff7dbc',
              },
      hentaigifs: {
        background: '/portals/HentaiGIFSBanner.jpg',
        icon: '/portals/HentaiGIFSIcon.jpg',
        accent: '#ff7dbe',
              },
      dragonballnsfw: {
        background: '/portals/DragonBallNSFWBanner.jpg',
        icon: '/portals/DragonBallNSFWIcon.jpg',
        accent: '#ff9b37',
              },
      animeai: {
        backgroundGradient: 'linear-gradient(120deg, #35124f 0%, #762c78 45%, #12091f 100%)',
        icon: '/portals/AnimeAIIcon.jpg',
        accent: '#aa82ff',
              },
    },
    createPost: {
      icon: '/portals/RedditCreatePostIcon.svg',
      accent: '#b18cff',
    },
  },
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
  buttons: [
    {
      id: 'animeh34',
      label: 'AnimeH34',
      type: 'subreddit',
      url: 'https://www.reddit.com/r/AnimeH34/',
      background: APP_CONFIG.portals.animeh34.background,
      icon: APP_CONFIG.portals.animeh34.icon,
      accent: APP_CONFIG.portals.animeh34.accent,
      enabled: true,
    },
    ...APP_CONFIG.links.otherSubreddits.map((name) => {
      const key = normalizeSubredditName(name);
      const asset = APP_CONFIG.portals.subreddits[key];
      return {
        id: key,
        label: name,
        type: 'subreddit' as const,
        url: `https://www.reddit.com/r/${name}/`,
        background: asset?.background,
        backgroundGradient: asset?.backgroundGradient,
        icon: asset?.icon,
        accent: asset?.accent,
        enabled: true,
      };
    }),
    {
      id: 'x',
      label: 'X/Twitter (ElfariaNSFW)',
      type: 'external',
      url: APP_CONFIG.links.twitter,
      backgroundGradient: APP_CONFIG.portals.x.backgroundGradient,
      icon: APP_CONFIG.portals.x.icon,
      accent: APP_CONFIG.portals.x.accent,
      enabled: true,
    },
    {
      id: 'discord',
      label: 'Discord',
      type: 'discord',
      url: APP_CONFIG.links.discord,
      backgroundGradient: APP_CONFIG.portals.discord.backgroundGradient,
      icon: APP_CONFIG.portals.discord.icon,
      accent: APP_CONFIG.portals.discord.accent,
      enabled: true,
    },
    {
      id: 'modmail',
      label: 'Modmail',
      type: 'modmail',
      icon: APP_CONFIG.portals.modmail.icon,
      backgroundGradient: APP_CONFIG.portals.modmail.backgroundGradient,
      accent: APP_CONFIG.portals.modmail.accent,
      enabled: true,
    },
  ],
});
