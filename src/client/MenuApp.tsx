import './index.css';

import { context, navigateTo } from '@devvit/web/client';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_CONFIG,
  getModmailLink,
  getSubredditLabel,
  normalizeSubredditName,
  getSubredditTitle,
} from '../shared/subreddit';

type MenuView = 'main' | 'subs';

const INTRO_DURATION_MS = 1900;
const MOBILE_INTRO_DURATION_MS = 1900;

const pickRandomItem = (items: string[], fallback: string) => {
  if (items.length === 0) return fallback;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? fallback;
};

const getMobileSnapshot = () => {
  if (typeof window === 'undefined') {
    return context.client?.name === 'ANDROID' || context.client?.name === 'IOS';
  }

  const ua = window.navigator?.userAgent ?? '';
  const uaMobile = (window.navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    ?.userAgentData?.mobile;
  const uaMatch =
    /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry/i.test(ua) ||
    /Reddit|RedditAndroid|RedditiOS/i.test(ua);
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  const portrait = height > width;
  const orientationType =
    typeof window.screen?.orientation?.type === 'string'
      ? window.screen.orientation.type
      : '';
  const orientationMatch = orientationType.includes('portrait');
  const clientMatch = context.client?.name === 'ANDROID' || context.client?.name === 'IOS';

  return uaMatch || portrait || orientationMatch || clientMatch || Boolean(uaMobile);
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(getMobileSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia ? window.matchMedia('(max-width: 600px)') : null;
    const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
    const onChange = () => {
      const widthMatch = media?.matches ?? false;
      const coarseMatch = coarse?.matches ?? false;
      const clientMatch = context.client?.name === 'ANDROID' || context.client?.name === 'IOS';
      setIsMobile(widthMatch || coarseMatch || clientMatch || getMobileSnapshot());
    };

    onChange();
    if (media?.addEventListener) {
      media.addEventListener('change', onChange);
      coarse?.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
        coarse?.removeEventListener('change', onChange);
      };
    }

    media?.addListener(onChange);
    coarse?.addListener(onChange);
    return () => {
      media?.removeListener(onChange);
      coarse?.removeListener(onChange);
    };
  }, []);

  return isMobile;
};

