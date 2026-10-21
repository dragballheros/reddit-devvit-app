import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getSubredditAboutLink,
  getSubredditLink,
  getSubredditNameFromUrl,
  isAdminPanelPostData,
  isRedditHostedMediaUrl,
  normalizeAdminConfig,
  resolveLabelSize,
  welcomeFitForAspect,
  normalizeManagedSubredditName,
  readOwnSubredditConfigPayload,
  resolveRuntimeAdminPostId,
} from '../src/shared/subreddit.ts';
import {
  INSTALLATION_CHECK_CAP,
  TARGET_POST_CACHE_KEY,
  applyConnection,
  limitInstallationNames,
  planConnection,
  selectEligibleInstallations,
} from '../src/shared/installations.ts';

assert.equal(isAdminPanelPostData({ portalAdmin: true, portalConfig: 'compressed' }), true);
assert.equal(isAdminPanelPostData({ portalAdmin: false, portalConfig: 'compressed' }), false);
assert.equal(isAdminPanelPostData({ portalConfig: 'compressed' }), false);
assert.equal(isAdminPanelPostData(null), false);
assert.equal(isAdminPanelPostData('portalAdmin'), false);

assert.equal(readOwnSubredditConfigPayload({
  portalSubredditConfig: true,
  portalAdminPostId: 't3_admin',
  portalConfig: 'encoded-config',
}), 'encoded-config');
assert.equal(readOwnSubredditConfigPayload({ portalAdmin: true, portalSubredditConfig: true, portalConfig: 'encoded-config' }), undefined);
assert.equal(readOwnSubredditConfigPayload({ portalAdminPostId: 't3_admin', portalConfig: 'encoded-config' }), undefined);
assert.equal(readOwnSubredditConfigPayload({ portalSubredditConfig: true, portalConfig: '' }), undefined);
assert.equal(readOwnSubredditConfigPayload({ portalSubredditConfig: true, portalConfig: 12 }), undefined);
assert.equal(readOwnSubredditConfigPayload(null), undefined);
assert.equal(readOwnSubredditConfigPayload(['portalSubredditConfig']), undefined);

assert.equal(
  resolveRuntimeAdminPostId({
    currentPostId: 't3_sourceadmin',
    postData: { portalAdmin: true, portalAdminPostId: 't3_otheradmin' },
    localAdminPostId: 't3_localadmin',
  }),
  't3_sourceadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({
    currentPostId: 't3_targetpost',
    postData: { portalAdminPostId: 't3_sourceadmin' },
    localAdminPostId: 't3_targetadmin',
  }),
  't3_sourceadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({ currentPostId: 't3_localpost', postData: {}, localAdminPostId: 't3_localadmin' }),
  't3_localadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({ currentPostId: 't3_localpost', postData: { portalAdminPostId: 'invalid' }, localAdminPostId: 't3_localadmin' }),
  't3_localadmin',
);
assert.equal(
  resolveRuntimeAdminPostId({ currentPostId: undefined, postData: { portalAdmin: true }, localAdminPostId: 't3_localadmin' }),
  undefined,
);

assert.equal(normalizeManagedSubredditName(' r/Example_Sub '), 'example_sub');
assert.equal(normalizeManagedSubredditName('TwoLetters'), 'twoletters');
for (const invalid of ['', 'r/', 'name/with/slash', 'https://reddit.com/r/foo/', 'a', 'x'.repeat(22), null, 42]) {
  assert.equal(normalizeManagedSubredditName(invalid), undefined, String(invalid));
}

