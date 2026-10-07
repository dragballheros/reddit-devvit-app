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

const getAdminConfigFromPost = async (postId?: string): Promise<AdminConfig | undefined> => {
  const redditPostId = toRedditPostId(postId);
  if (!redditPostId) return undefined;
  const data = await reddit.getPostData(redditPostId);
  const encoded = typeof data?.portalConfig === 'string' ? data.portalConfig : undefined;
  if (!encoded) return undefined;
  const config = decodeConfig(encoded);
  return {
    ...config,
    assets: config.assets ?? [],
    backgroundStyle: config.backgroundStyle === 'custom' ? 'custom' : 'petals',
  };
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
        welcomeGifFitByUrl: admin.welcomeGifFitByUrl,
        backgroundStyle: admin.backgroundStyle ?? 'petals',
        customBackground: admin.customBackground,
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
    const isAdminPanel = context.postData?.portalAdmin === true;
    const adminPostId = isAdminPanel
      ? toRedditPostId(context.postId)
      : toRedditPostId(await redis.get(ADMIN_POST_KEY) ?? undefined);
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
          try {
            const post = await reddit.getPostById(current.postId);
            await post.setPostData({ portalAdminPostId: adminPostId });
            results.push({ subredditName, status: 'updated', postId: current.postId });
          } catch (error) {
            console.warn('Managed navigation post is stale; recreating it.', current.postId, error);
            const post = await reddit.submitCustomPost({
              subredditName,
              title: '\u200B',
              entry: 'default',
              nsfw: true,
              postData: { portalAdminPostId: adminPostId },
            });
            bySub.set(subredditName.toLowerCase(), { subredditName, postId: post.id });
            results.push({ subredditName, status: 'created', postId: post.id });
          }
        } else {
          const post = await reddit.submitCustomPost({
            subredditName,
            title: '\u200B',
            entry: 'default',
            nsfw: true,
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

const ASSET_MAX_BYTES = 20 * 1024 * 1024;
const ASSET_CHUNK_MAX_BYTES = 1.5 * 1024 * 1024;
const ASSET_UPLOAD_TTL_SECONDS = 15 * 60;

const getAssetUploadKey = (uploadId: string) => {
  const userKey = String(context.userId ?? context.username ?? 'anonymous').replace(/[^a-zA-Z0-9:_-]/g, '_');
  return `community-portal:asset-upload:${userKey}:${uploadId}`;
};

const isUploadId = (value?: string): boolean =>
  typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

app.post('/api/admin/upload-asset/chunk', async (c) => {
  try {
    if (!(await requireModerator(context.subredditName))) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }

    const payload = await c.req.json<{
      uploadId?: string;
      index?: number;
      totalChunks?: number;
      totalBytes?: number;
      type?: 'image' | 'gif';
      mimeType?: string;
      data?: string;
    }>();
    const uploadId = payload.uploadId;
    if (typeof uploadId !== 'string' || !isUploadId(uploadId) || !Number.isInteger(payload.index) || !Number.isInteger(payload.totalChunks) || !Number.isInteger(payload.totalBytes) || !payload.data) {
      return c.json({ error: 'Invalid upload chunk.' }, 400);
    }

    const index = payload.index as number;
    const totalChunks = payload.totalChunks as number;
    const totalBytes = payload.totalBytes as number;
    const mediaType = payload.type === 'gif' || payload.type === 'image' ? payload.type : undefined;
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : '';
    if (!mediaType || !/^image\/(?:png|jpeg|webp|gif)$/i.test(mimeType)) {
      return c.json({ error: 'Unsupported image type.' }, 400);
    }
    if (totalBytes <= 0 || totalBytes > ASSET_MAX_BYTES || totalChunks < 1 || totalChunks > 32 || index < 0 || index >= totalChunks) {
      return c.json({ error: 'Asset exceeds Reddit\'s 20 MB media limit.' }, 413);
    }
    if ((mediaType === 'gif') !== (mimeType.toLowerCase() === 'image/gif')) {
      return c.json({ error: 'Media type does not match the uploaded file.' }, 400);
    }

    const match = payload.data.match(/^[A-Za-z0-9+/=]+$/);
    if (!match) return c.json({ error: 'Invalid upload chunk encoding.' }, 400);
    const padding = payload.data.endsWith('==') ? 2 : payload.data.endsWith('=') ? 1 : 0;
    const byteLength = Math.floor((payload.data.length * 3) / 4) - padding;
    if (byteLength <= 0 || byteLength > ASSET_CHUNK_MAX_BYTES) {
      return c.json({ error: 'Upload chunk is too large.' }, 413);
    }

    const key = getAssetUploadKey(uploadId);
    const existingMeta = await redis.hGet(key, '_meta');
    const meta = JSON.stringify({ totalChunks, totalBytes, type: mediaType, mimeType });
    if (existingMeta && existingMeta !== meta) {
      return c.json({ error: 'Upload session metadata changed.' }, 409);
    }

    await redis.hSet(key, {
      _meta: existingMeta ?? meta,
      [String(index)]: payload.data,
    });
    await redis.expire(key, ASSET_UPLOAD_TTL_SECONDS);

    return c.json({ ok: true, index, totalChunks });
  } catch (error) {
    console.error('Failed to receive asset upload chunk', error);
    return c.json({ error: 'Failed to receive the upload chunk.' }, 500);
  }
});

app.post('/api/admin/upload-asset/finalize', async (c) => {
  try {
    if (!(await requireModerator(context.subredditName))) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }

    const payload = await c.req.json<{ uploadId?: string }>();
    const uploadId = payload.uploadId;
    if (typeof uploadId !== 'string' || !isUploadId(uploadId)) {
      return c.json({ error: 'Invalid upload session.' }, 400);
    }

    const key = getAssetUploadKey(uploadId);
    const rawMeta = await redis.hGet(key, '_meta');
    if (!rawMeta) return c.json({ error: 'Upload session expired. Please upload the asset again.' }, 410);

    const meta = JSON.parse(rawMeta) as { totalChunks: number; totalBytes: number; type: 'image' | 'gif'; mimeType: string };
    if (!Number.isInteger(meta.totalChunks) || meta.totalChunks < 1 || meta.totalChunks > 32 || meta.totalBytes <= 0 || meta.totalBytes > ASSET_MAX_BYTES) {
      await redis.del(key);
      return c.json({ error: 'Invalid upload session.' }, 400);
    }

    const parts: Buffer[] = [];
    let totalBytes = 0;
    for (let index = 0; index < meta.totalChunks; index += 1) {
      const part = await redis.hGet(key, String(index));
      if (!part) return c.json({ error: `Upload is incomplete. Missing chunk ${index + 1} of ${meta.totalChunks}.` }, 409);
      try {
        const bytes = Buffer.from(part, 'base64');
        if (bytes.length === 0) return c.json({ error: `Upload chunk ${index + 1} is empty or invalid.` }, 400);
        parts.push(bytes);
        totalBytes += bytes.length;
      } catch {
        return c.json({ error: `Upload chunk ${index + 1} is invalid.` }, 400);
      }
    }

    if (totalBytes !== meta.totalBytes) {
      await redis.del(key);
      return c.json({ error: 'Uploaded data size does not match the upload metadata.' }, 400);
    }

    const combined = Buffer.concat(parts, totalBytes);
    const dataUrl = `data:${meta.mimeType};base64,${combined.toString('base64')}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const uploaded = await media.upload({ url: dataUrl, type: meta.type });
        if (uploaded.mediaUrl) {
          await redis.del(key);
          return c.json({ url: uploaded.mediaUrl, type: meta.type });
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
    console.error('Failed to finalize admin asset upload', error);
    const message = error instanceof Error ? error.message : 'Reddit could not finish the image upload.';
    return c.json({ error: `Reddit media upload failed after 3 attempts: ${message}` }, 502);
  }
});

app.post('/api/admin/upload-asset', async (c) => {
  try {
    if (!(await requireModerator(context.subredditName))) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }

    const payload = await c.req.json<{ dataUrl?: string; type?: 'image' | 'gif' }>();
    const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
    const mediaType = payload.type === 'gif' || payload.type === 'image' ? payload.type : undefined;
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);

    if (!mediaType || !match) {
      return c.json({ error: 'Invalid image data.' }, 400);
    }

    const base64 = match[2];
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const byteLength = Math.floor((base64.length * 3) / 4) - padding;
    if (byteLength > ASSET_MAX_BYTES) {
      return c.json({ error: 'Reddit media uploads are limited to 20 MB.' }, 413);
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const uploaded = await media.upload({ url: dataUrl, type: mediaType });
        if (uploaded.mediaUrl) {
          return c.json({ url: uploaded.mediaUrl, type: mediaType });
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
    console.error('Failed to upload admin asset to Reddit Media API after retries', error);
    const message = error instanceof Error ? error.message : 'Reddit could not finish the image upload.';
    return c.json({ error: `Reddit media upload failed after 3 attempts: ${message}` }, 502);
  }
});

app.post('/api/moderator/create-post', async (c) => {
  try {
    const subredditName = context.subredditName;
    if (!subredditName || !(await isCurrentUserModerator(subredditName))) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }

    const adminPostId = toRedditPostId(await redis.get(ADMIN_POST_KEY) ?? undefined);
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'default',
      nsfw: true,
      ...(adminPostId ? { postData: { portalAdminPostId: adminPostId } } : {}),
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
      nsfw: true,
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

    const adminPostId = toRedditPostId(await redis.get(ADMIN_POST_KEY) ?? undefined);
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'default',
      nsfw: true,
      ...(adminPostId ? { postData: { portalAdminPostId: adminPostId } } : {}),
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
