import './index.css';

import { context, navigateTo } from '@devvit/web/client';
import { useEffect, useMemo, useState } from 'react';
import {
  APP_CONFIG,
  getModmailLink,
  getSubredditLabel,
  getSubredditTitle,
  normalizeSubredditName,
} from '../shared/subreddit';

const INTRO_DURATION_MS = 1900;
const MOBILE_INTRO_DURATION_MS = 1900;

type PortalButtonProps = {
  label: string;
  onClick: () => void;
  background?: string;
  icon?: string;
  accent?: string;
  index: number;
};

const pickRandomItem = (items: string[], fallback: string) => {
  if (items.length === 0) return fallback;
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
};

const getMobileSnapshot = () => {
  if (typeof window === 'undefined') {
    return context.client?.name === 'ANDROID' || context.client?.name === 'IOS';
  }

  const ua = window.navigator?.userAgent ?? '';
  const uaMobile = (window.navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    ?.userAgentData?.mobile;

  return (
    /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry/i.test(ua) ||
    /Reddit|RedditAndroid|RedditiOS/i.test(ua) ||
    Boolean(uaMobile) ||
    window.innerWidth <= 600 ||
    window.matchMedia?.('(pointer: coarse)').matches === true ||
    context.client?.name === 'ANDROID' ||
    context.client?.name === 'IOS'
  );
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(getMobileSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia?.('(max-width: 600px)');
    const coarse = window.matchMedia?.('(pointer: coarse)');

    const update = () => setIsMobile(getMobileSnapshot());

    update();
    media?.addEventListener('change', update);
    coarse?.addEventListener('change', update);

    return () => {
      media?.removeEventListener('change', update);
      coarse?.removeEventListener('change', update);
    };
  }, []);

  return isMobile;
};

const PortalButton = ({
  label,
  onClick,
  background,
  icon,
  accent = '#ffffff',
  index,
}: PortalButtonProps) => {
  return (
    <button
      className="portal-button"
      style={
        {
          '--portal-accent': accent,
          '--portal-index': index,
        } as React.CSSProperties
      }
      onClick={onClick}
      aria-label={label}
    >
      <span
        className={`portal-button__background${background ? '' : ' portal-button__background--empty'}`}
        style={background ? { backgroundImage: `url("${background}")` } : undefined}
        aria-hidden="true"
      />
      <span className="portal-button__vignette" aria-hidden="true" />
      <span className="portal-button__scan" aria-hidden="true" />
      <span className="portal-button__icon-shell" aria-hidden="true">
        {icon ? (
          <img className="portal-button__icon" src={icon} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="portal-button__icon-placeholder" />
        )}
      </span>
      <span className="portal-button__content">
        <span className="portal-button__label">{label}</span>
        <span className="portal-button__subline">OPEN PORTAL</span>
      </span>
      <span className="portal-button__energy portal-button__energy--one" aria-hidden="true" />
      <span className="portal-button__energy portal-button__energy--two" aria-hidden="true" />
    </button>
  );
};

export const MenuApp = () => {
  const [isIntroHidden, setIsIntroHidden] = useState(false);
  const isMobile = useIsMobile();

  const sessionGifSrc = useMemo(() => {
    const variants = isMobile
      ? APP_CONFIG.introGifMobileVariants ?? [APP_CONFIG.introGifMobile]
      : APP_CONFIG.introGifDesktopVariants ?? [APP_CONFIG.introGifDesktop];
    return pickRandomItem(
      variants,
      isMobile ? APP_CONFIG.introGifMobile : APP_CONFIG.introGifDesktop
    );
  }, [isMobile]);

  const subredditTitle = getSubredditTitle(context.subredditName);
  const subredditLabel = getSubredditLabel(context.subredditName);
  const modmailLink = getModmailLink(context.subredditName);
  const currentSubredditName = normalizeSubredditName(context.subredditName);

  useEffect(() => {
    const duration = isMobile ? MOBILE_INTRO_DURATION_MS : INTRO_DURATION_MS;
    const timer = setTimeout(() => setIsIntroHidden(true), duration);
    return () => clearTimeout(timer);
  }, [isMobile]);

  const portals = useMemo(() => {
    const subredditPortals = APP_CONFIG.links.otherSubreddits
      .filter((name) => normalizeSubredditName(name) !== currentSubredditName)
      .map((name) => {
        const key = normalizeSubredditName(name);
        const asset = APP_CONFIG.portals.subreddits[key];
        return {
          label: name,
          background: asset?.background,
          icon: asset?.icon,
          accent: asset?.accent,
          onClick: () => navigateTo(`https://www.reddit.com/r/${name}/`),
        };
      });

    return [
      {
        label: 'AnimeH34 Discord',
        background: APP_CONFIG.portals.discord.background,
        icon: APP_CONFIG.portals.discord.icon,
        accent: APP_CONFIG.portals.discord.accent,
        onClick: () => navigateTo(APP_CONFIG.links.discord),
      },
      {
        label: 'Modmail',
        background: APP_CONFIG.portals.modmail.background,
        icon: APP_CONFIG.portals.modmail.icon,
        accent: APP_CONFIG.portals.modmail.accent,
        onClick: () => navigateTo(modmailLink),
      },
      {
        label: 'x.com/ElfariaNSFW',
        background: APP_CONFIG.portals.x.background,
        icon: APP_CONFIG.portals.x.icon,
        accent: APP_CONFIG.portals.x.accent,
        onClick: () => navigateTo(APP_CONFIG.links.twitter),
      },
      ...subredditPortals,
      {
        label: 'Create Post',
        background: APP_CONFIG.portals.createPost.background,
        icon: APP_CONFIG.portals.createPost.icon,
        accent: APP_CONFIG.portals.createPost.accent,
        onClick: () =>
          navigateTo(`https://www.reddit.com/r/${currentSubredditName || 'hentai'}/submit`),
      },
    ];
  }, [currentSubredditName, modmailLink]);

  return (
    <div className={`app ${isIntroHidden ? 'app--ready' : 'app--intro'}`}>
      <section
        className="menu"
        style={{
          backgroundImage: `url(${sessionGifSrc})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundColor: '#000',
        }}
      >
        <div className="menu__overlay" />
        <div className="menu__content">
          <header className="menu__header">
            <p className="menu__eyebrow">{subredditLabel}</p>
            <h1 className="menu__title">Welcome {context.username ?? 'traveler'}</h1>
          </header>

          <div className="portal-grid" aria-label="Community portals">
            {portals.map((portal, index) => (
              <PortalButton key={portal.label} {...portal} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className={`intro ${isIntroHidden ? 'intro--hidden' : ''}`}>
        <img
          className="intro__media intro__media--wide"
          src={sessionGifSrc}
          alt="Welcome animation"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          style={{ objectFit: APP_CONFIG.introGifFit }}
        />
        <div className="intro__title" aria-label={subredditTitle}>
          {Array.from(subredditTitle).map((char, index) => (
            <span
              key={`${char}-${index}`}
              className="intro__title-letter"
              style={{ animationDelay: `${index * 0.06}s` }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
};
