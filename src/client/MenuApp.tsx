import './index.css';

import { context, navigateTo } from '@devvit/web/client';
import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useWebViewMode } from './useWebViewMode';
import {
  APP_CONFIG,
  LABEL_SIZES,
  getSubredditAboutLink,
  getSubredditLabel,
  getSubredditLink,
  getSubredditNameFromUrl,
  getSubredditTitle,
  resolveLabelSize,
  type OutlineStyle,
} from '../shared/subreddit';

const INTRO_DURATION_MS = 1900;
const MOBILE_INTRO_DURATION_MS = 1900;
const INTRO_LOAD_TIMEOUT_MS = 8000;
const INLINE_PAGE_SIZE = 4;
type IntroPhase = 'loading' | 'playing' | 'done';

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Community navigation render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: 180, display: 'grid', placeItems: 'center', padding: 24, background: 'linear-gradient(135deg, #070014, #101447 45%, #071d32)', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ maxWidth: 620, width: '100%', padding: 24, borderRadius: 24, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(0,0,0,.55)', boxShadow: '0 20px 60px rgba(0,0,0,.45)' }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>Community Navigation</h1>
            <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,.75)', lineHeight: 1.5 }}>The navigation interface encountered a rendering error.</p>
            <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,.5)', fontSize: 12, wordBreak: 'break-word' }}>{this.state.error.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type PortalItem = {
  id: string;
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
  disabled?: boolean;
  backgroundPositionX?: number;
  backgroundPositionY?: number;
  backgroundScale?: number;
  outlineStyle?: OutlineStyle;
};

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
  outlineStyle?: OutlineStyle;
};

const pickRandomItem = (items: string[], fallback: string) => {
  if (items.length === 0) return fallback;
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
};

const getMobileSnapshot = () => {
  const clientName = context?.client?.name;
  if (typeof window === 'undefined') {
    return clientName === 'ANDROID' || clientName === 'IOS';
  }

  const ua = window.navigator?.userAgent ?? '';
  const uaMobile = (window.navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    ?.userAgentData?.mobile;

  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

  return (
    /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry/i.test(ua) ||
    /Reddit|RedditAndroid|RedditiOS/i.test(ua) ||
    Boolean(uaMobile) ||
    window.innerWidth <= 600 ||
    coarsePointer ||
    clientName === 'ANDROID' ||
    clientName === 'IOS'
  );
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(getMobileSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 600px)')
      : null;
    const coarse = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null;

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

const LabelText = ({ label }: { label: string }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const face = faceRef.current;
    if (!container || !face) return;

    const measure = () => {
      if (container.clientWidth <= 0) return;
      const extra = face.scrollWidth - container.clientWidth;
      setShift(extra > 1 ? Math.ceil(extra) : 0);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(face);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    }).catch(() => {});

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [label]);

  const overflowing = shift > 0;
  const duration = Math.min(16, Math.max(8, 6 + shift / 28));

  return (
    <span className="portal-button__label" ref={containerRef}>
      <span
        className={`portal-button__label-track${overflowing ? ' portal-button__label-track--marquee' : ''}`}
        style={overflowing ? {
          '--label-shift': `-${shift}px`,
          '--label-marquee-duration': `${duration}s`,
        } as React.CSSProperties : undefined}
      >
        <span className="portal-button__label-glow" aria-hidden="true">{label}</span>
        <span className="portal-button__label-face" ref={faceRef}>{label}</span>
      </span>
    </span>
  );
};

const SubredditMenuButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" id="builtin-subreddit-menu" className="subreddit-menu" onClick={onClick}>
    <span className="subreddit-menu__ring" aria-hidden="true" />
    <span className="subreddit-menu__face">
      <span className="subreddit-menu__sheen" aria-hidden="true" />
      <span className="subreddit-menu__label">Subreddit Menu</span>
    </span>
  </button>
);

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
  outlineStyle = 'electric',
}: PortalButtonProps) => {
  return (
    <button
      className={`portal-button portal-button--${outlineStyle}${background ? ' portal-button--image' : ''}`}
      style={
        {
          '--portal-accent': accent,
          '--portal-index': index,
          '--portal-gradient': backgroundGradient ?? 'linear-gradient(120deg, #111827, #000000)',
          '--portal-label-font': labelFont ?? 'Inter, ui-sans-serif, system-ui, sans-serif',
          '--portal-label-size': resolveLabelSize(labelSize) ?? LABEL_SIZES[1].value,
          '--portal-label-color': labelColor ?? 'rgba(255,255,255,0.97)',
          '--portal-label-weight': labelWeight ?? 800,
        } as React.CSSProperties
      }
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-busy={disabled}
    >
      <span className="portal-button__outline" aria-hidden="true">
        {outlineStyle === 'electric' && <span className="portal-button__outline-spin" />}
      </span>
      <span
        className={`portal-button__background${background ? '' : ' portal-button__background--empty'}`}
        style={{ backgroundImage: background ? `url("${background}")` : backgroundGradient, backgroundPosition: `${backgroundPositionX}% ${backgroundPositionY}%`, backgroundSize: background ? `${backgroundScale * 100}% auto` : undefined }}
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
        <LabelText label={label} />
      </span>
      <span className="portal-button__energy portal-button__energy--one" aria-hidden="true" />
      <span className="portal-button__energy portal-button__energy--two" aria-hidden="true" />
    </button>
  );
};

