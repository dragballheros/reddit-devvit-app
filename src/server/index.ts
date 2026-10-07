import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, reddit, context, redis } from '@devvit/web/server';
import { inflateSync, deflateSync } from 'node:zlib';
import { APP_CONFIG, getDefaultAdminConfig, type AdminConfig, type AppConfig } from '../shared/subreddit';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';

const app = new Hono();

const ADMIN_POST_KEY = 'hentaiapp:admin-post';
const TARGET_POSTS_KEY = 'hentaiapp:target-posts';

type TargetPostRecord = { subredditName: string; postId: string };

const encodeConfig = (config: AdminConfig): string =>
  deflateSync(Buffer.from(JSON.stringify(config), 'utf8')).toString('base64');

const decodeConfig = (value: string): AdminConfig =>
  JSON.parse(inflateSync(Buffer.from(value, 'base64')).toString('utf8')) as AdminConfig;

const getAdminConfigFromPost = async (postId?: string): Promise<AdminConfig | undefined> => {
  if (!postId) return undefined;
  const data = await reddit.getPostData(postId);
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
      ? context.postData.portalAdminPostId
      : context.postData?.portalAdmin === true ? context.postId : undefined;
    const adminConfig = await getAdminConfigFromPost(adminPostId);
    return c.json({ config: effectiveConfig(adminConfig), adminPostId: adminPostId ?? null });
  } catch (error) {
    console.error('Failed to load runtime portal config', error);
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

    const adminPost = await reddit.getPostById(context.postId);
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
          await post.setPostData({ portalAdminPostId: context.postId });
          results.push({ subredditName, status: 'updated', postId: current.postId });
        } else {
          const post = await reddit.submitCustomPost({
            subredditName,
            title: '\u200B',
            entry: 'default',
            postData: { portalAdminPostId: context.postId },
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

app.post('/api/admin/upload-asset', async (c) => {
  try {
    if (!(await requireModerator(context.subredditName))) return c.json({ error: 'Moderator access required.' }, 403);
    const payload = await c.req.json<{ url?: string; type?: 'image' | 'gif' }>();
    if (!payload.url || !['image','gif'].includes(payload.type ?? '')) return c.json({ error: 'Invalid media.' }, 400);
    return c.json({ url: payload.url, type: payload.type });
  } catch {
    return c.json({ error: 'Failed to register uploaded asset.' }, 500);
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
    console.error('Failed to create moderator portal post', error);
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
    if (existing) return c.json<UiResponse>({ showToast: 'Admin panel already exists. Open or pin that post from your profile.' });
    const config = getDefaultAdminConfig();
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'admin',
      runAs: 'USER',
      userGeneratedContent: { text: 'Moderator configuration panel.', imageUrls: [] },
      postData: { portalAdmin: true, portalConfig: encodeConfig(config), updatedAt: Date.now() },
    });
    await redis.set(ADMIN_POST_KEY, post.id);
    return c.json<UiResponse>({ showToast: 'Admin panel created. Pin the post to your profile if desired.' });
  } catch (error) {
    console.error('Failed to create admin panel:', error);
    return c.json<UiResponse>({ showToast: 'Failed to create the admin panel.' });
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

    console.log('Created HentaiApp custom post ' + post.id + ' in r/' + subredditName);

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
