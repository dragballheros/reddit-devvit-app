import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, reddit, context, redis, media } from '@devvit/web/server';
import { inflateSync, deflateSync } from 'node:zlib';
import { APP_CONFIG, getDefaultAdminConfig, type AdminConfig, type AppConfig } from '../shared/subreddit';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';

const app = new Hono();

const ADMIN_POST_KEY = 'community-portal:admin-post';
const TARGET_POSTS_KEY = 'community-portal:target-posts';

type RedditPostId = `t3_${string}`;

type TargetPostRecord = { subredditName: string; postId: RedditPostId };

const toRedditPostId = (value?: string): RedditPostId | undefined =>
  value?.startsWith('t3_') ? value as RedditPostId : undefined;

const encodeConfig = (config: AdminConfig): string =>
  deflateSync(Buffer.from(JSON.stringify(config), 'utf8')).toString('base64');

const decodeConfig = (value: string): AdminConfig =>
  JSON.parse(inflateSync(Buffer.from(value, 'base64')).toString('utf8')) as AdminConfig;

const PUBLIC_IMAGE_ERROR = 'This image cannot be used.';
const MODERATION_UNAVAILABLE_ERROR = 'This image could not be verified, so it cannot be used.';

type ModerationResponse = {
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
  }>;
};

const moderateImage = async (imageUrl: string): Promise<'approved' | 'blocked'> => {
  const apiKeyValue = await context.settings.get('OPENAI_API_KEY');
  const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : '';
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [
        {
          type: 'image_url',
          image_url: { url: imageUrl },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI moderation HTTP ${response.status}.`);
  }

  const payload = await response.json() as ModerationResponse;
  const result = payload.results?.[0];
  if (!result || !result.categories) {
    throw new Error('OpenAI moderation returned no classification result.');
  }

  const sexuallyExplicit = Boolean(
    result.categories.sexual || result.categories['sexual/minors'],
  );
  const highRisk = Boolean(result.categories['violence/graphic']);

  return result.flagged || sexuallyExplicit || highRisk ? 'blocked' : 'approved';
};

const requireImageModeration = async (imageUrl: string): Promise<void> => {
  const result = await moderateImage(imageUrl);
  if (result === 'blocked') throw new Error(PUBLIC_IMAGE_ERROR);
};

const getAdminConfigFromPost = async (postId?: string): Promise<AdminConfig | undefined> => {
  const redditPostId = toRedditPostId(postId);
  if (!redditPostId) return undefined;
  const data = await reddit.getPostData(redditPostId);
  const encoded = typeof data?.portalConfig === 'string' ? data.portalConfig : undefined;
  if (!encoded) return undefined;
  const config = decodeConfig(encoded);
  return { ...config, assets: config.assets ?? [] };
};

const getTargetPosts = async (): Promise<TargetPostRecord[]> => {
  const value = await redis.get(TARGET_POSTS_KEY);
  if (!value) return [];
  try { return JSON.parse(value) as TargetPostRecord[]; } catch { return []; }
};

const saveTargetPosts = async (targets: TargetPostRecord[]) =>
  redis.set(TARGET_POSTS_KEY, JSON.stringify(targets));

const isValidAdminConfig = (value: unknown): value is AdminConfig => {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<AdminConfig>;
  return config.version === 1 && Array.isArray(config.buttons) && Array.isArray(config.managedSubreddits);
};

const effectiveConfig = (admin?: AdminConfig): AppConfig =>
  admin
    ? {
        ...APP_CONFIG,
        welcomeGif: admin.welcomeGifVariants?.[0] ?? admin.welcomeGif,
        welcomeGifVariants: admin.welcomeGifVariants?.length
          ? admin.welcomeGifVariants
          : admin.welcomeGif
            ? [admin.welcomeGif]
            : undefined,
        buttons: admin.buttons,
      }
    : APP_CONFIG;

const requireModerator = async (subredditName?: string) =>
  Boolean(subredditName && await isCurrentUserModerator(subredditName));

const isCurrentUserModerator = async (subredditName: string): Promise<boolean> => {
  const user =
    context.userId
      ? await reddit.getUserById(context.userId)
      : context.username
        ? await reddit.getUserByUsername(context.username)
        : undefined;

  if (!user) return false;

  const permissions = await user.getModPermissionsForSubreddit(subredditName);
  return permissions.length > 0;
};

app.get('/api/runtime-config', async (c) => {
  try {
    const adminPostId = typeof context.postData?.portalAdminPostId === 'string'
      ? toRedditPostId(context.postData.portalAdminPostId)
      : toRedditPostId(context.postData?.portalAdmin === true ? context.postId : undefined);
    const adminConfig = await getAdminConfigFromPost(adminPostId);
    return c.json({ config: effectiveConfig(adminConfig), adminPostId: adminPostId ?? null });
  } catch (error) {
    console.error('Failed to load runtime community navigation config', error);
    return c.json({ config: APP_CONFIG, adminPostId: null });
  }
});

app.get('/api/admin/config', async (c) => {
  try {
    if (!(await requireModerator(context.subredditName)) || !context.postId) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }
    const config = await getAdminConfigFromPost(context.postId) ?? getDefaultAdminConfig();
    return c.json({ config, targets: await getTargetPosts(), adminPostId: context.postId });
  } catch (error) {
    console.error('Failed to load admin config', error);
    return c.json({ error: 'Failed to load admin configuration.' }, 500);
  }
});

app.get('/api/moderator-status', async (c) => {
  try {
    const subredditName = context.subredditName;
    if (!subredditName) {
      return c.json({ isModerator: false });
    }

    return c.json({
      isModerator: await isCurrentUserModerator(subredditName),
    });
  } catch (error) {
    console.error('Failed to determine moderator status', error);
    return c.json({ isModerator: false });
  }
});

app.post('/api/admin/save', async (c) => {
  try {
    if (!(await requireModerator(context.subredditName)) || !context.postId) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }
    const payload = await c.req.json<{ config: AdminConfig }>();
    if (!isValidAdminConfig(payload.config)) return c.json({ error: 'Invalid admin configuration.' }, 400);

    const config: AdminConfig = {
      ...payload.config,
      managedSubreddits: payload.config.managedSubreddits.map((name) => name.trim().replace(/^r\//i, '')).filter(Boolean),
    };
    const encoded = encodeConfig(config);
    if (JSON.stringify({ portalAdmin: true, portalConfig: encoded }).length > 2000) {
      return c.json({ error: 'Configuration is too large for Reddit post data. Remove unused assets or buttons.' }, 400);
    }

    const adminPostId = toRedditPostId(context.postId);
    if (!adminPostId) return c.json({ error: 'Invalid Reddit post ID.' }, 400);
    const adminPost = await reddit.getPostById(adminPostId);
    await adminPost.setPostData({ portalAdmin: true, portalConfig: encoded, updatedAt: Date.now() });

    const existing = await getTargetPosts();
    const bySub = new Map(existing.map((item) => [item.subredditName.toLowerCase(), item]));
    const results: Array<{ subredditName: string; status: string; postId?: string; error?: string }> = [];

    for (const subredditName of config.managedSubreddits) {
      try {
        if (!(await isCurrentUserModerator(subredditName))) {
          results.push({ subredditName, status: 'not-moderator', error: 'You are not a moderator there.' });
          continue;
        }
        const current = bySub.get(subredditName.toLowerCase());
        if (current) {
          const post = await reddit.getPostById(current.postId);
          await post.setPostData({ portalAdminPostId: adminPostId });
          results.push({ subredditName, status: 'updated', postId: current.postId });
        } else {
          const post = await reddit.submitCustomPost({
            subredditName,
            title: '\u200B',
            entry: 'default',
            postData: { portalAdminPostId: adminPostId },
          });
          bySub.set(subredditName.toLowerCase(), { subredditName, postId: post.id });
          results.push({ subredditName, status: 'created', postId: post.id });
        }
      } catch (error) {
        console.error('Failed to sync subreddit', subredditName, error);
        results.push({ subredditName, status: 'error', error: 'App installation or permission is missing.' });
      }
    }

    const nextTargets = [...bySub.values()].filter((item) =>
      config.managedSubreddits.some((name) => name.toLowerCase() === item.subredditName.toLowerCase())
    );
    await saveTargetPosts(nextTargets);
    return c.json({ ok: true, config, targets: nextTargets, results });
  } catch (error) {
    console.error('Failed to save admin config', error);
    return c.json({ error: 'Failed to save and apply the configuration.' }, 500);
  }
});


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isAllowedCatboxUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && ['catbox.moe', 'files.catbox.moe'].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const fetchCatboxImage = async (initialUrl: string): Promise<Response> => {
  let currentUrl = initialUrl;

  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Catbox returned a redirect without a location.');
      const next = new URL(location, currentUrl).toString();
      if (!isAllowedCatboxUrl(next)) throw new Error('Catbox redirected to an unapproved host.');
      currentUrl = next;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Catbox returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (!contentType?.startsWith('image/')) {
      throw new Error('The Catbox URL did not return an image. Use a direct image file URL.');
    }

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=3600');
    const length = response.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    return new Response(response.body, { status: 200, headers });
  }

  throw new Error('Too many Catbox redirects.');
};

app.post('/api/admin/upload-asset', async (c) => {
  try {
    if (!(await requireModerator(context.subredditName))) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }

    const payload = await c.req.json<{
      dataUrl?: string;
      sourceUrl?: string;
      type?: 'image' | 'gif';
    }>();
    const mediaType = payload.type === 'gif' || payload.type === 'image' ? payload.type : undefined;
    if (!mediaType) return c.json({ error: 'Invalid media type.' }, 400);

    let sourceForModeration = '';
    if (typeof payload.sourceUrl === 'string' && payload.sourceUrl.trim()) {
      const sourceUrl = payload.sourceUrl.trim();
      if (!isAllowedCatboxUrl(sourceUrl)) {
        return c.json({ error: 'Only direct HTTPS Catbox links are allowed.' }, 400);
      }
      sourceForModeration = sourceUrl;
    } else {
      const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return c.json({ error: 'Invalid image data.' }, 400);

      const base64 = match[2];
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      const byteLength = Math.floor((base64.length * 3) / 4) - padding;
      if (byteLength > 2.5 * 1024 * 1024) {
        return c.json({ error: 'Local uploads are limited to 2.5 MB by the Devvit Web request size.' }, 413);
      }
      sourceForModeration = dataUrl;
    }

    try {
      await requireImageModeration(sourceForModeration);
    } catch (error) {
      console.warn('Admin media blocked or could not be moderated', error);
      return c.json({
        error: error instanceof Error && error.message === PUBLIC_IMAGE_ERROR
          ? PUBLIC_IMAGE_ERROR
          : MODERATION_UNAVAILABLE_ERROR,
      }, 422);
    }

    if (typeof payload.sourceUrl === 'string' && payload.sourceUrl.trim()) {
      return c.json({ url: payload.sourceUrl.trim(), type: mediaType, hosting: 'catbox' });
    }

    const dataUrl = payload.dataUrl!.trim();
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const uploaded = await media.upload({ url: dataUrl, type: mediaType });
        if (uploaded.mediaUrl) {
          return c.json({ url: uploaded.mediaUrl, type: mediaType, hosting: 'reddit' });
        }
        lastError = new Error('Reddit did not return a media URL.');
      } catch (error) {
        lastError = error;
        console.warn(`Asset media upload attempt ${attempt} failed`, error);
      }
      if (attempt < 3) await sleep(attempt * 2000);
    }

    throw lastError instanceof Error ? lastError : new Error('Reddit media upload failed.');
  } catch (error) {
    console.error('Failed to upload admin asset after moderation', error);
    return c.json({ error: error instanceof Error ? error.message : MODERATION_UNAVAILABLE_ERROR }, 502);
  }
});

app.post('/api/moderator/create-post', async (c) => {
  try {
    const subredditName = context.subredditName;
    if (!subredditName || !(await isCurrentUserModerator(subredditName))) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }

    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'default',
    });

    return c.json({
      permalink: post.permalink,
    });
  } catch (error) {
    console.error('Failed to create moderator navigation post', error);
    return c.json(
      { error: 'Failed to create the custom post. Check the app account permissions.' },
      500
    );
  }
});

/*
 * Subreddit moderator menu action.
 *
 * Reddit already restricts this menu item to moderators through
 * devvit.json (forUserType: moderator). Keep this endpoint minimal so
 * the menu request does not perform an unnecessary moderator lookup
 * before submitCustomPost().
 *
 * Menu endpoints return HTTP 200 with a UiResponse on handled errors so
 * the Devvit bridge can display our toast instead of a generic gateway error.
 */
app.post('/internal/menu/create-admin', async (c) => {
  try {
    await c.req.json<MenuItemRequest>().catch(() => ({}));
    const { subredditName } = context;
    if (!subredditName || !(await isCurrentUserModerator(subredditName))) {
      return c.json<UiResponse>({ showToast: 'Moderator access is required.' });
    }
    const existing = await redis.get(ADMIN_POST_KEY);
    if (existing) {
      try {
        const oldAdminPost = await reddit.getPostById(existing as RedditPostId);
        await oldAdminPost.remove(false);
        console.log('Removed previous admin panel ' + existing + ' from r/' + subredditName);
      } catch (error) {
        console.warn('Previous admin panel could not be removed; continuing with a fresh panel.', error);
      }
      await redis.del(ADMIN_POST_KEY);
    }

    const config = getDefaultAdminConfig();
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'admin',
      postData: { portalAdmin: true, portalConfig: encodeConfig(config), updatedAt: Date.now() },
    });

    await redis.set(ADMIN_POST_KEY, post.id);
    console.log('Created admin panel custom post ' + post.id + ' in r/' + subredditName);
    return c.json<UiResponse>({ showToast: 'Admin panel created in the test subreddit.' });
  } catch (error) {
    console.error('Failed to create admin panel:', error);
    return c.json<UiResponse>({ showToast: 'Failed to create the admin configuration panel.' });
  }
});

app.post('/internal/menu/create-post', async (c) => {
  try {
    const _input = await c.req.json<MenuItemRequest>().catch(() => ({}));

    const { subredditName } = context;

    if (!subredditName) {
      console.error('Create post menu action: subredditName missing from Devvit context');
      return c.json<UiResponse>({
        showToast: 'Reddit did not provide the subreddit context. Please try again.',
      });
    }

    console.log('Create post menu action received for r/' + subredditName);

    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'default',
    });

    console.log('Created community navigation custom post ' + post.id + ' in r/' + subredditName);

    /*
     * submitCustomPost() returns Reddit's relative permalink. The Devvit
     * menu bridge passes navigateTo() to UIClient, which requires an
     * absolute URL, so do not pass the relative permalink directly.
     *
     * Creation itself succeeded. Keep the menu action successful and let
     * the user open the created post from the subreddit feed.
     */
    return c.json<UiResponse>({
      showToast: 'Example post created.',
    });
  } catch (error) {
    console.error('Failed to create example post from subreddit menu:', error);

    return c.json<UiResponse>({
      showToast: 'Failed to create the example post. Please try again.',
    });
  }
});

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
