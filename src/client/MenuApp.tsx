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
  backgroundGradient?: string;
  icon?: string;
  accent?: string;
  labelFont?: string;
  labelSize?: string;
  labelColor?: string;
  labelWeight?: number;
  index: number;
  disabled?: boolean;
  backgroundPositionX?: number;
  backgroundPositionY?: number;
  backgroundScale?: number;
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
  backgroundGradient,
  icon,
  accent = '#ffffff',
  labelFont,
  labelSize,
  labelColor,
  labelWeight,
  index,
  disabled = false,
  backgroundPositionX = 50,
  backgroundPositionY = 50,
  backgroundScale = 1,
}: PortalButtonProps) => {
  return (
    <button
      className={`portal-button${background ? ' portal-button--image' : ''}`}
      style={
        {
          '--portal-accent': accent,
          '--portal-index': index,
          '--portal-gradient': backgroundGradient ?? 'linear-gradient(120deg, #111827, #000000)',
          '--portal-label-font': labelFont ?? 'Inter, ui-sans-serif, system-ui, sans-serif',
          '--portal-label-size': labelSize ?? 'clamp(0.9rem, 2.1vw, 1.35rem)',
          '--portal-label-color': labelColor ?? 'rgba(255,255,255,0.97)',
          '--portal-label-weight': labelWeight ?? 800,
        } as React.CSSProperties
      }
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-busy={disabled}
    >
      <span
        className={`portal-button__background${background ? '' : ' portal-button__background--empty'}`}
        style={{ backgroundImage: background ? `url("${background}")` : backgroundGradient, backgroundPosition: `${backgroundPositionX}% ${backgroundPositionY}%`, transform: `scale(${backgroundScale})` }}
        aria-hidden="true"
      />
      <span className="portal-button__vignette" aria-hidden="true" />
      <span className="portal-button__icon-shell" aria-hidden="true">
        {icon ? (
          <img className="portal-button__icon" src={icon} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="portal-button__icon-placeholder" />
        )}
      </span>
      <span className="portal-button__content">
        <span className="portal-button__label">{label}</span>
      </span>
      <span className="portal-button__energy portal-button__energy--one" aria-hidden="true" />
      <span className="portal-button__energy portal-button__energy--two" aria-hidden="true" />
    </button>
  );
};

export const MenuApp = () => {
  const [isIntroHidden, setIsIntroHidden] = useState(false);
  const [config, setConfig] = useState(APP_CONFIG);
  const isMobile = useIsMobile();
  const isAndroid = context.client?.name === 'ANDROID';

  useEffect(() => {
    let active = true;
    fetch('/api/runtime-config')
      .then((response) => response.json())
      .then((payload: { config?: typeof APP_CONFIG }) => {
        if (active && payload.config) setConfig(payload.config);
      })
      .catch((error) => console.warn('Using bundled portal configuration:', error));
    return () => { active = false; };
  }, []);

  const sessionGifSrc = useMemo(() => {
    const variants = config.welcomeGif
      ? [config.welcomeGif]
      : isMobile
        ? config.introGifMobileVariants ?? [config.introGifMobile]
        : config.introGifDesktopVariants ?? [config.introGifDesktop];
    return pickRandomItem(variants, isMobile ? config.introGifMobile : config.introGifDesktop);
  }, [isMobile, config]);

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
    if (config.buttons?.length) {
      return config.buttons
        .filter((button) => button.enabled !== false)
        .map((button) => ({
          label: button.label,
          background: button.background,
          backgroundGradient: button.backgroundGradient,
          icon: button.icon,
          accent: button.accent,
          labelFont: button.labelFont,
          labelSize: button.labelSize,
          labelColor: button.labelColor,
          labelWeight: button.labelWeight,
          backgroundPositionX: button.backgroundPositionX,
          backgroundPositionY: button.backgroundPositionY,
          backgroundScale: button.backgroundScale,
          onClick: () => {
            if (button.type === 'modmail') navigateTo(getModmailLink(context.subredditName));
            else if (button.url) navigateTo(button.url);
          },
        }));
    }

    const subredditPortals = config.links.otherSubreddits
      .filter((name) => normalizeSubredditName(name) !== currentSubredditName)
      .map((name) => {
        const key = normalizeSubredditName(name);
        const asset = config.portals.subreddits[key];
        return {
          label: name,
          background: asset?.background,
          backgroundGradient: asset?.backgroundGradient,
          icon: asset?.icon,
          accent: asset?.accent,
          labelFont: asset?.labelFont,
          labelSize: asset?.labelSize,
          labelColor: asset?.labelColor,
          labelWeight: asset?.labelWeight,
          onClick: () => navigateTo(`https://www.reddit.com/r/${name}/`),
        };
      });

    return [
      {
        label: 'AnimeH34',
        background: config.portals.animeh34.background,
        icon: config.portals.animeh34.icon,
        accent: config.portals.animeh34.accent,
        labelFont: config.portals.animeh34.labelFont,
        labelSize: config.portals.animeh34.labelSize,
        labelColor: config.portals.animeh34.labelColor,
        labelWeight: config.portals.animeh34.labelWeight,
        onClick: () => navigateTo('https://www.reddit.com/r/AnimeH34/'),
      },
      ...subredditPortals,
      {
        label: 'X/Twitter (ElfariaNSFW)',
        background: config.portals.x.background,
        backgroundGradient: config.portals.x.backgroundGradient,
        icon: config.portals.x.icon,
        accent: config.portals.x.accent,
        labelFont: config.portals.x.labelFont,
        labelSize: config.portals.x.labelSize,
        labelColor: config.portals.x.labelColor,
        labelWeight: config.portals.x.labelWeight,
        onClick: () => navigateTo(config.links.twitter),
      },
      {
        label: 'AnimeH34 Discord',
        background: config.portals.discord.background,
        backgroundGradient: config.portals.discord.backgroundGradient,
        icon: config.portals.discord.icon,
        accent: config.portals.discord.accent,
        labelFont: config.portals.discord.labelFont,
        labelSize: config.portals.discord.labelSize,
        labelColor: config.portals.discord.labelColor,
        labelWeight: config.portals.discord.labelWeight,
        onClick: () => navigateTo(config.links.discord),
      },
      {
        label: 'Modmail',
        background: config.portals.modmail.background,
        backgroundGradient: config.portals.modmail.backgroundGradient,
        icon: config.portals.modmail.icon,
        accent: config.portals.modmail.accent,
        labelFont: config.portals.modmail.labelFont,
        labelSize: config.portals.modmail.labelSize,
        labelColor: config.portals.modmail.labelColor,
        labelWeight: config.portals.modmail.labelWeight,
        onClick: () => navigateTo(modmailLink),
      },
    ];
  }, [currentSubredditName, modmailLink, config]);

  return (
    <div className={`app ${isIntroHidden ? 'app--ready' : 'app--intro'} ${isAndroid ? 'app--android' : ''}`}>
      <section className="menu">
        <div className="menu__overlay" />
        <div className="menu__content">
          <div className="menu__petals" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => (
              <span
                key={index}
                className={`menu__petal menu__petal--${index + 1}`}
              />
            ))}
          </div>
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
          style={{ objectFit: config.introGifFit }}
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
