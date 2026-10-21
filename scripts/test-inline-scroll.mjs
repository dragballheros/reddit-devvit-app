import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 5191;
const ROOT = new URL('..', import.meta.url).pathname;
const ARTIFACTS = process.env.INLINE_SCROLL_ARTIFACTS
  || (existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts/screenshots' : '');

const findChrome = () => {
  if (process.env.CHROME_PATH || process.env.CHROME_BIN) return process.env.CHROME_PATH || process.env.CHROME_BIN;
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chrome', 'chromium', 'chromium-browser']) {
    try {
      const found = execFileSync('which', [bin], { encoding: 'utf8' }).trim();
      if (found) return found;
    } catch {
      // Try the next binary name.
    }
  }
  throw new Error('Chrome is required for the inline scroll check.');
};

const button = (id, label) => ({
  id,
  label,
  type: 'subreddit',
  url: 'https://www.reddit.com/r/example/',
  enabled: true,
  outlineStyle: 'electric',
  backgroundGradient: 'linear-gradient(120deg,#1b1b2f,#3d2c63,#090a12)',
});

const menuConfig = (welcome) => ({
  config: {
    version: 1,
    welcomeGif: welcome,
    welcomeGifVariants: welcome ? [welcome] : [],
    welcomeGifFitByUrl: welcome ? { [welcome]: 'blurred' } : {},
    backgroundStyle: 'petals',
    buttons: [
      button('one', 'Design Crit'),
      button('two', 'A Very Long Community Name That Should Marquee Inside The Button'),
      button('three', 'Type Foundry'),
      button('four', 'Color Studies'),
      button('five', 'Pixel Art'),
    ],
  },
});

const TINY_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

const connect = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = [];
  let id = 0;
  ws.addEventListener('open', () => resolve({
    ws,
    send(method, params = {}) {
      const messageId = ++id;
      return new Promise((res, rej) => {
        pending.set(messageId, { res, rej });
        ws.send(JSON.stringify({ id: messageId, method, params }));
      });
    },
    on(method, fn) { listeners.push({ method, fn }); },
  }));
  ws.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : String(event.data);
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
      else res(msg.result || {});
    } else if (msg.method) {
      for (const listener of listeners) if (listener.method === msg.method) listener.fn(msg.params || {});
    }
  });
  ws.addEventListener('error', () => reject(new Error('Chrome DevTools socket failed')));
});

const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', `--port=${PORT}`, 'src/client'],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
);
const chrome = spawn(
  findChrome(),
  [
    '--headless=new',
    '--remote-debugging-port=9224',
    `--user-data-dir=/tmp/chrome-inline-scroll-${process.pid}`,
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const stop = () => {
  vite.kill('SIGKILL');
  chrome.kill('SIGKILL');
};
process.on('exit', stop);

const waitFor = async (url) => {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

await Promise.all([
  waitFor(`http://127.0.0.1:${PORT}/splash.html`),
  waitFor('http://127.0.0.1:9224/json/version'),
]);

const browser = await fetch('http://127.0.0.1:9224/json/version').then((response) => response.json());
const cdp = await connect(browser.webSocketDebuggerUrl);
await cdp.send('Target.setDiscoverTargets', { discover: true });

const failures = [];
const shots = [];

const openPage = async ({ path, devvit, width, height, mobile, welcomeMode, blockModule, shot }) => {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { webSocketDebuggerUrl } = (await fetch('http://127.0.0.1:9224/json/list').then((response) => response.json()))
    .find((target) => target.id === targetId);
  const page = await connect(webSocketDebuggerUrl);
  const hung = new Set();
  page.on('Fetch.requestPaused', (params) => {
    const url = params.request?.url || '';
    const fulfill = (body, status, contentType) => page.send('Fetch.fulfillRequest', {
      requestId: params.requestId,
      responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: contentType }],
      body: Buffer.from(body).toString('base64'),
    }).catch((error) => console.error(error));
    if (url.includes('/api/runtime-config')) {
      const welcome = welcomeMode && welcomeMode !== 'none'
        ? `http://127.0.0.1:${PORT}/welcome-trap.gif`
        : undefined;
      fulfill(JSON.stringify(menuConfig(welcome)), 200, 'application/json');
      return;
    }
    if (url.includes('welcome-trap.gif')) {
      if (welcomeMode === 'loading') {
        hung.add(params.requestId);
        return;
      }
      if (welcomeMode === 'error') {
        fulfill('missing', 404, 'text/plain');
        return;
      }
      page.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/gif' }],
        body: TINY_GIF.toString('base64'),
      }).catch((error) => console.error(error));
      return;
    }
    if (blockModule && url.includes('splash.tsx')) {
      fulfill('blocked', 404, 'text/plain');
      return;
    }
    page.send('Fetch.continueRequest', { requestId: params.requestId }).catch((error) => console.error(error));
  });
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const devvitSource = devvit === false
    ? 'delete globalThis.devvit;'
    : `globalThis.devvit = { webViewMode: ${devvit ?? 1}, context: { username: 'modowner', subredditName: 'communitypro_dev', client: { name: ${mobile ? "'ANDROID'" : "'WEB'"} } }, entrypoints: { default: 'http://127.0.0.1:${PORT}/splash.html', admin: 'http://127.0.0.1:${PORT}/admin.html' }, experiments: {}, token: 'local' };`;
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__gestureListeners = [];
      const __origAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'touchmove' || type === 'wheel') {
          const passive = options === true || Boolean(options && options.passive);
          window.__gestureListeners.push({ type: String(type), passive });
        }
        return __origAdd.call(this, type, listener, options);
      };
      ${devvitSource}
    `,
  });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: Boolean(mobile),
  });
  const loaded = new Promise((resolve) => page.on('Page.loadEventFired', () => resolve()));
  await page.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}` });
  await loaded;
  return { page, hung, targetId, shot, width, height };
};

