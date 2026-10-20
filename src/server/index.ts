import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, reddit, context, redis, media } from '@devvit/web/server';
import { inflateSync, deflateSync } from 'node:zlib';
import { APP_CONFIG, getDefaultAdminConfig, isAdminPanelPostData, normalizeAdminConfig, normalizeManagedSubredditName, normalizeSubredditName, resolveRuntimeAdminPostId, type AdminConfig, type AppConfig } from '../shared/subreddit';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';

const app = new Hono();

const ADMIN_POST_KEY = 'community-portal:admin-post';
const TARGET_POSTS_KEY = 'community-portal:target-posts';

type RedditPostId = `t3_${string}`;

type TargetPostRecord = { subredditName: string; postId: RedditPostId };

const toRedditPostId = (value?: unknown): RedditPostId | undefined =>
  typeof value === 'string' && /^t3_[a-z0-9]+$/i.test(value) ? value as RedditPostId : undefined;

const encodeConfig = (config: AdminConfig): string =>
  deflateSync(Buffer.from(JSON.stringify(config), 'utf8')).toString('base64');

const decodeConfig = (value: string): AdminConfig =>
  JSON.parse(inflateSync(Buffer.from(value, 'base64')).toString('utf8')) as AdminConfig;

const getAdminConfigFromPost = async (postId?: string): Promise<{ config?: AdminConfig; warnings: string[] }> => {
  const redditPostId = toRedditPostId(postId);
  if (!redditPostId) return { warnings: [] };
  const data = await reddit.getPostData(redditPostId);
  // A link to an arbitrary post must never be treated as an admin configuration.
  if (!isAdminPanelPostData(data)) return { warnings: [] };
  const encoded = typeof data?.portalConfig === 'string' ? data.portalConfig : undefined;
  if (!encoded) return { config: getDefaultAdminConfig(), warnings: [] };
  try {
    const normalized = normalizeAdminConfig(decodeConfig(encoded), 'coerce');
    if (!normalized.ok) {
      return { config: getDefaultAdminConfig(), warnings: ['Stored configuration could not be read. Saving will replace it.'] };
    }
    return { config: normalized.config, warnings: normalized.warnings };
  } catch {
    return { config: getDefaultAdminConfig(), warnings: ['Stored configuration could not be read. Saving will replace it.'] };
  }
};

const getTargetPosts = async (): Promise<TargetPostRecord[]> => {
  const value = await redis.get(TARGET_POSTS_KEY);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const valid: TargetPostRecord[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const subredditName = normalizeManagedSubredditName(record.subredditName);
      const postId = toRedditPostId(record.postId);
      if (subredditName && postId) valid.push({ subredditName, postId });
    }
    // Keep one app-managed post record per target community in this installation.
    return [...new Map(valid.map((item) => [item.subredditName, item])).values()];
  } catch {
    return [];
  }
};

const saveTargetPosts = async (targets: TargetPostRecord[]) =>
  redis.set(TARGET_POSTS_KEY, JSON.stringify(targets));

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

const DELEGATED_ADMINS_PREFIX = 'community-portal:delegated-admins:';

const getCurrentUsername = async (): Promise<string | undefined> => {
  const user =
    context.userId
      ? await reddit.getUserById(context.userId)
      : context.username
        ? await reddit.getUserByUsername(context.username)
        : undefined;
  return user?.username?.trim().toLowerCase() || context.username?.trim().toLowerCase() || undefined;
};

const getDelegatedAdminsKey = (subredditName: string) =>
  `${DELEGATED_ADMINS_PREFIX}${normalizeSubredditName(subredditName)}`;

const getTopModeratorUsername = async (subredditName: string): Promise<string | undefined> => {
  const subreddit = await reddit.getSubredditByName(subredditName);
  const moderators = await subreddit.getModerators().get(1);
  return moderators[0]?.username?.trim().toLowerCase() || undefined;
};

