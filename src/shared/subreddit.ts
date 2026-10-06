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
    otherSubreddits: ['AnimeH34', 'AnimeAI', 'HentaiGIFS'],
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
  if (!normalized) {
    return 'Hentai';
  }

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