const audit = async (session, label) => {
  const started = Date.now();
  let report;
  while (Date.now() - started < 8000) {
    const result = await session.page.send('Runtime.evaluate', {
      expression: `(() => {
        const interesting = document.querySelector('.app, .admin, .boot-fallback, .app-error');
        if (!interesting) return null;
        const bad = [];
        const root = document.documentElement;
        if (root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1) {
          bad.push('document ' + root.scrollWidth + 'x' + root.scrollHeight + ' in ' + root.clientWidth + 'x' + root.clientHeight);
        }
        for (const el of document.querySelectorAll('*')) {
          const style = getComputedStyle(el);
          const scrollable = (axis, size, client) => (
            (axis === 'auto' || axis === 'scroll' || axis === 'overlay') && size > client + 1
          );
          if (scrollable(style.overflowY, el.scrollHeight, el.clientHeight) || scrollable(style.overflowX, el.scrollWidth, el.clientWidth)) {
            bad.push('scrollable ' + (el.className || el.tagName) + ' ' + style.overflowX + '/' + style.overflowY);
          }
          const rect = el.getBoundingClientRect();
          const covers = rect.width >= root.clientWidth * 0.9 && rect.height >= root.clientHeight * 0.9;
          if (covers && (style.touchAction === 'none' || style.overscrollBehavior === 'none' || style.overscrollBehaviorX === 'none' || style.overscrollBehaviorY === 'none')) {
            bad.push('gesture ' + (el.className || el.tagName) + ' touch=' + style.touchAction + ' overscroll=' + style.overscrollBehavior);
          }
        }
        for (const el of document.querySelectorAll('.portal-button, .subreddit-menu, .primary, .boot-fallback, .intro__loader, .app-error')) {
          if (el.closest('[aria-hidden="true"]')) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (rect.bottom > root.clientHeight + 1 || rect.right > root.clientWidth + 1 || rect.top < -1 || rect.left < -1) {
            bad.push('outside ' + (el.id || el.className || el.tagName) + ' ' + Math.round(rect.top) + ',' + Math.round(rect.left) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
          }
        }
        return {
          bad,
          listeners: (window.__gestureListeners || []).filter((listener) => !listener.passive).map((listener) => listener.type),
          text: document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 180),
        };
      })()`,
      returnByValue: true,
    });
    report = result.result?.value;
    if (report) break;
    await delay(100);
  }
  if (!report) {
    failures.push(`${label}: page did not render`);
    return;
  }
  const problems = [
    ...report.bad,
    ...report.listeners.map((type) => `listener ${type}`),
  ];
  if (problems.length > 0) failures.push(`${label}: ${problems.join('; ')} | ${report.text}`);
  else console.log(`ok ${label}`);
  if (session.shot && problems.length === 0 && ARTIFACTS) {
    const image = await session.page.send('Page.captureScreenshot', { format: 'png' });
    const file = `${ARTIFACTS}/${session.shot}.png`;
    mkdirSync(ARTIFACTS, { recursive: true });
    writeFileSync(file, Buffer.from(image.data, 'base64'));
    shots.push(file);
  }
  for (const requestId of session.hung) {
    session.page.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }).catch(() => {});
  }
  await cdp.send('Target.closeTarget', { targetId: session.targetId });
  session.page.ws.close();
};

const cases = [
  { label: 'menu mobile regular', path: '/splash.html', width: 288, height: 320, mobile: true, welcomeMode: 'none' },
  { label: 'menu mobile short tall', path: '/splash.html', width: 390, height: 350, mobile: true, welcomeMode: 'none', shot: 'inline_scroll_menu_mobile' },
  { label: 'menu desktop tall', path: '/splash.html', width: 880, height: 512, mobile: false, welcomeMode: 'none', shot: 'inline_scroll_menu_desktop' },
  { label: 'menu narrow tall', path: '/splash.html', width: 320, height: 512, mobile: true, welcomeMode: 'none' },
  { label: 'menu without host', path: '/splash.html', width: 390, height: 512, mobile: true, welcomeMode: 'none', devvit: false },
  { label: 'welcome loading', path: '/splash.html', width: 390, height: 350, mobile: true, welcomeMode: 'loading', shot: 'inline_scroll_welcome_loader' },
  { label: 'welcome error', path: '/splash.html', width: 288, height: 320, mobile: true, welcomeMode: 'error' },
  { label: 'welcome playing', path: '/splash.html', width: 880, height: 512, mobile: false, welcomeMode: 'playing', shot: 'inline_scroll_welcome_playing' },
  { label: 'boot fallback', path: '/splash.html', width: 288, height: 320, mobile: true, blockModule: true, devvit: false },
  { label: 'admin launcher mobile', path: '/admin.html', width: 288, height: 320, mobile: true, devvit: 1, shot: 'inline_scroll_admin_launcher' },
  { label: 'admin launcher desktop', path: '/admin.html', width: 880, height: 320, mobile: false, devvit: 1 },
  { label: 'admin launcher without host', path: '/admin.html', width: 360, height: 320, mobile: true, devvit: false },
];

for (const item of cases) {
  const session = await openPage(item);
  if (item.welcomeMode === 'playing') await delay(400);
  if (item.welcomeMode === 'error') await delay(300);
  await audit(session, `${item.label} ${item.width}x${item.height}`);
}

cdp.ws.close();
stop();

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('INLINE_SCROLL_CHECK_PASS');
console.log(shots.join('\n'));
process.exit(0);