const getDelegatedAdminUsernames = async (subredditName: string): Promise<string[]> => {
  const raw = await redis.get(getDelegatedAdminsKey(subredditName));
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as { ownerUsername?: unknown; delegates?: unknown };
    // Grants belong to the top moderator who issued them. A top-mod change
    // invalidates all previous grants until the new top moderator re-approves.
    const liveOwner = await getTopModeratorUsername(subredditName);
    if (!liveOwner || record.ownerUsername !== liveOwner || !Array.isArray(record.delegates)) return [];
    return [...new Set(record.delegates.filter((name): name is string =>
      typeof name === 'string' && /^[a-z0-9_-]{3,20}$/i.test(name)
    ).map((name) => name.trim().toLowerCase()))];
  } catch {
    return [];
  }
};

const saveDelegatedAdminUsernames = async (subredditName: string, usernames: string[]) => {
  const ownerUsername = await getTopModeratorUsername(subredditName);
  if (!ownerUsername) {
    await redis.del(getDelegatedAdminsKey(subredditName));
    return;
  }
  const delegates = [...new Set(usernames.map((name) => name.trim().toLowerCase()))]
    .filter((name) => name !== ownerUsername && /^[a-z0-9_-]{3,20}$/i.test(name));
  return redis.set(getDelegatedAdminsKey(subredditName), JSON.stringify({
    ownerUsername,
    delegates,
  }));
};

/** Returns the current live moderator roster. Fail closed on API errors. */
const getModeratorUsernames = async (subredditName: string): Promise<string[]> => {
  const subreddit = await reddit.getSubredditByName(subredditName);
  const moderators = await subreddit.getModerators().all();
  return [...new Set(moderators
    .map((moderator) => moderator.username?.trim().toLowerCase())
    .filter((username): username is string => Boolean(username)))];
};

const isCurrentUserModerator = async (subredditName: string): Promise<boolean> => {
  try {
    const user =
      context.userId
        ? await reddit.getUserById(context.userId)
        : context.username
          ? await reddit.getUserByUsername(context.username)
          : undefined;
    if (!user) return false;
    const permissions = await user.getModPermissionsForSubreddit(subredditName);
    return permissions.length > 0;
  } catch {
    return false;
  }
};

/** Reddit's first listed moderator is treated as the top moderator for this app. */
const isCurrentUserSubredditOwner = async (subredditName: string): Promise<boolean> => {
  try {
    const username = await getCurrentUsername();
    if (!username) return false;
    const topModerator = await getTopModeratorUsername(subredditName);
    return Boolean(topModerator && topModerator === username);
  } catch (error) {
    console.warn('Could not verify subreddit top moderator; denying owner-only action.', error);
    return false;
  }
};

/**
 * Require the canonical admin post in this installation. A normal navigation
 * post or stale admin post must never become a write surface.
 */
const isCanonicalAdminPanelContext = async (): Promise<boolean> => {
  const postId = toRedditPostId(context.postId);
  const subredditName = normalizeManagedSubredditName(context.subredditName);
  const canonicalAdminPostId = toRedditPostId(await redis.get(ADMIN_POST_KEY) ?? undefined);
  if (!postId || !subredditName || postId !== canonicalAdminPostId || !isAdminPanelPostData(context.postData)) {
    return false;
  }
  try {
    const post = await reddit.getPostById(postId);
    if (normalizeSubredditName(post.subredditName) !== normalizeSubredditName(subredditName)) return false;
    return isAdminPanelPostData(await reddit.getPostData(postId));
  } catch {
    return false;
  }
};

/** Only the top moderator can manage delegated admin grants. */
const requireAdminPanelOwner = async (): Promise<boolean> => {
  const subredditName = normalizeManagedSubredditName(context.subredditName);
  return Boolean(subredditName && await isCanonicalAdminPanelContext() && await isCurrentUserSubredditOwner(subredditName));
};

