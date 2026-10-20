import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, reddit, context, redis, media } from '@devvit/web/server';
import { inflateSync, deflateSync } from 'node:zlib';
import { APP_CONFIG, getDefaultAdminConfig, isAdminPanelPostData, normalizeAdminConfig, normalizeManagedSubredditName, normalizeSubredditName, readOwnSubredditConfigPayload, resolveRuntimeAdminPostId, type AdminConfig, type AppConfig } from '../shared/subreddit';
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

const readNormalizedConfig = (encoded?: string): { config?: AdminConfig; warnings: string[] } => {
  if (!encoded) return { warnings: [] };
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

const getAdminConfigFromPost = async (postId?: string): Promise<{ config?: AdminConfig; warnings: string[] }> => {
  const redditPostId = toRedditPostId(postId);
  if (!redditPostId) return { warnings: [] };
  const data = await reddit.getPostData(redditPostId);
  // A link to an arbitrary post must never be treated as an admin configuration.
  if (!isAdminPanelPostData(data)) return { warnings: [] };
  const encoded = typeof data?.portalConfig === 'string' ? data.portalConfig : undefined;
  if (!encoded) return { config: getDefaultAdminConfig(), warnings: [] };
  return readNormalizedConfig(encoded);
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

const readDelegateNames = (delegates: unknown): string[] => {
  if (!Array.isArray(delegates)) return [];
  return [...new Set(delegates.filter((name): name is string =>
    typeof name === 'string' && /^[a-z0-9_-]{3,20}$/i.test(name)
  ).map((name) => name.trim().toLowerCase()))];
};

const getDelegatedAdminUsernames = async (subredditName: string): Promise<string[]> => {
  const raw = await redis.get(getDelegatedAdminsKey(subredditName));
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    // Grants are a shared list. They are not tied to one moderator, because
    // several moderators may have Everything at the same time.
    return readDelegateNames((value as { delegates?: unknown }).delegates);
  } catch {
    return [];
  }
};

const saveDelegatedAdminUsernames = async (subredditName: string, usernames: string[]) => {
  const delegates = readDelegateNames(usernames);
  return redis.set(getDelegatedAdminsKey(subredditName), JSON.stringify({ delegates }));
};

type ModeratorRosterEntry = { username: string; everything: boolean };

/**
 * Full live moderator roster with each account's Everything flag.
 * Returns undefined when the listing or any permission set cannot be verified.
 */
const getModeratorRoster = async (subredditName: string): Promise<ModeratorRosterEntry[] | undefined> => {
  try {
    const subreddit = await reddit.getSubredditByName(subredditName);
    const moderators = await subreddit.getModerators().all();
    const roster = new Map<string, ModeratorRosterEntry>();
    for (const moderator of moderators) {
      const username = moderator.username?.trim().toLowerCase();
      const permissions = moderator.moderatorInfo?.modPermissions;
      if (!username || !Array.isArray(permissions)) return undefined;
      const existing = roster.get(username);
      roster.set(username, {
        username,
        everything: Boolean(existing?.everything || permissions.includes('all')),
      });
    }
    return roster.size > 0 ? [...roster.values()] : undefined;
  } catch (error) {
    console.warn('Could not verify the live moderator team.', error);
    return undefined;
  }
};

/** Live permissions for the acting user. Undefined means the check failed closed. */
const getCurrentUserModPermissions = async (subredditName: string): Promise<string[] | undefined> => {
  try {
    const user =
      context.userId
        ? await reddit.getUserById(context.userId)
        : context.username
          ? await reddit.getUserByUsername(context.username)
          : undefined;
    if (!user) return undefined;
    const permissions = await user.getModPermissionsForSubreddit(subredditName);
    return Array.isArray(permissions) ? permissions : undefined;
  } catch (error) {
    console.warn('Could not verify moderator permissions; denying the action.', error);
    return undefined;
  }
};

const isCurrentUserModerator = async (subredditName: string): Promise<boolean> => {
  const permissions = await getCurrentUserModPermissions(subredditName);
  return Boolean(permissions && permissions.length > 0);
};

/** Reddit's Everything moderator permission is the permission named "all". */
const isCurrentUserEverythingModerator = async (subredditName: string): Promise<boolean> => {
  const permissions = await getCurrentUserModPermissions(subredditName);
  return Boolean(permissions?.includes('all'));
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

/** Only a moderator with Everything can manage delegated admin grants. */
const requireAdminPanelOwner = async (): Promise<boolean> => {
  const subredditName = normalizeManagedSubredditName(context.subredditName);
  return Boolean(subredditName && await isCanonicalAdminPanelContext() && await isCurrentUserEverythingModerator(subredditName));
};

/**
 * A moderator with Everything, or an explicitly delegated moderator, may
 * configure the portal. A delegate is checked against Reddit's live moderator
 * permissions on every request, so a removed moderator loses access immediately
 * even if a stale grant remains in Redis.
 */
const requireAdminPanelAccess = async (): Promise<boolean> => {
  const subredditName = normalizeManagedSubredditName(context.subredditName);
  if (!subredditName || !(await isCanonicalAdminPanelContext())) return false;
  if (await isCurrentUserEverythingModerator(subredditName)) return true;
  if (!(await isCurrentUserModerator(subredditName))) return false;
  const username = await getCurrentUsername();
  if (!username) return false;
  return (await getDelegatedAdminUsernames(subredditName)).includes(username);
};

const POST_DATA_LIMIT = 2000;

const independentConfig = (config: AdminConfig): AdminConfig => ({
  ...config,
  managedSubreddits: [],
});

const buildAdminPostData = (config: AdminConfig) => {
  const postData = { portalAdmin: true, portalConfig: encodeConfig(config), updatedAt: Date.now() };
  return JSON.stringify(postData).length > POST_DATA_LIMIT ? undefined : postData;
};

const buildTargetPostData = (adminPostId: RedditPostId, config: AdminConfig) => {
  const postData = {
    portalSubredditConfig: true,
    portalAdminPostId: adminPostId,
    portalConfig: encodeConfig(independentConfig(config)),
    updatedAt: Date.now(),
  };
  return JSON.stringify(postData).length > POST_DATA_LIMIT ? undefined : postData;
};

const everythingPermissionError = (subredditName: string) =>
  `Could not confirm that you have the Everything moderator permission in r/${subredditName}. No changes were made.`;

type CommunityRole = 'home' | 'connected';

type CommunityRecord = {
  subredditName: string;
  role: CommunityRole;
  canEdit: boolean;
  canRead: boolean;
  followsHome: boolean;
  postId?: string;
  config?: AdminConfig;
  warnings?: string[];
};

const loadCanonicalAdminPost = async () => {
  const adminPostId = toRedditPostId(context.postId);
  const homeName = normalizeManagedSubredditName(context.subredditName);
  if (!adminPostId || !homeName) return { error: 'Invalid Reddit post ID.', status: 400 as const };
  const adminPost = await reddit.getPostById(adminPostId);
  if (normalizeSubredditName(adminPost.subredditName) !== normalizeSubredditName(homeName)) {
    return { error: 'Admin panel does not belong to this subreddit.', status: 403 as const };
  }
  const storedAdminData = await reddit.getPostData(adminPostId);
  if (!isAdminPanelPostData(storedAdminData)) {
    return { error: 'This post is not a valid admin panel.', status: 403 as const };
  }
  return { adminPostId, adminPost, homeName };
};

/**
 * Copy the current home configuration onto legacy navigation posts that still
 * follow this panel. Only a moderator with Everything on a target can write it.
 * Posts that already store their own configuration are left unchanged.
 */
const snapshotLegacyTargets = async (sourceConfig: AdminConfig, adminPostId: RedditPostId): Promise<Set<string>> => {
  const written = new Set<string>();
  const connected = new Set(sourceConfig.managedSubreddits.map((name) => name.toLowerCase()));
  const targets = await getTargetPosts();
  for (const target of targets) {
    if (!connected.has(target.subredditName.toLowerCase())) continue;
    try {
      if (!(await isCurrentUserEverythingModerator(target.subredditName))) continue;
      const post = await reddit.getPostById(target.postId);
      if (normalizeSubredditName(post.subredditName) !== normalizeSubredditName(target.subredditName)) continue;
      const stored = await reddit.getPostData(target.postId);
      if (isAdminPanelPostData(stored) || readOwnSubredditConfigPayload(stored)) continue;
      const postData = buildTargetPostData(adminPostId, sourceConfig);
      if (!postData) {
        console.warn('Skipping configuration snapshot; it is too large for r/' + target.subredditName);
        continue;
      }
      await post.setPostData(postData);
      written.add(target.subredditName.toLowerCase());
    } catch (error) {
      console.warn('Could not snapshot navigation config for r/' + target.subredditName, error);
    }
  }
  return written;
};

const collectCommunities = async (
  homeConfig: AdminConfig,
  homeName: string,
  isHomeOwner: boolean,
  adminPostId: RedditPostId,
): Promise<CommunityRecord[]> => {
  const snapshotted = await snapshotLegacyTargets(homeConfig, adminPostId);
  const targets = await getTargetPosts();
  const bySub = new Map(targets.map((item) => [item.subredditName, item]));
  const names = [homeName, ...homeConfig.managedSubreddits.filter((name) => name !== homeName)];
  const communities: CommunityRecord[] = [];

  for (const name of names) {
    if (name === homeName) {
      communities.push({
        subredditName: name,
        role: 'home',
        canEdit: true,
        canRead: true,
        followsHome: false,
        postId: adminPostId,
        config: homeConfig,
        warnings: [],
      });
      continue;
    }

    const canEdit = await isCurrentUserEverythingModerator(name);
    const canRead = isHomeOwner || canEdit;
    const record = bySub.get(name);
    let followsHome = true;
    let config = homeConfig;
    let warnings: string[] = [];
    if (snapshotted.has(name)) {
      followsHome = false;
      config = independentConfig(homeConfig);
    } else if (record) {
      try {
        const data = await reddit.getPostData(record.postId);
        const own = readOwnSubredditConfigPayload(data);
        if (own) {
          followsHome = false;
          const loaded = readNormalizedConfig(own);
          config = loaded.config ?? independentConfig(homeConfig);
          warnings = loaded.warnings;
        }
      } catch (error) {
        console.warn('Could not read connected navigation post', record.postId, error);
      }
    }

    communities.push({
      subredditName: name,
      role: 'connected',
      canEdit,
      canRead,
      followsHome,
      postId: record?.postId,
      ...(canRead ? { config, warnings } : {}),
    });
  }

  return communities;
};

app.get('/api/runtime-config', async (c) => {
  try {
    const ownPayload = readOwnSubredditConfigPayload(context.postData);
    if (ownPayload) {
      try {
        const normalized = normalizeAdminConfig(decodeConfig(ownPayload), 'coerce');
        if (normalized.ok) {
          return c.json({ config: effectiveConfig(normalized.config), adminPostId: null });
        }
      } catch (error) {
        console.warn('Stored subreddit configuration could not be read; following the admin panel.', error);
      }
    }
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
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
    }
    const loaded = await getAdminConfigFromPost(context.postId);
    const config = loaded.config ?? getDefaultAdminConfig();
    const subredditName = normalizeManagedSubredditName(context.subredditName)!;
    const isOwner = await isCurrentUserEverythingModerator(subredditName);
    const adminPostId = toRedditPostId(context.postId)!;
    const communities = (await collectCommunities(config, subredditName, isOwner, adminPostId))
      .map((community) => community.role === 'home' ? { ...community, warnings: loaded.warnings } : community);
    const homeCommunity = communities.find((community) => community.role === 'home');
    return c.json({
      config: homeCommunity?.config ?? config,
      warnings: loaded.warnings,
      targets: await getTargetPosts(),
      adminPostId: context.postId,
      accessLevel: isOwner ? 'everything' : 'delegatedModerator',
      canManageAccess: isOwner,
      homeSubreddit: subredditName,
      communities,
    });
  } catch (error) {
    console.error('Failed to load admin config', error);
    return c.json({ error: 'Failed to load admin configuration.' }, 500);
  }
});

app.get('/api/admin/access', async (c) => {
  try {
    if (!(await requireAdminPanelOwner())) {
      return c.json({ error: 'Only a moderator with Everything in this subreddit can manage admin access.' }, 403);
    }
    const subredditName = normalizeManagedSubredditName(context.subredditName)!;
    const [roster, storedDelegates] = await Promise.all([
      getModeratorRoster(subredditName),
      getDelegatedAdminUsernames(subredditName),
    ]);
    if (!roster) {
      return c.json({ error: 'Could not verify the live moderator team. No access changes were made.' }, 502);
    }
    // Prune grants for accounts that left the team or now have Everything.
    // Runtime access checks already deny removed moderators before this cleanup.
    // Moderators with Everything already have access and are never stored as delegates.
    const current = new Map(roster.map((moderator) => [moderator.username, moderator]));
    const delegates = storedDelegates.filter((username) => {
      const moderator = current.get(username);
      return Boolean(moderator && !moderator.everything);
    });
    if (delegates.length !== storedDelegates.length) {
      await saveDelegatedAdminUsernames(subredditName, delegates);
    }
    return c.json({
      moderators: roster,
      delegates,
      scannedAt: Date.now(),
    });
  } catch (error) {
    console.error('Failed to scan subreddit moderator team', error);
    return c.json({ error: 'Could not verify the live moderator team. No access changes were made.' }, 502);
  }
});

app.post('/api/admin/access', async (c) => {
  try {
    if (!(await requireAdminPanelOwner())) {
      return c.json({ error: 'Only a moderator with Everything in this subreddit can grant or revoke admin access.' }, 403);
    }
    const payload = await c.req.json<{ username?: string; granted?: boolean }>();
    const username = typeof payload.username === 'string' ? payload.username.trim().replace(/^u\//i, '').toLowerCase() : '';
    if (!/^[a-z0-9_-]{3,20}$/i.test(username) || typeof payload.granted !== 'boolean') {
      return c.json({ error: 'Choose a valid moderator and grant or revoke access.' }, 400);
    }
    const subredditName = normalizeManagedSubredditName(context.subredditName)!;
    const roster = await getModeratorRoster(subredditName);
    if (!roster) {
      return c.json({ error: 'Could not verify the live moderator team. No access changes were made.' }, 502);
    }
    const moderator = roster.find((entry) => entry.username === username);
    if (moderator?.everything) {
      if (!payload.granted) {
        const current = (await getDelegatedAdminUsernames(subredditName)).filter((name) => name !== username);
        await saveDelegatedAdminUsernames(subredditName, current);
        return c.json({ ok: true, username, granted: false, delegates: current });
      }
      return c.json({ error: 'A moderator with Everything already has admin access and cannot be added as a delegate.' }, 400);
    }
    if (!moderator) {
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

const writeConnectedConfig = async (
  subredditName: string,
  config: AdminConfig,
  adminPostId: RedditPostId,
): Promise<{ error: string; status: 400 | 403 | 404 | 409 } | { ok: true }> => {
  if (!(await isCurrentUserEverythingModerator(subredditName))) {
    return { error: everythingPermissionError(subredditName), status: 403 };
  }
  const targets = await getTargetPosts();
  const current = targets.find((item) => item.subredditName === subredditName);
  if (!current) {
    return { error: `r/${subredditName} has no navigation post yet. Choose Connect Subreddit first.`, status: 404 };
  }
  const post = await reddit.getPostById(current.postId);
  if (normalizeSubredditName(post.subredditName) !== normalizeSubredditName(subredditName)) {
    return { error: 'Stored post belongs to a different subreddit. No changes were made.', status: 409 };
  }
  const stored = await reddit.getPostData(current.postId);
  if (isAdminPanelPostData(stored)) {
    return { error: 'Stored post is an admin panel. No changes were made.', status: 409 };
  }
  const postData = buildTargetPostData(adminPostId, config);
  if (!postData) {
    return { error: 'Configuration is too large for Reddit post data. Remove unused assets or buttons.', status: 400 };
  }
  await post.setPostData(postData);
  return { ok: true };
};

app.post('/api/admin/save', async (c) => {
  try {
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
    }
    const payload = await c.req.json<{ subredditName?: string; config: AdminConfig }>();
    const normalized = normalizeAdminConfig(payload?.config, 'strict');
    if (!normalized.ok) return c.json({ error: normalized.error }, 400);

    const loadedPanel = await loadCanonicalAdminPost();
    if ('error' in loadedPanel) return c.json({ error: loadedPanel.error }, loadedPanel.status);
    const { adminPostId, adminPost, homeName } = loadedPanel;
    const requested = normalizeManagedSubredditName(payload?.subredditName) ?? homeName;
    const stored = (await getAdminConfigFromPost(adminPostId)).config ?? getDefaultAdminConfig();

    if (requested === homeName) {
      await snapshotLegacyTargets(stored, adminPostId);
      const next = { ...normalized.config, managedSubreddits: stored.managedSubreddits };
      const postData = buildAdminPostData(next);
      if (!postData) {
        return c.json({ error: 'Configuration is too large for Reddit post data. Remove unused assets or buttons.' }, 400);
      }
      await adminPost.setPostData(postData);
      return c.json({ ok: true, subredditName: homeName, config: next });
    }

    if (!stored.managedSubreddits.includes(requested)) {
      return c.json({ error: `r/${requested} is not connected to this panel.` }, 400);
    }
    if (!(await isCurrentUserEverythingModerator(requested))) {
      return c.json({ error: everythingPermissionError(requested) }, 403);
    }
    const written = await writeConnectedConfig(requested, normalized.config, adminPostId);
    if ('error' in written) return c.json({ error: written.error }, written.status);
    return c.json({ ok: true, subredditName: requested, config: independentConfig(normalized.config) });
  } catch (error) {
    console.error('Failed to save admin config', error);
    return c.json({ error: 'Failed to save and apply the configuration.' }, 500);
  }
});

app.post('/api/admin/connect', async (c) => {
  try {
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
    }
    const payload = await c.req.json<{ subredditName?: string }>();
    const subredditName = normalizeManagedSubredditName(payload?.subredditName);
    const loadedPanel = await loadCanonicalAdminPost();
    if ('error' in loadedPanel) return c.json({ error: loadedPanel.error }, loadedPanel.status);
    const { adminPostId, adminPost, homeName } = loadedPanel;
    if (!subredditName) {
      return c.json({ error: 'Enter a subreddit name with 2–21 letters, numbers, or underscores.' }, 400);
    }
    if (subredditName === homeName) {
      return c.json({ error: 'This community is already in the editor. Choose it under Editing.' }, 400);
    }
    if (!(await isCurrentUserEverythingModerator(subredditName))) {
      return c.json({ error: everythingPermissionError(subredditName) }, 403);
    }

    const stored = (await getAdminConfigFromPost(adminPostId)).config ?? getDefaultAdminConfig();
    const postData = buildTargetPostData(adminPostId, stored);
    if (!postData) {
      return c.json({ error: 'The saved configuration is too large to copy onto another subreddit. Remove unused assets or buttons, save this community, and try again.' }, 400);
    }

    const existing = await getTargetPosts();
    const bySub = new Map(existing.map((item) => [item.subredditName, item]));
    let record = bySub.get(subredditName);
    if (record) {
      try {
        const post = await reddit.getPostById(record.postId);
        if (normalizeSubredditName(post.subredditName) !== normalizeSubredditName(subredditName)) {
          return c.json({ error: 'Stored post belongs to a different subreddit. No changes were made.' }, 409);
        }
        const storedTarget = await reddit.getPostData(record.postId);
        if (isAdminPanelPostData(storedTarget)) {
          return c.json({ error: 'Stored post is an admin panel. No changes were made.' }, 409);
        }
        if (!readOwnSubredditConfigPayload(storedTarget)) {
          await post.setPostData(postData);
        }
      } catch (error) {
        console.warn('Connected navigation post is missing; creating a new one.', record.postId, error);
        record = undefined;
      }
    }

    if (!record) {
      try {
        const post = await reddit.submitCustomPost({
          subredditName,
          title: '\u200B',
          entry: 'default',
          postData,
        });
        record = { subredditName, postId: post.id };
        bySub.set(subredditName, record);
      } catch (error) {
        console.error('Failed to create connected navigation post', subredditName, error);
        return c.json({
          error: `The app must be installed in r/${subredditName}, and you must have the Everything moderator permission there. No navigation post was created.`,
        }, 403);
      }
    }

    await saveTargetPosts([...bySub.values()]);
    if (!stored.managedSubreddits.includes(subredditName)) {
      const next = { ...stored, managedSubreddits: [...stored.managedSubreddits, subredditName] };
      const adminData = buildAdminPostData(next);
      if (!adminData) {
        return c.json({ error: 'This panel cannot store another connected subreddit until unused assets or buttons are removed.' }, 400);
      }
      await adminPost.setPostData(adminData);
    }
    return c.json({ ok: true, subredditName });
  } catch (error) {
    console.error('Failed to connect subreddit', error);
    return c.json({ error: 'Failed to connect that subreddit. No changes were made.' }, 500);
  }
});

app.post('/api/admin/disconnect', async (c) => {
  try {
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
    }
    const payload = await c.req.json<{ subredditName?: string }>();
    const subredditName = normalizeManagedSubredditName(payload?.subredditName);
    const loadedPanel = await loadCanonicalAdminPost();
    if ('error' in loadedPanel) return c.json({ error: loadedPanel.error }, loadedPanel.status);
    const { adminPostId, adminPost, homeName } = loadedPanel;
    if (!subredditName || subredditName === homeName) {
      return c.json({ error: 'Choose a connected subreddit other than this community.' }, 400);
    }
    const stored = (await getAdminConfigFromPost(adminPostId)).config ?? getDefaultAdminConfig();
    if (!stored.managedSubreddits.includes(subredditName)) {
      return c.json({ error: `r/${subredditName} is not connected to this panel.` }, 400);
    }

    const record = (await getTargetPosts()).find((item) => item.subredditName === subredditName);
    if (record) {
      try {
        const post = await reddit.getPostById(record.postId);
        if (normalizeSubredditName(post.subredditName) !== normalizeSubredditName(subredditName)) {
          return c.json({ error: 'Stored post belongs to a different subreddit. No changes were made.' }, 409);
        }
        const storedTarget = await reddit.getPostData(record.postId);
        if (!isAdminPanelPostData(storedTarget) && !readOwnSubredditConfigPayload(storedTarget)) {
          if (!(await isCurrentUserEverythingModerator(subredditName))) {
            return c.json({
              error: `Could not confirm that you have the Everything moderator permission in r/${subredditName}. Disconnect was refused so r/${subredditName} keeps its current navigation.`,
            }, 403);
          }
          const postData = buildTargetPostData(adminPostId, stored);
          if (!postData) {
            return c.json({ error: 'The current configuration is too large to keep on that navigation post. No changes were made.' }, 400);
          }
          await post.setPostData(postData);
        }
      } catch (error) {
        console.error('Could not verify navigation post before disconnect', record.postId, error);
        return c.json({ error: `Could not verify the navigation post for r/${subredditName}. No changes were made.` }, 502);
      }
    }

    const next = { ...stored, managedSubreddits: stored.managedSubreddits.filter((name) => name !== subredditName) };
    const adminData = buildAdminPostData(next);
    if (!adminData) {
      return c.json({ error: 'Could not update the connected subreddit list. No changes were made.' }, 400);
    }
    await adminPost.setPostData(adminData);
    return c.json({ ok: true, subredditName });
  } catch (error) {
    console.error('Failed to disconnect subreddit', error);
    return c.json({ error: 'Failed to disconnect that subreddit. No changes were made.' }, 500);
  }
});

app.post('/api/admin/paste', async (c) => {
  try {
    if (!(await requireAdminPanelAccess())) {
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
    }
    const payload = await c.req.json<{ sourceSubreddit?: string; targetSubreddit?: string; config: AdminConfig }>();
    const normalized = normalizeAdminConfig(payload?.config, 'strict');
    if (!normalized.ok) return c.json({ error: normalized.error }, 400);

    const sourceSubreddit = normalizeManagedSubredditName(payload?.sourceSubreddit);
    const targetSubreddit = normalizeManagedSubredditName(payload?.targetSubreddit);
    const loadedPanel = await loadCanonicalAdminPost();
    if ('error' in loadedPanel) return c.json({ error: loadedPanel.error }, loadedPanel.status);
    const { adminPostId, adminPost, homeName } = loadedPanel;
    if (!sourceSubreddit || !targetSubreddit || sourceSubreddit === targetSubreddit) {
      return c.json({ error: 'Copy a configuration, select a different subreddit, then paste it.' }, 400);
    }

    const stored = (await getAdminConfigFromPost(adminPostId)).config ?? getDefaultAdminConfig();
    const known = new Set([homeName, ...stored.managedSubreddits]);
    if (!known.has(sourceSubreddit) || !known.has(targetSubreddit)) {
      return c.json({ error: 'Copy and paste only work between this community and connected subreddits.' }, 400);
    }
    const isHomeOwner = await isCurrentUserEverythingModerator(homeName);
    const sourceReadable = sourceSubreddit === homeName
      || isHomeOwner
      || await isCurrentUserEverythingModerator(sourceSubreddit);
    if (!sourceReadable) {
      return c.json({ error: `You cannot copy the configuration for r/${sourceSubreddit}.` }, 403);
    }
    const targetEditable = targetSubreddit === homeName || await isCurrentUserEverythingModerator(targetSubreddit);
    if (!targetEditable) {
      return c.json({ error: everythingPermissionError(targetSubreddit) }, 403);
    }

    if (targetSubreddit === homeName) {
      await snapshotLegacyTargets(stored, adminPostId);
      const next = { ...normalized.config, managedSubreddits: stored.managedSubreddits };
      const postData = buildAdminPostData(next);
      if (!postData) {
        return c.json({ error: 'Configuration is too large for Reddit post data. Remove unused assets or buttons.' }, 400);
      }
      await adminPost.setPostData(postData);
      return c.json({ ok: true, subredditName: homeName, config: next });
    }

    const written = await writeConnectedConfig(targetSubreddit, normalized.config, adminPostId);
    if ('error' in written) return c.json({ error: written.error }, written.status);
    return c.json({ ok: true, subredditName: targetSubreddit, config: independentConfig(normalized.config) });
  } catch (error) {
    console.error('Failed to paste subreddit configuration', error);
    return c.json({ error: 'Failed to paste that configuration. No changes were made.' }, 500);
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
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
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
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
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
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
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
      return c.json({ error: 'Everything moderator permission or delegated moderator access required.' }, 403);
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
      if (!(await isCurrentUserEverythingModerator(target.subredditName))) {
        console.warn('Skipping managed-post retarget; actor does not have Everything in r/' + target.subredditName);
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
      const own = readOwnSubredditConfigPayload(stored);
      if (!own) {
        console.warn('Skipping managed-post retarget; r/' + target.subredditName + ' still follows the previous panel.');
        continue;
      }
      const postData = {
        portalSubredditConfig: true,
        portalAdminPostId: adminPostId,
        portalConfig: own,
        updatedAt: typeof stored?.updatedAt === 'number' ? stored.updatedAt : Date.now(),
      };
      if (JSON.stringify(postData).length > POST_DATA_LIMIT) {
        console.warn('Skipping managed-post retarget; preserving the existing configuration for r/' + target.subredditName);
        continue;
      }
      await post.setPostData(postData);
    } catch (error) {
      console.warn('Could not retarget managed navigation post', target.postId, error);
    }
  }
};

app.post('/internal/menu/create-admin', async (c) => {
  try {
    await c.req.json<MenuItemRequest>().catch(() => ({}));
    const { subredditName } = context;
    if (!subredditName || !(await isCurrentUserEverythingModerator(subredditName))) {
      return c.json<UiResponse>({ showToast: 'Only a moderator with Everything in this subreddit can create the admin panel.' });
    }
    const existing = await redis.get(ADMIN_POST_KEY);
    if (existing) {
      try {
        const previous = await getAdminConfigFromPost(existing);
        if (previous.config) await snapshotLegacyTargets(previous.config, existing as RedditPostId);
      } catch (error) {
        console.warn('Could not snapshot connected navigation posts before replacing the panel.', error);
      }
    }
    // A replacement panel starts blank. Clear grants before the new post exists
    // so a failed recreate cannot leave the previous delegates authorized.
    await redis.del(getDelegatedAdminsKey(subredditName));
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