const Chevron = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const chunkPortals = <T,>(items: T[], size: number): T[][] => {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages.length > 0 ? pages : [[]];
};

export const MenuApp = () => {
  const mode = useWebViewMode();
  const [introPhase, setIntroPhase] = useState<IntroPhase>('loading');
  const [mediaReady, setMediaReady] = useState(false);
  const welcomeMediaRef = useRef<HTMLImageElement | null>(null);
  const introTokenRef = useRef(0);
  const [config, setConfig] = useState(APP_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const isMobile = useIsMobile();
  const isAndroid = context?.client?.name === 'ANDROID';

  useEffect(() => {
    let active = true;
    fetch('/api/runtime-config')
      .then((response) => response.json())
      .then((payload: { config?: typeof APP_CONFIG }) => {
        if (!active) return;
        if (payload.config) setConfig(payload.config);
        setConfigLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Using bundled community navigation configuration:', error);
        setConfig(APP_CONFIG);
        setConfigLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const configuredWelcomeGifs = useMemo(
    () =>
      (config.welcomeGifVariants ?? (config.welcomeGif ? [config.welcomeGif] : []))
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0),
    [config],
  );
  const hasWelcomeGif = configuredWelcomeGifs.length > 0;
  const sessionGifSrc = useMemo(
    () => pickRandomItem(configuredWelcomeGifs, ''),
    [configuredWelcomeGifs],
  );
  const sessionGifFit = config.welcomeGifFitByUrl?.[sessionGifSrc] ?? 'blurred';
  const blurFrame = sessionGifFit === 'blurred' || sessionGifFit === 'side' || sessionGifFit === 'band';
  const blurModifier = sessionGifFit === 'side' ? 'side' : sessionGifFit === 'band' ? 'band' : 'blurred';

  const subredditTitle = getSubredditTitle(context?.subredditName);
  const subredditLabel = getSubredditLabel(context?.subredditName);

  useEffect(() => {
    if (!configLoaded) return;
    const token = ++introTokenRef.current;
    if (!hasWelcomeGif) {
      setMediaReady(false);
      setIntroPhase('done');
      return;
    }

    setMediaReady(false);
    setIntroPhase('loading');
    const image = welcomeMediaRef.current;
    const current = () => introTokenRef.current === token;
    if (image && typeof image.decode === 'function') {
      image.decode().then(() => {
        if (!current()) return;
        if (image.naturalWidth > 0) setMediaReady(true);
        else if (image.complete) setIntroPhase('done');
      }).catch(() => {
        if (!current()) return;
        if (image.naturalWidth > 0) setMediaReady(true);
        else if (image.complete) setIntroPhase('done');
      });
    } else if (image?.complete) {
      if (image.naturalWidth > 0) setMediaReady(true);
      else setIntroPhase('done');
    }

    return () => { introTokenRef.current += 1; };
  }, [configLoaded, hasWelcomeGif, sessionGifSrc, mode]);

  useEffect(() => {
    if (!configLoaded || !hasWelcomeGif || mediaReady || introPhase !== 'loading') return;
    const token = introTokenRef.current;
    const timer = window.setTimeout(() => {
      if (introTokenRef.current !== token) return;
      introTokenRef.current += 1;
      setIntroPhase('done');
    }, INTRO_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [configLoaded, hasWelcomeGif, mediaReady, introPhase, sessionGifSrc, mode]);

  useEffect(() => {
    if (!mediaReady) return;
    const token = introTokenRef.current;
    let timer: number | undefined;
    let started = false;
    const start = () => {
      if (started || introTokenRef.current !== token || document.visibilityState === 'hidden') return;
      started = true;
      setIntroPhase('playing');
      const duration = isMobile ? MOBILE_INTRO_DURATION_MS : INTRO_DURATION_MS;
      timer = window.setTimeout(() => {
        if (introTokenRef.current === token) setIntroPhase('done');
      }, duration);
    };
    start();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [mediaReady, isMobile]);

  const onWelcomeLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const token = introTokenRef.current;
    const image = event.currentTarget;
    const finish = () => {
      if (introTokenRef.current !== token) return;
      if (image.naturalWidth > 0) setMediaReady(true);
      else if (image.complete) setIntroPhase('done');
    };
    if (typeof image.decode === 'function') {
      image.decode().then(finish).catch(finish);
      return;
    }
    finish();
  };

  const onWelcomeError = () => {
    introTokenRef.current += 1;
    setIntroPhase('done');
  };

  const openSubredditMenu = () => {
    const destination = getSubredditAboutLink(context?.subredditName);
    if (destination) navigateTo(destination);
  };

  const portals = useMemo((): PortalItem[] => {
    if (!configLoaded) return [];

    const configuredButtons = (config.buttons ?? [])
      .filter((button) =>
        button.enabled !== false &&
        button.type === 'subreddit' &&
        Boolean(getSubredditNameFromUrl(button.url))
      )
      .map((button) => ({
        id: button.id,
        label: button.label,
        background: button.background,
        backgroundGradient: button.backgroundGradient,
        icon: button.icon,
        accent: button.accent,
        labelFont: button.labelFont,
        labelSize: button.labelSize,
        labelColor: button.labelColor,
        labelWeight: button.labelWeight,
        outlineStyle: button.outlineStyle ?? 'electric',
        backgroundPositionX: button.backgroundPositionX,
        backgroundPositionY: button.backgroundPositionY,
        backgroundScale: button.backgroundScale,
        onClick: () => {
          const subredditName = getSubredditNameFromUrl(button.url);
          const destination = getSubredditLink(subredditName);
          if (destination) navigateTo(destination);
        },
      }));

    if (configuredButtons.length > 0) return configuredButtons;

    const placeholders = [
      { label: 'Subreddit 1', accent: '#b18cff', backgroundGradient: 'linear-gradient(120deg, #1b1b2f, #3d2c63, #090a12)' },
      { label: 'Subreddit 2', accent: '#6ecbff', backgroundGradient: 'linear-gradient(120deg, #10243a, #164b63, #07121f)' },
      { label: 'Subreddit 3', accent: '#ff8fcf', backgroundGradient: 'linear-gradient(120deg, #35162f, #6b315b, #120914)' },
      { label: 'Subreddit 4', accent: '#8ff0c8', backgroundGradient: 'linear-gradient(120deg, #102f2b, #1d5c50, #071513)' },
    ].map((button, index) => ({
      ...button,
      id: `placeholder-${index + 1}`,
      outlineStyle: 'electric' as const,
      onClick: () => {},
      disabled: true,
    }));

    return placeholders;
  }, [config.buttons, configLoaded]);

  const pages = useMemo(() => chunkPortals(portals, INLINE_PAGE_SIZE), [portals]);
  const pageCount = pages.length;
  const safePage = Math.min(page, Math.max(0, pageCount - 1));

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  const menuBackground = (config.backgroundStyle ?? 'petals') === 'petals' || !config.customBackground ? (
    <div className="menu__petals">
      {Array.from({ length: 16 }, (_, index) => (
        <span key={index} className={`menu__petal menu__petal--${index + 1}`} />
      ))}
    </div>
  ) : (
    <img className="menu__custom-background" src={config.customBackground} alt="" aria-hidden="true" />
  );

  const welcomeIntro = hasWelcomeGif ? (
    <section className={`intro${introPhase === 'done' ? ' intro--hidden' : ''}${introPhase === 'loading' ? ' intro--loading' : ''}`}>
      {introPhase === 'loading' && (
        <div className="intro__loader" role="status">
          <span className="intro__loader-ring" aria-hidden="true" />
          <span className="visually-hidden">Loading welcome</span>
        </div>
      )}
      {blurFrame ? (
        <div className={`intro__frame intro__frame--${blurModifier}`}>
          <img
            className="intro__fill"
            src={sessionGifSrc}
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="sync"
          />
          <div className="intro__shade" aria-hidden="true" />
          <img
            ref={welcomeMediaRef}
            className="intro__media intro__media--contained"
            src={sessionGifSrc}
            alt="Welcome animation"
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            onLoad={onWelcomeLoad}
            onError={onWelcomeError}
          />
        </div>
      ) : (
        <img
          ref={welcomeMediaRef}
          className="intro__media intro__media--wide"
          src={sessionGifSrc}
          alt="Welcome animation"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          onLoad={onWelcomeLoad}
          onError={onWelcomeError}
          style={{
            objectFit: config.introGifFit,
            ...(sessionGifFit === 'canvas'
              ? {
                  width: '100%',
                  height: '100%',
                  maxWidth: 'none',
                  maxHeight: 'none',
                }
              : {}),
          }}
        />
      )}
      {introPhase === 'playing' && (
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
      )}
    </section>
  ) : null;

  if (mode === 'inline') {
    const showPager = pageCount > 1;
    return (
      <AppErrorBoundary>
        <div className={`app app--inline ${introPhase === 'done' ? 'app--ready' : 'app--intro'} ${configLoaded ? '' : 'app--config-loading'} ${isAndroid ? 'app--android' : ''}`}>
          <section className={`menu menu--${config.backgroundStyle ?? 'petals'}`}>
            <div className="menu__overlay" />
            <div className="menu__content menu__content--inline">
              <div className={`menu__background-layer menu__background-layer--${config.backgroundStyle ?? 'petals'}`} aria-hidden="true">
                {menuBackground}
              </div>
              <header className="menu__header">
                <p className="menu__eyebrow">{subredditLabel}</p>
                <h1 className="menu__title">Welcome {context?.username ?? 'traveler'}</h1>
              </header>
              <div className="carousel" style={{ '--inline-slots': INLINE_PAGE_SIZE } as React.CSSProperties}>
                <div className="carousel__viewport">
                  <div
                    className="carousel__track"
                    style={{ transform: `translate3d(${safePage * -100}%, 0, 0)` }}
                  >
                    {pages.map((items, pageIndex) => (
                      <div className="carousel__page" key={pageIndex} aria-hidden={pageIndex !== safePage}>
                        {items.map(({ id, ...portal }, index) => (
                          <PortalButton key={id} {...portal} index={pageIndex * INLINE_PAGE_SIZE + index} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="carousel__controls">
                  {showPager && (
                    <div className="carousel__nav">
                      <button
                        type="button"
                        className={`carousel__arrow${safePage === 0 ? ' is-hidden' : ''}`}
                        aria-label="Previous"
                        aria-hidden={safePage === 0}
                        tabIndex={safePage === 0 ? -1 : 0}
                        onClick={() => setPage((current) => Math.max(0, current - 1))}
                      >
                        <Chevron direction="left" />
                      </button>
                      <p className="carousel__indicator" aria-live="polite">
                        <span className="visually-hidden">Page </span>
                        {safePage + 1} / {pageCount}
                      </p>
                      <button
                        type="button"
                        className={`carousel__arrow${safePage >= pageCount - 1 ? ' is-hidden' : ''}`}
                        aria-label="Next"
                        aria-hidden={safePage >= pageCount - 1}
                        tabIndex={safePage >= pageCount - 1 ? -1 : 0}
                        onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                      >
                        <Chevron direction="right" />
                      </button>
                    </div>
                  )}
                  <SubredditMenuButton onClick={openSubredditMenu} />
                </div>
              </div>
            </div>
          </section>
          {welcomeIntro}
        </div>
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <div className={`app app--expanded ${introPhase === 'done' ? 'app--ready' : 'app--intro'} ${configLoaded ? '' : 'app--config-loading'} ${isAndroid ? 'app--android' : ''}`}>
      <section className={`menu menu--${config.backgroundStyle ?? 'petals'}`}>
        <div className="menu__overlay" />
        <div className="menu__content">
          <div className={`menu__background-layer menu__background-layer--${config.backgroundStyle ?? 'petals'}`} aria-hidden="true">
            {menuBackground}
          </div>
          <header className="menu__header">
            <p className="menu__eyebrow">{subredditLabel}</p>
            <h1 className="menu__title">Welcome {context?.username ?? 'traveler'}</h1>
          </header>
          <SubredditMenuButton onClick={openSubredditMenu} />

          <div className="portal-grid" aria-label="Community navigation">
            {portals.map(({ id, ...portal }, index) => (
              <PortalButton key={id} {...portal} index={index} />
            ))}
          </div>
        </div>
      </section>
      {welcomeIntro}
      </div>
    </AppErrorBoundary>
  );
};