const server = await readFile(new URL('../src/server/index.ts', import.meta.url), 'utf8');
const route = (path, method = 'post') => {
  const marker = `app.${method}('${path}'`;
  const start = server.indexOf(marker);
  assert.notEqual(start, -1, `missing route ${method.toUpperCase()} ${path}`);
  const nextRoute = server.indexOf('\napp.', start + 1);
  return server.slice(start, nextRoute < 0 ? server.length : nextRoute);
};
for (const path of [
  '/api/admin/config',
  '/api/admin/save',
  '/api/admin/upload-asset/chunk',
  '/api/admin/upload-asset/finalize',
  '/api/admin/upload-asset',
]) {
  const method = path === '/api/admin/config' ? 'get' : 'post';
  assert.match(route(path, method), /requireAdminPanelAccess\(\)/, `${path} must require the canonical admin panel and top-moderator/delegate authorization`);
}
assert.match(route('/internal/menu/create-post'), /isCurrentUserModerator\(subredditName\)/, 'custom-post menu endpoint must authorize the caller server-side');
assert.match(route('/api/admin/access', 'get'), /requireAdminPanelOwner\(\)/, 'only a moderator with Everything may scan the moderator roster');
assert.match(route('/api/admin/access'), /requireAdminPanelOwner\(\)/, 'only a moderator with Everything may grant or revoke access');
assert.ok(server.includes('const moderators = await subreddit.getModerators().all()'), 'delegation must scan the full live moderator-team listing');
assert.match(server, /getDelegatedAdminUsernames\(subredditName\)/, 'admin access must consult the subreddit-scoped delegation list');
assert.match(server, /includes\('all'\)/, 'Everything is Reddit’s all moderator permission');
assert.doesNotMatch(server, /ownerUsername !== liveOwner|getModerators\(\)\.get\(1\)/, 'access must not depend on a single top moderator');
assert.match(server, /await isCurrentUserModerator\(subredditName\)/, 'delegated access must revalidate live moderator status on every admin request');
assert.match(route('/internal/menu/create-admin'), /isCurrentUserEverythingModerator\(subredditName\)/, 'only a moderator with Everything may create or replace the admin panel');

