export type PortalAsset = {
  background?: string;
  icon?: string;
  accent?: string;
};

export type AppConfig = {
  introGifDesktop: string;
  introGifDesktopVariants?: string[];
  menuGifDesktop: string;
  introGifMobile: string;
  introGifMobileVariants?: string[];
  menuGifMobile: string;
  introGifFit: 'contain' | 'cover';
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
  introGifDesktop: '/hentai-desktop.gif',
  introGifDesktopVariants: ['/intro-hentai-desktop.gif', '/intro-desktop.gif'],
  menuGifDesktop: '/hentai-desktop.gif',
  introGifMobile: '/hentai-mobile.gif',
  introGifMobileVariants: ['/intro-hentai-mobile.gif', '/mobilebg.gif'],
  menuGifMobile: '/hentai-mobilebg.gif',
  introGifFit: 'cover',
  links: {
    discord: 'https://discord.com/invite/WeWrKMZEa2',
    twitter: 'https://x.com/ElfariaNSFW',
    otherSubreddits: ['AlyaNSFW', 'HentaiGIFS', 'DragonBallNSFW', 'AnimeAI'],
  },
  portals: {
    discord: {
      icon: '/portals/AnimeH34Icon.png',
      accent: '#f0be46',
    },
    modmail: {
      accent: '#72bfff',
    },
    x: {
      background: '/portals/ElfariaNSFWBanner.jpg',
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
        icon: '/portals/AnimeAIIcon.jpg',
        accent: '#aa82ff',
      },
    },
    createPost: {
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