/**
 * Top moderator or explicitly delegated moderator may configure the portal.
 * A delegate is checked against Reddit's live moderator permissions on every
 * request, so a removed moderator loses access immediately even if a stale
 * grant remains in Redis.
 */
const requireAdminPanelAccess = async (): Promise<boolean> => {
  const subredditName = normalizeManagedSubredditName(context.subredditName);
  if (!subredditName || !(await isCanonicalAdminPanelContext())) return false;
  if (await isCurrentUserSubredditOwner(subredditName)) return true;
  if (!(await isCurrentUserModerator(subredditName))) return false;
  const username = await getCurrentUsername();
  if (!username) return false;
  return (await getDelegatedAdminUsernames(subredditName)).includes(username);
};

app.get('/api/runtime-config', async (c) => {
  try {
    const adminPostId = resolveRuntimeAdminPostId({
      currentPostId: context.postId,
      postData: context.postData,
      localAdminPostId: await redis.get(ADMIN_POST_KEY) ?? undefined,
    });
    const loaded = await getAdminConfigFromPost(adminPostId);
    return c.json({ config: effectiveConfig(loaded.config), adminPostId: adminPostId ?? null });
  } catch (error) {
    console.error('Failed to load runtime community navigation config', error);
    return c.json({ config: APP_CONFIG, adminPostId: null });
  }
});

app.get('/api/admin/config', async (c) => {
  try {
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Top-moderator or delegated moderator access required.' }, 403);
    }
    const loaded = await getAdminConfigFromPost(context.postId);
    const config = loaded.config ?? getDefaultAdminConfig();
    const subredditName = normalizeManagedSubredditName(context.subredditName)!;
    const isOwner = await isCurrentUserSubredditOwner(subredditName);
    return c.json({
      config,
      warnings: loaded.warnings,
      targets: await getTargetPosts(),
      adminPostId: context.postId,
      accessLevel: isOwner ? 'topModerator' : 'delegatedModerator',
      canManageAccess: isOwner,
    });
  } catch (error) {
    console.error('Failed to load admin config', error);
    return c.json({ error: 'Failed to load admin configuration.' }, 500);
  }
});

app.get('/api/admin/access', async (c) => {
  try {
    if (!(await requireAdminPanelOwner())) {
      return c.json({ error: 'Only this subreddit’s top moderator can manage admin access.' }, 403);
    }
    const subredditName = normalizeManagedSubredditName(context.subredditName)!;
    const [moderators, storedDelegates, topModerator] = await Promise.all([
      getModeratorUsernames(subredditName),
      getDelegatedAdminUsernames(subredditName),
      getTopModeratorUsername(subredditName),
    ]);
    if (!topModerator) {
      return c.json({ error: 'Could not verify the live moderator team. No access changes were made.' }, 502);
    }
    // Prune stale grants during a top-moderator roster refresh. Runtime access
    // checks already deny removed moderators even before this cleanup occurs.
    // The top moderator is the owner and is never stored as a delegate.
    const currentSet = new Set(moderators);
    const delegates = storedDelegates.filter((username) => currentSet.has(username) && username !== topModerator);
    if (delegates.length !== storedDelegates.length) {
      await saveDelegatedAdminUsernames(subredditName, delegates);
    }
    return c.json({ moderators, delegates, topModerator, scannedAt: Date.now() });
  } catch (error) {
    console.error('Failed to scan subreddit moderator team', error);
    return c.json({ error: 'Could not verify the live moderator team. No access changes were made.' }, 502);
  }
});