assert.match(route('/api/runtime-config', 'get'), /readOwnSubredditConfigPayload\(/, 'a navigation post with its own configuration must not follow the shared panel');
assert.match(route('/api/runtime-config', 'get'), /resolveRuntimeAdminPostId\(/, 'legacy public posts still resolve their source admin pointer');
assert.doesNotMatch(route('/api/runtime-config', 'get'), /delegate|managedSubreddits|requireAdminPanelAccess/, 'public runtime config must not expose admin access or managed-subreddit records');
assert.match(route('/api/admin/save'), /isCurrentUserEverythingModerator\(/, 'publishing a connected subreddit requires Everything there');
assert.doesNotMatch(route('/api/admin/save'), /isCurrentUserModerator\(/, 'connected subreddits are not editable by any moderator');
assert.doesNotMatch(route('/api/admin/save'), /setPostData\(\{\s*portalAdminPostId:\s*adminPostId\s*\}\)/, 'saving must not replace every target with one shared pointer');
assert.match(route('/api/admin/connect'), /requireAdminPanelAccess\(\)/);
assert.match(route('/api/admin/connect'), /isCurrentUserEverythingModerator\(/, 'connecting a subreddit requires Everything there');
assert.match(route('/api/admin/connect'), /selectEligibleInstallations\(/, 'connecting recomputes the discovered installation list');
assert.match(route('/api/admin/connect'), /locateNavigationPost\(/, 'connecting writes the target navigation post, not the target Redis');
assert.doesNotMatch(route('/api/admin/connect'), /Enter a subreddit name/);
assert.match(route('/api/admin/installations', 'get'), /requireAdminPanelAccess\(\)/);
assert.match(route('/api/admin/installations', 'get'), /selectEligibleInstallations\(/);
assert.match(server, /SubredditsMineWhere\(/);
assert.match(server, /where: 'moderator'/);
assert.match(server, /planConnection\(/);
assert.match(route('/api/admin/disconnect'), /requireAdminPanelAccess\(\)/);
assert.match(route('/api/admin/disconnect'), /isCurrentUserEverythingModerator\(/, 'disconnect refuses to drop a shared link unless the actor has Everything there');
assert.match(route('/api/admin/paste'), /requireAdminPanelAccess\(\)/);
assert.match(route('/api/admin/paste'), /normalizeAdminConfig\(payload\?\.config, 'strict'\)/, 'pasted configurations use the same server-side checks as saves');
assert.match(route('/api/admin/paste'), /isCurrentUserEverythingModerator\(/, 'pasting into a connected subreddit requires Everything there');
assert.match(server, /normalizeSubredditName\(post\.subredditName\)/, 'managed-post updates must verify the target subreddit');
assert.match(route('/api/admin/save'), /normalizeAdminConfig\(payload\?\.config, 'strict'\)/, 'saves must reject unsafe configuration before writing');
assert.match(route('/internal/menu/create-admin'), /redis\.del\(getDelegatedAdminsKey\(subredditName\)\)/, 'replacing the admin panel must clear delegated grants');
assert.match(route('/internal/menu/create-admin'), /isCurrentUserEverythingModerator\(subredditName\)/, 'only a moderator with Everything may create or replace the admin panel');
assert.match(route('/api/admin/access'), /cannot be added as a delegate/, 'a moderator with Everything is not stored as a delegate');
assert.match(route('/api/admin/access'), /no longer a moderator/, 'revoking a removed moderator prunes the grant instead of reporting a failed grant');
assert.match(route('/api/admin/access'), /Access was not granted/, 'a non-moderator cannot be granted dashboard access');
assert.match(route('/api/admin/upload-asset/finalize'), /matchesDeclaredImage/, 'chunked uploads must match their declared image type');
assert.match(route('/api/admin/upload-asset'), /matchesDeclaredImage/, 'direct uploads must match their declared image type');

assert.equal(getSubredditNameFromUrl('https://www.reddit.com/r/ExampleSubreddit/'), 'ExampleSubreddit');
assert.equal(getSubredditLink(getSubredditNameFromUrl('https://old.reddit.com/r/ExampleSubreddit')), 'https://www.reddit.com/r/examplesubreddit/');
assert.equal(getSubredditAboutLink('r/ExampleCommunity'), 'https://www.reddit.com/r/examplecommunity/about/');
assert.equal(getSubredditNameFromUrl('https://www.reddit.com/r/de/'), 'de');
for (const rejected of [
  'http://www.reddit.com/r/example/',
  'https://www.reddit.com:444/r/example/',
  'https://www.reddit.com/r/example/about/',
  'https://www.reddit.com/r/example/comments/abc/title/',
  'https://www.reddit.com/user/example/',
  'https://www.reddit.com/r/example/?sort=hot',
  'https://www.reddit.com/r/example/#wiki',
  'https://discord.com/invite/example',
  'https://evil.example/r/example/',
  'not a url',
]) {
  assert.equal(getSubredditNameFromUrl(rejected), undefined, rejected);
}

assert.equal(isRedditHostedMediaUrl('https://i.redd.it/welcome.gif'), true);
assert.equal(isRedditHostedMediaUrl('https://preview.redd.it/icon.png'), true);
assert.equal(isRedditHostedMediaUrl('https://styles.redditmedia.com/bg.webp'), true);
assert.equal(isRedditHostedMediaUrl('http://i.redd.it/welcome.gif'), false);
assert.equal(isRedditHostedMediaUrl('https://evil.example/welcome.gif'), false);
assert.equal(isRedditHostedMediaUrl('https://www.reddit.com/r/example/'), false);

const valid = normalizeAdminConfig({
  version: 1,
  buttons: [{
    id: 'button-1',
    label: ' Example ',
    type: 'subreddit',
    url: 'https://old.reddit.com/r/Example_Sub/',
    backgroundGradient: 'linear-gradient(120deg,#1b1b2f,#3d2c63,#090a12)',
    enabled: false,
  }],
  managedSubreddits: ['r/Example_Sub', 'example_sub'],
  assets: [{ id: 'asset-1', name: 'Icon', url: 'https://i.redd.it/icon.png', type: 'image' }],
  welcomeGifVariants: ['https://i.redd.it/welcome.gif'],
  backgroundStyle: 'petals',
}, 'strict');
assert.equal(resolveLabelSize('0.95rem'), '1.25rem');
assert.equal(resolveLabelSize('1.15rem'), '1.55rem');
assert.equal(resolveLabelSize('1.35rem'), '1.85rem');
assert.equal(resolveLabelSize('1.85rem'), '1.85rem');
assert.equal(resolveLabelSize('9rem'), undefined);

assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.config.buttons[0].url, 'https://www.reddit.com/r/example_sub/');
  assert.equal(valid.config.buttons[0].enabled, false);
  assert.deepEqual(valid.config.managedSubreddits, ['example_sub']);
  assert.equal(valid.config.welcomeGif, 'https://i.redd.it/welcome.gif');
}

const externalButton = normalizeAdminConfig({
  version: 1,
  buttons: [{ id: 'button-1', label: 'Discord', type: 'discord', url: 'https://discord.com/invite/example' }],
  managedSubreddits: [],
  assets: [],
}, 'strict');
assert.equal(externalButton.ok, false);

const coerced = normalizeAdminConfig({
  version: 1,
  buttons: [{ id: 'discord-1', label: 'Discord', type: 'discord', url: 'https://discord.com/invite/example' }],
  managedSubreddits: ['not a name'],
  assets: [{ id: 'asset-1', name: 'Remote', url: 'https://evil.example/a.png', type: 'image' }],
  welcomeGif: 'https://evil.example/a.gif',
}, 'coerce');
assert.equal(coerced.ok, true);
if (coerced.ok) {
  assert.deepEqual(coerced.config.buttons, []);
  assert.deepEqual(coerced.config.assets, []);
  assert.deepEqual(coerced.config.managedSubreddits, []);
  assert.equal(coerced.config.welcomeGif, undefined);
  assert.ok(coerced.warnings.length > 0);
}

const injectedGradient = normalizeAdminConfig({
  version: 1,
  buttons: [{
    id: 'button-1',
    label: 'Example',
    type: 'subreddit',
    url: 'https://www.reddit.com/r/example/',
    backgroundGradient: 'linear-gradient(120deg,#000,#111);background:url(https://evil.example/a.png)',
  }],
  managedSubreddits: [],
  assets: [],
}, 'strict');
assert.equal(injectedGradient.ok, false);

const validButton = {
  id: 'button-1',
  label: 'Example',
  type: 'subreddit',
  url: 'https://www.reddit.com/r/example/',
};
const glowOutline = normalizeAdminConfig({
  version: 1,
  buttons: [{ ...validButton, outlineStyle: 'glow' }],
  managedSubreddits: [],
  assets: [],
}, 'strict');
assert.equal(glowOutline.ok, true);
if (glowOutline.ok) assert.equal(glowOutline.config.buttons[0]?.outlineStyle, 'glow');

const defaultOutline = normalizeAdminConfig({
  version: 1,
  buttons: [validButton],
  managedSubreddits: [],
  assets: [],
}, 'strict');
assert.equal(defaultOutline.ok, true);
if (defaultOutline.ok) assert.equal(defaultOutline.config.buttons[0]?.outlineStyle, undefined);

const rejectedOutline = normalizeAdminConfig({
  version: 1,
  buttons: [{ ...validButton, outlineStyle: 'rainbow' }],
  managedSubreddits: [],
  assets: [],
}, 'strict');
assert.equal(rejectedOutline.ok, false);

const coercedOutline = normalizeAdminConfig({
  version: 1,
  buttons: [{ ...validButton, outlineStyle: 'rainbow' }],
  managedSubreddits: [],
  assets: [],
}, 'coerce');
assert.equal(coercedOutline.ok, true);
if (coercedOutline.ok) assert.equal(coercedOutline.config.buttons[0]?.outlineStyle, undefined);

const welcomeUrl = 'https://i.redd.it/welcome.gif';
const blurredFit = normalizeAdminConfig({
  version: 1,
  buttons: [],
  managedSubreddits: [],
  assets: [],
  welcomeGifVariants: [welcomeUrl],
  welcomeGifFitByUrl: { [welcomeUrl]: 'blurred' },
}, 'strict');
assert.equal(blurredFit.ok, true);
if (blurredFit.ok) assert.equal(blurredFit.config.welcomeGifFitByUrl[welcomeUrl], 'blurred');

const rejectedFit = normalizeAdminConfig({
  version: 1,
  buttons: [],
  managedSubreddits: [],
  assets: [],
  welcomeGifVariants: [welcomeUrl],
  welcomeGifFitByUrl: { [welcomeUrl]: 'stretch' },
}, 'strict');
assert.equal(rejectedFit.ok, false);

const coercedFit = normalizeAdminConfig({
  version: 1,
  buttons: [],
  managedSubreddits: [],
  assets: [],
  welcomeGifVariants: [welcomeUrl],
  welcomeGifFitByUrl: { [welcomeUrl]: 'stretch' },
}, 'coerce');
assert.equal(coercedFit.ok, true);
if (coercedFit.ok) assert.equal(coercedFit.config.welcomeGifFitByUrl[welcomeUrl], undefined);

assert.equal(welcomeFitForAspect(720, 1280), 'side');
assert.equal(welcomeFitForAspect(1280, 360), 'band');
assert.equal(welcomeFitForAspect(800, 800), 'blurred');
assert.equal(welcomeFitForAspect(0, 400), 'blurred');

const sideFit = normalizeAdminConfig({
  version: 1,
  buttons: [],
  managedSubreddits: [],
  assets: [],
  welcomeGifVariants: [welcomeUrl],
  welcomeGifFitByUrl: { [welcomeUrl]: 'side' },
}, 'strict');
assert.equal(sideFit.ok, true);
if (sideFit.ok) assert.equal(sideFit.config.welcomeGifFitByUrl[welcomeUrl], 'side');

const bandFit = normalizeAdminConfig({
  version: 1,
  buttons: [],
  managedSubreddits: [],
  assets: [],
  welcomeGifVariants: [welcomeUrl],
  welcomeGifFitByUrl: { [welcomeUrl]: 'band' },
}, 'strict');
assert.equal(bandFit.ok, true);
if (bandFit.ok) assert.equal(bandFit.config.welcomeGifFitByUrl[welcomeUrl], 'band');

const removedFields = {
  cardStyle: 'neon',
  backgroundDim: 'loud',
  backgroundBlur: 'yes',
  tagline: 'x'.repeat(400),
  audioUrl: 'https://example.com/theme.mp3',
};
for (const mode of ['strict', 'coerce']) {
  const legacy = normalizeAdminConfig({
    version: 1,
    buttons: [validButton],
    managedSubreddits: [],
    assets: [],
    ...removedFields,
  }, mode);
  assert.equal(legacy.ok, true, mode);
  if (legacy.ok) {
    assert.equal('cardStyle' in legacy.config, false);
    assert.equal('backgroundDim' in legacy.config, false);
    assert.equal('backgroundBlur' in legacy.config, false);
    assert.equal('tagline' in legacy.config, false);
    assert.equal('audioUrl' in legacy.config, false);
    assert.equal(legacy.config.buttons.length, 1);
  }
}

const adminUi = await readFile(new URL('../src/client/admin.tsx', import.meta.url), 'utf8');
const menuUi = await readFile(new URL('../src/client/MenuApp.tsx', import.meta.url), 'utf8');
assert.match(adminUi, /Connected Subreddits/);
assert.match(adminUi, /Connect Subreddit/);
assert.match(adminUi, /installation-list/);
assert.doesNotMatch(adminUi, /Subreddit name, e\.g\. YourSubreddit/);
assert.doesNotMatch(adminUi, /<input[^>]*newSubreddit/);
assert.match(adminUi, /Copy Config/);
assert.match(adminUi, /Paste Config/);
assert.match(adminUi, /Replace Config/);
assert.match(adminUi, />Editing/);
assert.match(adminUi, /Save & Apply to r\//);
assert.match(adminUi, /Open admin editor/);
assert.match(adminUi, /admin--inline/);
assert.match(adminUi, /requestExpandedMode\(event\.nativeEvent, 'admin'\)/);
assert.match(adminUi, />Outline/);
assert.match(adminUi, /OUTLINE_STYLES\.map/);
assert.match(adminUi, /outlineStyle/);
const sharedUi = await readFile(new URL('../src/shared/subreddit.ts', import.meta.url), 'utf8');
assert.match(sharedUi, /label: 'Electric'/);
assert.match(sharedUi, /label: 'Glow'/);
assert.match(sharedUi, /label: 'None'/);
assert.match(sharedUi, /not Electric, Glow, or None/);
assert.match(sharedUi, /label: 'Blurred fill'/);
assert.match(sharedUi, /label: 'Side blur'/);
assert.match(sharedUi, /label: 'Top\/bottom blur'/);
assert.match(sharedUi, /welcomeFitForAspect/);
assert.doesNotMatch(sharedUi, /audioUrl|cardStyle|backgroundDim|tagline/);
assert.match(adminUi, /WELCOME_GIF_FITS\.map/);
assert.match(adminUi, /Side blur/);
assert.match(adminUi, /Top\/bottom blur/);
assert.match(adminUi, /MP4 and WebM are not accepted/);
assert.doesNotMatch(adminUi, /Background audio URL|Play audio|CARD_STYLES|Blur the full-bleed background/);
assert.match(menuUi, /intro__fill/);
assert.match(menuUi, /\?\? 'blurred'/);
assert.match(adminUi, /Admin access required/);
assert.match(adminUi, /setAccessDenied/);
assert.match(adminUi, /Subreddit Menu/);
assert.doesNotMatch(adminUi, /Community Menu/);
assert.match(adminUi, /Everything only/);
assert.doesNotMatch(adminUi, /top moderator/);
assert.match(menuUi, /builtin-subreddit-menu/);
assert.match(menuUi, /className="subreddit-menu"/);
assert.match(menuUi, /getSubredditAboutLink/);
assert.doesNotMatch(menuUi, /Open full menu/);
assert.doesNotMatch(menuUi, /requestExpandedMode/);
assert.match(menuUi, /aria-label="Previous"/);
assert.match(menuUi, /aria-label="Next"/);
assert.match(menuUi, /carousel__track/);
assert.match(menuUi, /app--inline/);
assert.doesNotMatch(menuUi, /Open navigation/);
assert.doesNotMatch(menuUi, /Open the expanded view to browse linked subreddits/);
assert.doesNotMatch(menuUi, /100vh|100dvh/);
const menuCss = await readFile(new URL('../src/client/index.css', import.meta.url), 'utf8');
assert.match(menuCss, /\.app--inline[\s\S]*overflow:\s*hidden/);
assert.match(menuCss, /\.app--inline \{[^}]*touch-action:\s*auto/);
assert.match(menuCss, /\.app--inline \{[^}]*overscroll-behavior:\s*auto/);
assert.doesNotMatch(menuCss, /\.app--inline \{[^}]*touch-action:\s*(?:none|manipulation)/);
assert.doesNotMatch(menuCss, /\.app--inline \{[^}]*overscroll-behavior:\s*none/);
assert.doesNotMatch(menuCss, /\.carousel__viewport \{[^}]*touch-action:\s*(?:none|manipulation)/);
assert.match(menuCss, /transition:\s*transform\s+250ms/);
assert.match(menuCss, /\.app--expanded \.portal-grid/);
assert.match(menuCss, /prefers-reduced-motion/);
assert.doesNotMatch(menuCss, /overscroll-behavior-y:\s*contain/);
assert.doesNotMatch(menuCss, /96vh|94vh|100vh|100dvh/);
assert.match(menuCss, /\.intro__fill \{[^}]*filter:\s*blur\(/);
assert.doesNotMatch(menuCss, /\.intro__media--contained \{[^}]*filter:\s*blur\(/);
assert.match(menuCss, /\.intro__frame--side \.intro__media--contained/);
assert.match(menuCss, /\.intro__frame--band \.intro__media--contained/);
assert.match(menuUi, /intro__frame--\$\{blurModifier\}/);
assert.match(menuUi, /app app--expanded /);
assert.match(menuUi, /app app--inline \$\{introPhase === 'done' \? 'app--ready' : 'app--intro'\}/);
assert.match(menuUi, /image\.decode\(/);
assert.match(menuUi, /INTRO_LOAD_TIMEOUT_MS/);
assert.match(menuUi, /intro__loader/);
assert.match(menuUi, /new ResizeObserver/);
assert.match(menuUi, /--label-shift/);
assert.match(menuCss, /label-marquee/);
assert.match(menuCss, /gold-sheen/);
assert.match(menuCss, /\.portal-button__label \{[^}]*font-size:\s*var\(--portal-label-size/);
assert.doesNotMatch(menuCss, /\.app--inline \.portal-button__label \{[^}]*font-size:\s*1rem/);
assert.match(menuCss, /prefers-reduced-motion[\s\S]*subreddit-menu__sheen[\s\S]*animation:\s*none/);
assert.match(menuCss, /prefers-reduced-motion[\s\S]*portal-button__label-face[\s\S]*text-overflow:\s*ellipsis/);
const inlineBranch = menuUi.slice(menuUi.indexOf("if (mode === 'inline')"), menuUi.indexOf('app app--expanded'));
assert.match(inlineBranch, /\{welcomeIntro\}/);
assert.match(menuCss, /\.app--inline \.portal-button__icon-shell \{[^}]*max-height:\s*76px/);
assert.doesNotMatch(menuCss, /flex-basis:\s*44px/);
assert.doesNotMatch(menuCss, /\.portal-button:hover/);
assert.doesNotMatch(menuCss, /\.portal-button--electric:hover/);
assert.doesNotMatch(menuUi, /Play audio|Mute audio|<audio|profile-card|app--profile/);
assert.doesNotMatch(menuCss, /profile-card|audio-toggle|app--profile|app--card-glass/);
const adminCss = await readFile(new URL('../src/client/admin.css', import.meta.url), 'utf8');
assert.match(adminCss, /\.admin--inline\{[^}]*overflow:\s*hidden/);
assert.match(adminCss, /\.admin--inline\{[^}]*touch-action:\s*auto/);
assert.match(adminCss, /\.admin--inline\{[^}]*overscroll-behavior:\s*auto/);
assert.doesNotMatch(adminCss, /\.admin--inline\{[^}]*touch-action:\s*(?:none|manipulation)/);
assert.doesNotMatch(adminCss, /\.admin--inline\{[^}]*overscroll-behavior:\s*none/);
assert.match(server, /media\.upload\(/);
assert.doesNotMatch(route('/api/admin/upload-asset'), /https?:\/\/(?!data:)/);
const webViewMode = await readFile(new URL('../src/client/useWebViewMode.ts', import.meta.url), 'utf8');
const splashHtml = await readFile(new URL('../src/client/splash.html', import.meta.url), 'utf8');
assert.match(webViewMode, /if \(!host\.devvit\) return 'inline'/);
assert.doesNotMatch(webViewMode, /return 'expanded'/);
assert.match(webViewMode, /getWebViewMode\(\) === 'expanded' \? 'expanded' : 'inline'/);
assert.doesNotMatch(splashHtml, /100vh|100dvh|user-scalable=no/);
const devvitConfig = await readFile(new URL('../devvit.json', import.meta.url), 'utf8');
assert.doesNotMatch(devvitConfig, /"inline"\s*:/);
assert.match(devvitConfig, /"entry": "splash.html"\s*,\s*"height": "tall"/);
assert.match(devvitConfig, /"entry": "admin.html"\s*,\s*"height": "regular"/);

const eligible = selectEligibleInstallations({
  homeSubreddit: 'communitypro_dev',
  connected: ['r/TestingServerAdmin'],
  candidates: [
    { subredditName: 'communitypro_dev', permissions: ['all'] },
    { subredditName: 'TestingServerAdmin', permissions: ['all', 'posts'] },
    { subredditName: 'r/TestingServerAdmin', permissions: ['all'] },
    { subredditName: 'widgets', permissions: ['posts', 'wiki', 'config', 'mail', 'access'] },
    { subredditName: 'secretclub', permissions: undefined },
    { subredditName: 'not a name', permissions: ['all'] },
    { subredditName: 'emptyperms', permissions: [] },
  ],
});
assert.deepEqual(eligible, [{ subredditName: 'testingserveradmin', connected: true }]);

const capped = limitInstallationNames(
  ['communitypro_dev', 'alpha', 'alpha', 'beta', 'gamma'],
  'communitypro_dev',
  2,
);
assert.deepEqual(capped, { names: ['alpha', 'beta'], truncated: true });
assert.equal(INSTALLATION_CHECK_CAP, 40);

const appAuthor = 'communitypro';
const encodedConfig = 'encoded-home-config';
const source = {
  subredditName: 'communitypro_dev',
  redis: { [TARGET_POST_CACHE_KEY]: '[]' },
  posts: [],
};
const targetRedis = { 'community-portal:admin-post': 't3_targetadmin' };
const target = {
  subredditName: 'testingserveradmin',
  redis: { ...targetRedis },
  posts: [
    {
      id: 't3_targetadmin',
      subredditName: 'testingserveradmin',
      authorName: appAuthor,
      postData: { portalAdmin: true, portalConfig: 'target-admin' },
    },
    {
      id: 't3_targetnav',
      subredditName: 'testingserveradmin',
      authorName: appAuthor,
      postData: { legacy: true },
    },
    {
      id: 't3_userpost',
      subredditName: 'testingserveradmin',
      authorName: 'someoneelse',
      postData: {},
    },
  ],
};
const connected = applyConnection({
  source,
  target,
  adminPostId: 't3_sourceadmin',
  encodedConfig,
  appAuthor,
  newPostId: 't3_shouldnotcreate',
});
assert.equal(connected.action, 'update');
assert.equal(connected.postId, 't3_targetnav');
assert.deepEqual(connected.target.redis, targetRedis);
assert.equal(connected.target.redis[TARGET_POST_CACHE_KEY], undefined);
const targetNav = connected.target.posts.find((post) => post.id === 't3_targetnav');
const targetAdmin = connected.target.posts.find((post) => post.id === 't3_targetadmin');
assert.equal(readOwnSubredditConfigPayload(targetNav?.postData), encodedConfig);
assert.equal(isAdminPanelPostData(targetAdmin?.postData), true);
assert.equal(readOwnSubredditConfigPayload(targetAdmin?.postData), undefined);
assert.equal(connected.target.posts.some((post) => post.id === 't3_shouldnotcreate'), false);
const cached = JSON.parse(connected.source.redis[TARGET_POST_CACHE_KEY]);
assert.deepEqual(cached, [{ subredditName: 'testingserveradmin', postId: 't3_targetnav' }]);
assert.notEqual(connected.source.redis[TARGET_POST_CACHE_KEY], connected.target.redis[TARGET_POST_CACHE_KEY]);

const emptyTargetRedis = {};
const created = applyConnection({
  source: { subredditName: 'communitypro_dev', redis: {}, posts: [] },
  target: { subredditName: 'testingserveradmin', redis: emptyTargetRedis, posts: [] },
  adminPostId: 't3_sourceadmin',
  encodedConfig,
  appAuthor,
  newPostId: 't3_newnav',
});
assert.equal(created.action, 'create');
assert.equal(created.postId, 't3_newnav');
assert.deepEqual(created.target.redis, emptyTargetRedis);
assert.equal(readOwnSubredditConfigPayload(created.target.posts[0]?.postData), encodedConfig);
assert.equal(JSON.parse(created.source.redis[TARGET_POST_CACHE_KEY])[0].postId, 't3_newnav');

const kept = 'encoded-existing-target';
const reused = applyConnection({
  source,
  target: {
    subredditName: 'testingserveradmin',
    redis: { ...targetRedis },
    posts: [
      {
        id: 't3_newest',
        subredditName: 'testingserveradmin',
        authorName: appAuthor,
        postData: {},
      },
      {
        id: 't3_configured',
        subredditName: 'testingserveradmin',
        authorName: appAuthor,
        postData: { portalSubredditConfig: true, portalAdminPostId: 't3_sourceadmin', portalConfig: kept },
      },
    ],
  },
  adminPostId: 't3_sourceadmin',
  encodedConfig: 'encoded-would-overwrite',
  appAuthor,
  rememberedPostId: 't3_newest',
  newPostId: 't3_another',
});
assert.deepEqual(planConnection({
  posts: target.posts,
  subredditName: 'TestingServerAdmin',
  appAuthor,
}), { action: 'update', postId: 't3_targetnav' });
assert.equal(reused.action, 'reuse');
assert.equal(reused.postId, 't3_configured');
assert.equal(readOwnSubredditConfigPayload(reused.target.posts.find((post) => post.id === 't3_configured')?.postData), kept);
assert.deepEqual(reused.target.redis, targetRedis);

console.log('COMMUNITY_ISOLATION_TESTS_PASS');
