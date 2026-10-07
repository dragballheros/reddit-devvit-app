import './index.css';

import { context, navigateTo } from '@devvit/web/client';
import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  APP_CONFIG,
  getModmailLink,
  getSubredditLabel,
  getSubredditTitle,
  normalizeSubredditName,
  type BackgroundStyle,
} from '../shared/subreddit';

const INTRO_DURATION_MS = 1900;
const MOBILE_INTRO_DURATION_MS = 1900;

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
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'linear-gradient(135deg, #070014, #101447 45%, #071d32)', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
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

  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

  return (
    /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry/i.test(ua) ||
    /Reddit|RedditAndroid|RedditiOS/i.test(ua) ||
    Boolean(uaMobile) ||
    window.innerWidth <= 600 ||
    coarsePointer ||
    context.client?.name === 'ANDROID' ||
    context.client?.name === 'IOS'
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
  const [configLoaded, setConfigLoaded] = useState(false);
  const isMobile = useIsMobile();
  const isAndroid = context.client?.name === 'ANDROID';
  const [activeBackgroundStyle, setActiveBackgroundStyle] = useState<Exclude<BackgroundStyle, 'all'>>('petals');

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
  const sessionGifFit = config.welcomeGifFitByUrl?.[sessionGifSrc] ?? 'natural';

  const subredditTitle = getSubredditTitle(context.subredditName);
  const subredditLabel = getSubredditLabel(context.subredditName);
  const modmailLink = getModmailLink(context.subredditName);
  const currentSubredditName = normalizeSubredditName(context.subredditName);

  useEffect(() => {
    if (!hasWelcomeGif) {
      setIsIntroHidden(true);
      return;
    }

    setIsIntroHidden(false);
    const duration = isMobile ? MOBILE_INTRO_DURATION_MS : INTRO_DURATION_MS;
    const timer = setTimeout(() => setIsIntroHidden(true), duration);
    return () => clearTimeout(timer);
  }, [hasWelcomeGif, isMobile]);

  useEffect(() => {
    const configuredStyle = config.backgroundStyle ?? 'petals';
    const styles: Array<Exclude<BackgroundStyle, 'all'>> = ['petals', 'waterfall', 'ocean', 'space'];

    if (configuredStyle !== 'all') {
      setActiveBackgroundStyle(configuredStyle);
      return;
    }

    let index = 0;
    setActiveBackgroundStyle(styles[index]);
    const timer = window.setInterval(() => {
      index = (index + 1) % styles.length;
      setActiveBackgroundStyle(styles[index]);
    }, 9000);

    return () => window.clearInterval(timer);
  }, [config.backgroundStyle]);

  const portals = useMemo(() => {
    if (!configLoaded) return [];

    const configuredButtons = (config.buttons ?? [])
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

    if (configuredButtons.length > 0) return configuredButtons;

    return [
      { label: 'Subreddit 1', accent: '#b18cff', backgroundGradient: 'linear-gradient(120deg, #1b1b2f, #3d2c63, #090a12)' },
      { label: 'Subreddit 2', accent: '#6ecbff', backgroundGradient: 'linear-gradient(120deg, #10243a, #164b63, #07121f)' },
      { label: 'Subreddit 3', accent: '#ff8fcf', backgroundGradient: 'linear-gradient(120deg, #35162f, #6b315b, #120914)' },
      { label: 'Subreddit 4', accent: '#8ff0c8', backgroundGradient: 'linear-gradient(120deg, #102f2b, #1d5c50, #071513)' },
    ].map((button) => ({
      ...button,
      onClick: () => {},
      disabled: true,
    }));
  }, [config.buttons]);

  if (!configLoaded) {
    return <div className="app app--loading" aria-busy="true" aria-label="Loading community navigation" />;
  }

  return (
    <AppErrorBoundary>
      <div className={`app ${isIntroHidden ? 'app--ready' : 'app--intro'} ${isAndroid ? 'app--android' : ''}`}>
      <section className={`menu menu--${activeBackgroundStyle}`}>
        <div className="menu__overlay" />
        <div className="menu__content">
          <div className={`menu__scene menu__scene--${activeBackgroundStyle}`} aria-hidden="true">
            {activeBackgroundStyle === 'petals' && Array.from({ length: 16 }, (_, index) => (
              <span key={index} className={`menu__petal menu__petal--${index + 1}`} />
            ))}

            {activeBackgroundStyle === 'waterfall' && (
              <>
                <span className="waterfall__moon" />
                <span className="waterfall__mist" />
                {Array.from({ length: 28 }, (_, index) => (
                  <span
                    key={index}
                    className="waterfall__stream"
                    style={{
                      '--waterfall-left': `${(index * 17) % 103}%`,
                      '--waterfall-delay': `-${(index % 11) * 0.63}s`,
                      '--waterfall-duration': `${4.8 + (index % 6) * 0.65}s`,
                      '--waterfall-height': `${45 + (index % 8) * 7}%`,
                    } as React.CSSProperties}
                  />
                ))}
                {Array.from({ length: 18 }, (_, index) => (
                  <span
                    key={index}
                    className="waterfall__spark"
                    style={{
                      '--waterfall-left': `${(index * 23) % 100}%`,
                      '--waterfall-delay': `-${(index % 9) * 0.8}s`,
                    } as React.CSSProperties}
                  />
                ))}
              </>
            )}

            {activeBackgroundStyle === 'ocean' && (
              <>
                <span className="ocean__sun-glow" />
                <span className="ocean__horizon" />
                <span className="ocean__wave ocean__wave--one" />
                <span className="ocean__wave ocean__wave--two" />
                <span className="ocean__wave ocean__wave--three" />
                {Array.from({ length: 22 }, (_, index) => (
                  <span
                    key={index}
                    className="ocean__bubble"
                    style={{
                      '--ocean-left': `${(index * 19) % 101}%`,
                      '--ocean-delay': `-${(index % 12) * 0.72}s`,
                      '--ocean-duration': `${5.5 + (index % 7) * 0.8}s`,
                      '--ocean-size': `${4 + (index % 5) * 2}px`,
                    } as React.CSSProperties}
                  />
                ))}
                {Array.from({ length: 10 }, (_, index) => (
                  <span
                    key={index}
                    className="ocean__shimmer"
                    style={{
                      '--ocean-left': `${(index * 31) % 100}%`,
                      '--ocean-delay': `-${(index % 7) * 1.1}s`,
                    } as React.CSSProperties}
                  />
                ))}
              </>
            )}

            {activeBackgroundStyle === 'space' && (
              <>
                <span className="space__nebula space__nebula--one" />
                <span className="space__nebula space__nebula--two" />
                <span className="space__nebula space__nebula--three" />
                {Array.from({ length: 70 }, (_, index) => (
                  <span
                    key={index}
                    className="space__star"
                    style={{
                      '--space-left': `${(index * 37) % 101}%`,
                      '--space-top': `${(index * 61) % 97}%`,
                      '--space-delay': `-${(index % 13) * 0.47}s`,
                      '--space-size': `${1 + (index % 4) * 0.75}px`,
                    } as React.CSSProperties}
                  />
                ))}
                {Array.from({ length: 5 }, (_, index) => (
                  <span
                    key={index}
                    className="space__shooting-star"
                    style={{
                      '--space-left': `${10 + (index * 19) % 78}%`,
                      '--space-top': `${10 + (index * 17) % 55}%`,
                      '--space-delay': `-${index * 2.6}s`,
                    } as React.CSSProperties}
                  />
                ))}
              </>
            )}
          </div>
          <header className="menu__header">
            <p className="menu__eyebrow">{subredditLabel}</p>
            <h1 className="menu__title">Welcome {context.username ?? 'traveler'}</h1>
          </header>

          <div className="portal-grid" aria-label="Community navigation">
            {portals.map((portal, index) => (
              <PortalButton key={portal.label} {...portal} index={index} />
            ))}
          </div>
        </div>
      </section>

      {hasWelcomeGif && (
        <section className={`intro ${isIntroHidden ? 'intro--hidden' : ''}`}>
          <img
            className="intro__media intro__media--wide"
            src={sessionGifSrc}
            alt="Welcome animation"
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            onError={() => setIsIntroHidden(true)}
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
      )}
      </div>
    </AppErrorBoundary>
  );
};