type PortalButtonProps = {
  label: string;
  onClick: () => void;
  background?: string;
  icon?: string;
  accent?: string;
  onMouseEnter?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

const PortalButton = ({
  label,
  onClick,
  background,
  icon,
  accent = '#ffffff',
  onMouseEnter,
}: PortalButtonProps) => {
  return (
    <button
      className="portal-button"
      style={{ '--portal-accent': accent } as React.CSSProperties}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      aria-label={label}
    >
      <span
        className="portal-button__background"
        style={background ? { backgroundImage: `url("${background}")` } : undefined}
        aria-hidden="true"
      />
      <span className="portal-button__shade" aria-hidden="true" />
      <span className="portal-button__icon-shell" aria-hidden="true">
        {icon ? (
          <img className="portal-button__icon" src={icon} alt="" />
        ) : (
          <span className="portal-button__icon-placeholder" />
        )}
      </span>
      <span className="portal-button__content">
        <span className="portal-button__label">{label}</span>
        <span className="portal-button__line" aria-hidden="true" />
      </span>
      <span className="portal-button__energy portal-button__energy--one" aria-hidden="true" />
      <span className="portal-button__energy portal-button__energy--two" aria-hidden="true" />
    </button>
  );
};

export const MenuApp = () => {
  const [isIntroHidden, setIsIntroHidden] = useState(false);
  const [view, setView] = useState<MenuView>('main');
  const [isMobileSubsResetting, setIsMobileSubsResetting] = useState(false);
  const isMobile = useIsMobile();
  const sessionGifSrc = useMemo(() => {
    const variants = isMobile
      ? APP_CONFIG.introGifMobileVariants ?? [APP_CONFIG.introGifMobile]
      : APP_CONFIG.introGifDesktopVariants ?? [APP_CONFIG.introGifDesktop];
    const fallback = isMobile ? APP_CONFIG.introGifMobile : APP_CONFIG.introGifDesktop;
    return pickRandomItem(variants, fallback);
  }, [isMobile]);

  const subGridRef = useRef<HTMLDivElement | null>(null);
  const subsPanelRef = useRef<HTMLDivElement | null>(null);
  const subsPointerActivatedRef = useRef(false);
  const subsOpenedAtRef = useRef(0);
  const subredditTitle = getSubredditTitle(context.subredditName);
  const subredditLabel = getSubredditLabel(context.subredditName);
  const modmailLink = getModmailLink(context.subredditName);
  const currentSubredditName = normalizeSubredditName(context.subredditName);
  const isBlueGirlIntro =
    sessionGifSrc.includes('/desktop.gif') || sessionGifSrc.includes('/mobilebg.gif');

  useEffect(() => {
    const duration = isMobile ? MOBILE_INTRO_DURATION_MS : INTRO_DURATION_MS;
    const timer = setTimeout(() => setIsIntroHidden(true), duration);
    return () => clearTimeout(timer);
  }, [isMobile]);

  useEffect(() => {
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    if (view === 'subs') {
      subsOpenedAtRef.current = Date.now();
      resetTimer = setTimeout(() => setIsMobileSubsResetting(false), 0);
    } else {
      subsPointerActivatedRef.current = false;
      resetTimer = setTimeout(() => setIsMobileSubsResetting(false), 0);
    }
    return () => {
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [view]);

  const mainPortals = useMemo(
    () => [
      {
        label: 'AnimeH34 Discord',
        background: APP_CONFIG.portals.discord.background,
        icon: APP_CONFIG.portals.discord.icon,
        accent: '#f0be46',
        onClick: () => navigateTo(APP_CONFIG.links.discord),
      },
      {
        label: 'Modmail',
        background: APP_CONFIG.portals.modmail.background,
        icon: APP_CONFIG.portals.modmail.icon,
        accent: '#72bfff',
        onClick: () => navigateTo(modmailLink),
      },
      {
        label: 'x.com/ElfariaNSFW',
        background: APP_CONFIG.portals.x.background,
        icon: APP_CONFIG.portals.x.icon,
        accent: '#f2f2f4',
        onClick: () => navigateTo(APP_CONFIG.links.twitter),
      },
      {
        label: 'Other Subreddits',
        background: undefined,
        icon: undefined,
        accent: '#b18cff',
        onClick: () => setView('subs'),
      },
      {
        label: 'Create Post',
        background: undefined,
        icon: undefined,
        accent: '#b18cff',
        onClick: () =>
          navigateTo(
            `https://www.reddit.com/r/${currentSubredditName || 'hentai'}/submit`
          ),
      },
    ],
    [currentSubredditName, modmailLink]
  );

  const subPortals = useMemo(
    () =>
      APP_CONFIG.links.otherSubreddits
        .filter((subreddit) => subreddit !== currentSubredditName)
        .map((subreddit) => {
          const key = normalizeSubredditName(subreddit) as keyof typeof APP_CONFIG.portals.subreddits;
          const portal = APP_CONFIG.portals.subreddits[key];
          return {
            label: subreddit === 'AnimeH34' ? 'AnimeH34' : subreddit,
            background: portal?.background,
            icon: portal?.icon,
            accent: portal?.accent ?? '#b18cff',
            onClick: () => navigateTo(`https://www.reddit.com/r/${subreddit}`),
          };
        }),
    [currentSubredditName]
  );

  const buttons = view === 'main' ? mainPortals : subPortals;

  const ensureButtonVisible = (button: HTMLButtonElement) => {
    const container = subGridRef.current;
    if (!container) return;

    const buttonTop = button.offsetTop;
    const buttonBottom = buttonTop + button.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    const padding = 10;

    if (buttonTop - padding < viewTop) {
      container.scrollTo({ top: Math.max(0, buttonTop - padding), behavior: 'smooth' });
      return;
    }

    if (!canUseBackDownHover()) return;

    if (buttonBottom + padding > viewBottom) {
      container.scrollTo({
        top: Math.max(0, buttonBottom - container.clientHeight + padding),
        behavior: 'smooth',
      });
    }
  };

  const scrollSubsToTop = () => {
    const container = subGridRef.current;
    if (!container || !canUseBackDownHover()) return;
    container.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollSubsToBottom = () => {
    const container = subGridRef.current;
    if (!container || !canUseBackDownHover()) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  };

  const canUseSubsEdgeHover = () => Date.now() - subsOpenedAtRef.current > 300;
  const canUseBackDownHover = () => Date.now() - subsOpenedAtRef.current > 1000;

  const isNearSubsBottom = () => {
    const container = subGridRef.current;
    if (!container) return false;
    const buttons = container.querySelectorAll<HTMLButtonElement>('.portal-button');
    const lastButton = buttons[buttons.length - 1];
    if (!lastButton) return false;
    const viewBottom = container.scrollTop + container.clientHeight;
    const lastButtonBottom = lastButton.offsetTop + lastButton.offsetHeight;
    return lastButtonBottom <= viewBottom;
  };

  useEffect(() => {
    const node = subGridRef.current;
    if (!node || isMobile || view !== 'subs') return;

    node.scrollTop = 0;
    let frameId = 0;
    let currentScroll = 0;
    let targetScroll = 0;

    const tick = () => {
      currentScroll += (targetScroll - currentScroll) * 0.09;
      node.scrollTop = currentScroll;
      frameId = window.requestAnimationFrame(tick);
    };

    const handleMove = (event: MouseEvent) => {
      subsPointerActivatedRef.current = true;
      const rect = node.getBoundingClientRect();
      const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
      const relativeY = (event.clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, relativeY));
      const edgeThreshold = 0.14;

      if (!canUseBackDownHover()) {
        targetScroll = 0;
        return;
      }
      if (clamped <= edgeThreshold) {
        targetScroll = 0;
        return;
      }
      if (clamped >= 1 - edgeThreshold) {
        targetScroll = maxScroll;
        return;
      }

      const normalized = (clamped - edgeThreshold) / (1 - edgeThreshold * 2);
      targetScroll = maxScroll * normalized;
    };

    const handleLeave = () => {
      targetScroll = currentScroll;
    };

    frameId = window.requestAnimationFrame(tick);
    node.addEventListener('mousemove', handleMove);
    node.addEventListener('mouseleave', handleLeave);

    return () => {
      window.cancelAnimationFrame(frameId);
      node.removeEventListener('mousemove', handleMove);
      node.removeEventListener('mouseleave', handleLeave);
    };
  }, [isMobile, view]);

  useEffect(() => {
    const node = subGridRef.current;
    if (!node || !isMobile || view !== 'subs') return;

    node.scrollTop = 0;
    let frameId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resetTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;
    const resetStateTimer = setTimeout(() => setIsMobileSubsResetting(false), 0);

    const startLoop = () => {
      let lastTimestamp = 0;
      const pixelsPerSecond = 34;

      const tick = (timestamp: number) => {
        if (isCancelled) return;
        if (!lastTimestamp) lastTimestamp = timestamp;

        const deltaSeconds = (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;
        const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
        const nextScrollTop = Math.min(
          maxScroll,
          node.scrollTop + pixelsPerSecond * deltaSeconds
        );
        node.scrollTop = nextScrollTop;

        if (nextScrollTop >= maxScroll - 1) {
          resetTimeoutId = setTimeout(() => {
            setIsMobileSubsResetting(true);
            resetTimeoutId = setTimeout(() => {
              node.scrollTop = 0;
              setIsMobileSubsResetting(false);
              timeoutId = setTimeout(startLoop, 1400);
            }, 220);
          }, 2000);
          return;
        }

        frameId = window.requestAnimationFrame(tick);
      };

      frameId = window.requestAnimationFrame(tick);
    };

    timeoutId = setTimeout(startLoop, 2000);

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(frameId);
      if (timeoutId) clearTimeout(timeoutId);
      if (resetTimeoutId) clearTimeout(resetTimeoutId);
      clearTimeout(resetStateTimer);
    };
  }, [isMobile, view, buttons.length]);

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

          {view === 'main' ? (
            <div className="mobile__tabs">
              <button
                className={`mobile__tab ${view === 'main' ? 'mobile__tab--active' : ''}`}
                onClick={() => setView('main')}
              >
                <span className="mobile__tab-label" aria-label="Main">
                  {Array.from('Main').map((char, index) => (
                    <span
                      key={`tab-main-${char}-${index}`}
                      className="button-text-letter"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
              </button>
              <button className="mobile__tab" onClick={() => setView('subs')}>
                <span className="mobile__tab-label" aria-label="Subs">
                  {Array.from('Subs').map((char, index) => (
                    <span
                      key={`tab-subs-${char}-${index}`}
                      className="button-text-letter"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
              </button>
            </div>
          ) : null}

          <div
            key={`menu-${view}`}
            ref={view === 'subs' ? subsPanelRef : null}
            className={`menu-view-panel ${view === 'subs' ? 'menu-view-panel--subs' : ''}`}
          >
            <div
              ref={view === 'subs' ? subGridRef : null}
              className={`menu__grid portal-grid ${view === 'subs' ? 'menu__grid--scroll' : ''} ${
                view === 'subs' && isMobileSubsResetting ? 'menu__grid--mobile-resetting' : ''
              }`}
            >
              {buttons.map((button) => (
                <PortalButton
                  key={button.label}
                  label={button.label}
                  background={button.background}
                  icon={button.icon}
                  accent={button.accent}
                  onClick={button.onClick}
                  {...(view === 'subs' && !isMobile
                    ? {
                        onMouseEnter: (event: ReactMouseEvent<HTMLButtonElement>) =>
                          ensureButtonVisible(event.currentTarget),
                      }
                    : {})}
                />
              ))}
            </div>

            {view === 'subs' ? (
              <div
                className="menu__footer"
                onMouseEnter={
                  view === 'subs' && !isMobile
                    ? () => {
                        if (!canUseBackDownHover()) {
                          scrollSubsToTop();
                          return;
                        }
                        if (
                          subsPointerActivatedRef.current &&
                          canUseSubsEdgeHover() &&
                          isNearSubsBottom()
                        ) {
                          scrollSubsToBottom();
                        }
                      }
                    : undefined
                }
                onMouseMove={
                  view === 'subs' && !isMobile
                    ? () => {
                        subsPointerActivatedRef.current = true;
                        if (!canUseBackDownHover()) {
                          scrollSubsToTop();
                          return;
                        }
                        if (canUseSubsEdgeHover() && isNearSubsBottom()) {
                          scrollSubsToBottom();
                        }
                      }
                    : undefined
                }
                onMouseLeave={
                  view === 'subs' && !isMobile ? () => scrollSubsToTop() : undefined
                }
              >
                <PortalButton
                  label="Back"
                  onClick={() => setView('main')}
                  accent="#ffffff"
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`intro ${isIntroHidden ? 'intro--hidden' : ''}`}>
        <img
          className={`intro__media intro__media--wide ${isBlueGirlIntro ? 'intro__media--bluegirl' : ''}`}
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