app.post('/api/admin/access', async (c) => {
  try {
    if (!(await requireAdminPanelOwner())) {
      return c.json({ error: 'Only this subreddit’s top moderator can grant or revoke admin access.' }, 403);
    }
    const payload = await c.req.json<{ username?: string; granted?: boolean }>();
    const username = typeof payload.username === 'string' ? payload.username.trim().replace(/^u\//i, '').toLowerCase() : '';
    if (!/^[a-z0-9_-]{3,20}$/i.test(username) || typeof payload.granted !== 'boolean') {
      return c.json({ error: 'Choose a valid moderator and grant or revoke access.' }, 400);
    }
    const subredditName = normalizeManagedSubredditName(context.subredditName)!;
    const [moderators, topModerator] = await Promise.all([
      getModeratorUsernames(subredditName),
      getTopModeratorUsername(subredditName),
    ]);
    if (!topModerator) {
      return c.json({ error: 'Could not verify the live moderator team. No access changes were made.' }, 502);
    }
    if (username === topModerator) {
      return c.json({ error: 'The top moderator already has admin access and cannot be added as a delegate.' }, 400);
    }
    if (!moderators.includes(username)) {
      const current = (await getDelegatedAdminUsernames(subredditName)).filter((name) => name !== username);
      await saveDelegatedAdminUsernames(subredditName, current);
      if (!payload.granted) {
        return c.json({
          ok: true,
          username,
          granted: false,
          delegates: current,
          message: 'That account is no longer a moderator. Delegated access was removed.',
        });
      }
      return c.json({ error: 'That account is not currently a moderator. Access was not granted.' }, 409);
    }
    const current = await getDelegatedAdminUsernames(subredditName);
    const next = payload.granted
      ? [...new Set([...current, username])]
      : current.filter((name) => name !== username);
    await saveDelegatedAdminUsernames(subredditName, next);
    return c.json({ ok: true, username, granted: payload.granted, delegates: next });
  } catch (error) {
    console.error('Failed to update delegated moderator access', error);
    return c.json({ error: 'Could not verify the live moderator team. No access changes were made.' }, 502);
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
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Top-moderator or delegated moderator access required.' }, 403);
    }
    const payload = await c.req.json<{ config: AdminConfig }>();
    const normalized = normalizeAdminConfig(payload?.config, 'strict');
    if (!normalized.ok) return c.json({ error: normalized.error }, 400);

    const config = normalized.config;
    const encoded = encodeConfig(config);
    if (JSON.stringify({ portalAdmin: true, portalConfig: encoded }).length > 2000) {
      return c.json({ error: 'Configuration is too large for Reddit post data. Remove unused assets or buttons.' }, 400);
    }

    const adminPostId = toRedditPostId(context.postId);
    if (!adminPostId) return c.json({ error: 'Invalid Reddit post ID.' }, 400);
    const adminPost = await reddit.getPostById(adminPostId);
    if (
      normalizeSubredditName(adminPost.subredditName) !==
      normalizeSubredditName(context.subredditName)
    ) {
      return c.json({ error: 'Admin panel does not belong to this subreddit.' }, 403);
    }
    const storedAdminData = await reddit.getPostData(adminPostId);
    if (!isAdminPanelPostData(storedAdminData)) {
      return c.json({ error: 'This post is not a valid admin panel.' }, 403);
    }
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
            if (normalizeSubredditName(post.subredditName) !== normalizeSubredditName(subredditName)) {
              results.push({
                subredditName,
                status: 'error',
                error: 'Stored post belongs to a different subreddit. No changes were made.',
              });
              continue;
            }
            const storedTargetData = await reddit.getPostData(current.postId);
            if (!toRedditPostId(storedTargetData?.portalAdminPostId)) {
              results.push({
                subredditName,
                status: 'error',
                error: 'Stored post is not linked to an admin panel. No changes were made.',
              });
              continue;
            }
            await post.setPostData({ portalAdminPostId: adminPostId });
            results.push({ subredditName, status: 'updated', postId: current.postId });
          } catch (error) {
            console.warn('Managed navigation post is stale; recreating it.', current.postId, error);
            const post = await reddit.submitCustomPost({
              subredditName,
              title: '\u200B',
              entry: 'default',
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

    // Keep records for communities that were unselected so adding them again
    // updates the existing navigation post instead of creating a duplicate.
    const nextTargets = [...bySub.values()];
    await saveTargetPosts(nextTargets);
    return c.json({ ok: true, config, targets: nextTargets, results });
  } catch (error) {
    console.error('Failed to save admin config', error);
    return c.json({ error: 'Failed to save and apply the configuration.' }, 500);
  }
});


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const matchesDeclaredImage = (bytes: Buffer, mimeType: string): boolean => {
  const mime = mimeType.toLowerCase();
  if (bytes.length < 12) return false;
  if (mime === 'image/gif') {
    const header = bytes.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (mime === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
};

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
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Top-moderator or delegated moderator access required.' }, 403);
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
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Top-moderator or delegated moderator access required.' }, 403);
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
    if (!matchesDeclaredImage(combined, meta.mimeType)) {
      await redis.del(key);
      return c.json({ error: 'The uploaded file does not match its declared image type.' }, 400);
    }
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
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Top-moderator or delegated moderator access required.' }, 403);
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
    if (!matchesDeclaredImage(Buffer.from(base64, 'base64'), match[1])) {
      return c.json({ error: 'The uploaded file does not match its declared image type.' }, 400);
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
      return c.json({ error: 'Top-moderator or delegated moderator access required.' }, 403);
    }

    const adminPostId = toRedditPostId(await redis.get(ADMIN_POST_KEY) ?? undefined);
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'default',
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
 * Menu endpoints return HTTP 200 with a UiResponse on handled errors so
 * the Devvit bridge can display our toast instead of a generic gateway error.
 * devvit.json can only limit these actions to moderators, so the handlers
 * repeat the top-moderator or moderator check and fail closed.
 */
const retargetManagedPosts = async (adminPostId: RedditPostId) => {
  const targets = await getTargetPosts();
  for (const target of targets) {
    try {
      if (!(await isCurrentUserModerator(target.subredditName))) {
        console.warn('Skipping managed-post retarget; actor is not a moderator of r/' + target.subredditName);
        continue;
      }
      const post = await reddit.getPostById(target.postId);
      if (normalizeSubredditName(post.subredditName) !== normalizeSubredditName(target.subredditName)) {
        console.warn('Skipping managed-post retarget; stored post belongs to a different subreddit.', target.postId);
        continue;
      }
      const stored = await reddit.getPostData(target.postId);
      if (isAdminPanelPostData(stored)) {
        console.warn('Skipping managed-post retarget; stored post is an admin panel.', target.postId);
        continue;
      }
      await post.setPostData({ portalAdminPostId: adminPostId });
    } catch (error) {
      console.warn('Could not retarget managed navigation post', target.postId, error);
    }
  }
};

app.post('/internal/menu/create-admin', async (c) => {
  try {
    await c.req.json<MenuItemRequest>().catch(() => ({}));
    const { subredditName } = context;
    if (!subredditName || !(await isCurrentUserSubredditOwner(subredditName))) {
      return c.json<UiResponse>({ showToast: 'Only this subreddit’s top moderator can create the admin panel.' });
    }
    // A replacement panel starts blank. Clear grants before the new post exists
    // so a failed recreate cannot leave the previous delegates authorized.
    await redis.del(getDelegatedAdminsKey(subredditName));
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
    await retargetManagedPosts(post.id);
    console.log('Created admin panel custom post ' + post.id + ' in r/' + subredditName);
    return c.json<UiResponse>({
      showToast: `Blank admin panel created in r/${subredditName}. Previous delegated access was cleared.`,
    });
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
    if (!(await isCurrentUserModerator(subredditName))) {
      return c.json<UiResponse>({ showToast: 'Moderator access is required.' });
    }

    console.log('Create post menu action received for r/' + subredditName);

    const adminPostId = toRedditPostId(await redis.get(ADMIN_POST_KEY) ?? undefined);
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '\u200B',
      entry: 'default',
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
      showToast: 'Navigation post created.',
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
