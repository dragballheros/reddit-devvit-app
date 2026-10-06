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
  introGifMobileVariants: ['/intro-hentai-mobile.gif'],
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
      labelFont: 'Avenir Next, Segoe UI, sans-serif',
      labelSize: 'clamp(1.1rem, 2.45vw, 1.5rem)',
      labelColor: '#ffe6f3',
      labelWeight: 750,
    },
    discord: {
      backgroundGradient: 'linear-gradient(120deg, #f6c453 0%, #b83a3a 48%, #3b1d2a 100%)',
      icon: '/portals/AnimeH34Icon.png',
      accent: '#f0be46',
      labelFont: 'Georgia, Times New Roman, serif',
      labelSize: 'clamp(1rem, 2.15vw, 1.32rem)',
      labelColor: '#ffe8ae',
      labelWeight: 700,
    },
    modmail: {
      backgroundGradient: 'linear-gradient(120deg, #073a46 0%, #155c73 45%, #071521 100%)',
      icon: '/portals/ModmailIcon.svg',
      accent: '#72bfff',
      labelFont: 'Segoe UI, Inter, sans-serif',
      labelSize: 'clamp(0.98rem, 2.1vw, 1.3rem)',
      labelColor: '#d9f5ff',
      labelWeight: 700,
    },
    x: {
      backgroundGradient: 'linear-gradient(120deg, #1b1b2f 0%, #3d2c63 45%, #090a12 100%)',
      icon: '/portals/ElfariaNSFWIcon.png',
      accent: '#f2f2f4',
      labelFont: 'Inter, Helvetica Neue, sans-serif',
      labelSize: 'clamp(0.98rem, 2.1vw, 1.3rem)',
      labelColor: '#f5f5fa',
      labelWeight: 700,
    },
    subreddits: {
      alyansfw: {
        background: '/portals/AlyaNSFWBanner.png',
        icon: '/portals/AlyaNSFWIcon.jpg',
        accent: '#ff7dbc',
        labelFont: 'Trebuchet MS, Segoe UI, sans-serif',
        labelSize: 'clamp(1.02rem, 2.25vw, 1.38rem)',
        labelColor: '#ffd5e9',
        labelWeight: 700,
      },
      hentaigifs: {
        background: '/portals/HentaiGIFSBanner.jpg',
        icon: '/portals/HentaiGIFSIcon.jpg',
        accent: '#ff7dbe',
        labelFont: 'Gill Sans, Segoe UI, sans-serif',
        labelSize: 'clamp(1.04rem, 2.3vw, 1.42rem)',
        labelColor: '#f3e7ff',
        labelWeight: 650,
      },
      dragonballnsfw: {
        background: '/portals/DragonBallNSFWBanner.jpg',
        icon: '/portals/DragonBallNSFWIcon.jpg',
        accent: '#ff9b37',
        labelFont: 'DIN Alternate, Arial Narrow, sans-serif',
        labelSize: 'clamp(1.06rem, 2.4vw, 1.46rem)',
        labelColor: '#ffe2b5',
        labelWeight: 800,
      },
      animeai: {
        backgroundGradient: 'linear-gradient(120deg, #35124f 0%, #762c78 45%, #12091f 100%)',
        icon: '/portals/AnimeAIIcon.jpg',
        accent: '#aa82ff',
        labelFont: 'Avenir Next, Helvetica Neue, sans-serif',
        labelSize: 'clamp(1rem, 2.25vw, 1.4rem)',
        labelColor: '#e2d7ff',
        labelWeight: 700,
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
