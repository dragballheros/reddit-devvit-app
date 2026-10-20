import {
  isAdminPanelPostData,
  normalizeManagedSubredditName,
  normalizeSubredditName,
  readOwnSubredditConfigPayload,
} from './subreddit.ts';

/**
 * Redis is scoped to one installation. These helpers describe the connection
 * that works across installations: Reddit lists where the app is installed,
 * and the target navigation post holds that community's configuration.
 */

export const TARGET_POST_CACHE_KEY = 'community-portal:target-posts';

/** Stop a dashboard request from checking an unbounded moderator list. */
export const INSTALLATION_CHECK_CAP = 40;

export type InstallationCandidate = {
  subredditName: string;
  /** Undefined means the live permission check failed and the community is omitted. */
  permissions?: readonly string[] | undefined;
};

export type EligibleInstallation = {
  subredditName: string;
  connected: boolean;
};

export type StoredNavigationPost = {
  id: string;
  subredditName: string;
  authorName: string;
  postData?: unknown;
};

export type InstallationState = {
  subredditName: string;
  redis: Record<string, string>;
  posts: StoredNavigationPost[];
};

export type ConnectionPlan =
  | { action: 'reuse'; postId: string }
  | { action: 'update'; postId: string }
  | { action: 'create' };

const normalizedConnected = (names: readonly string[]): Set<string> => {
  const connected = new Set<string>();
  for (const name of names) {
    const normalized = normalizeManagedSubredditName(name);
    if (normalized) connected.add(normalized);
  }
  return connected;
};

/**
 * Keep other installations where the acting user has Everything.
 * A missing permission array, a list without "all", the home community, and
 * duplicate names are omitted. The result is fail closed.
 */
export const selectEligibleInstallations = (input: {
  homeSubreddit: string;
  candidates: readonly InstallationCandidate[];
  connected?: readonly string[];
}): EligibleInstallation[] => {
  const home = normalizeManagedSubredditName(input.homeSubreddit);
  const connected = normalizedConnected(input.connected ?? []);
  const seen = new Set<string>();
  const eligible: EligibleInstallation[] = [];
  for (const candidate of input.candidates) {
    const name = normalizeManagedSubredditName(candidate.subredditName);
    if (!name || name === home || seen.has(name)) continue;
    if (!Array.isArray(candidate.permissions) || !candidate.permissions.includes('all')) continue;
    seen.add(name);
    eligible.push({ subredditName: name, connected: connected.has(name) });
  }
  eligible.sort((left, right) => left.subredditName.localeCompare(right.subredditName));
  return eligible;
};

/** Drop the home community and cap how many other installations are checked. */
export const limitInstallationNames = (
  names: readonly string[],
  homeSubreddit: string,
  cap = INSTALLATION_CHECK_CAP,
): { names: string[]; truncated: boolean } => {
  const home = normalizeManagedSubredditName(homeSubreddit);
  const seen = new Set<string>();
  const kept: string[] = [];
  let truncated = false;
  for (const raw of names) {
    const name = normalizeManagedSubredditName(raw);
    if (!name || name === home || seen.has(name)) continue;
    seen.add(name);
    if (kept.length >= cap) {
      truncated = true;
      continue;
    }
    kept.push(name);
  }
  return { names: kept, truncated };
};

/**
 * Pick the navigation post a connection should write.
 * Posts that already store their own configuration win, then the remembered
 * post id, then the first remaining app post. Callers pass newest posts first.
 * Admin panels are never selected.
 */
export const chooseNavigationPost = (input: {
  posts: readonly StoredNavigationPost[];
  subredditName: string;
  appAuthor: string;
  rememberedPostId?: string;
}): StoredNavigationPost | undefined => {
  const subreddit = normalizeSubredditName(input.subredditName);
  const author = input.appAuthor.trim().toLowerCase();
  const usable = input.posts.filter((post) =>
    normalizeSubredditName(post.subredditName) === subreddit && !isAdminPanelPostData(post.postData)
  );
  const owned = usable.find((post) => readOwnSubredditConfigPayload(post.postData));
  if (owned) return owned;
  if (input.rememberedPostId) {
    const remembered = usable.find((post) => post.id === input.rememberedPostId);
    if (remembered) return remembered;
  }
  if (!author) return undefined;
  return usable.find((post) => post.authorName.trim().toLowerCase() === author);
};

export const planConnection = (input: {
  posts: readonly StoredNavigationPost[];
  subredditName: string;
  appAuthor: string;
  rememberedPostId?: string;
}): ConnectionPlan => {
  const chosen = chooseNavigationPost(input);
  if (!chosen) return { action: 'create' };
  if (readOwnSubredditConfigPayload(chosen.postData)) return { action: 'reuse', postId: chosen.id };
  return { action: 'update', postId: chosen.id };
};

/**
 * Model one connection between two installations.
 * The source Redis cache records the target post id. The target post data
 * receives the configuration when it does not already have one. The target
 * Redis map is not written.
 */
export const applyConnection = (input: {
  source: InstallationState;
  target: InstallationState;
  adminPostId: string;
  encodedConfig: string;
  appAuthor: string;
  rememberedPostId?: string;
  newPostId: string;
  cacheKey?: string;
}): {
  source: InstallationState;
  target: InstallationState;
  postId: string;
  action: ConnectionPlan['action'];
} => {
  const cacheKey = input.cacheKey ?? TARGET_POST_CACHE_KEY;
  const targetPosts = input.target.posts.map((post) => ({ ...post }));
  const plan = planConnection({
    posts: targetPosts,
    subredditName: input.target.subredditName,
    appAuthor: input.appAuthor,
    rememberedPostId: input.rememberedPostId,
  });
  const payload = {
    portalSubredditConfig: true,
    portalAdminPostId: input.adminPostId,
    portalConfig: input.encodedConfig,
  };
  let postId = input.newPostId;
  if (plan.action === 'create') {
    targetPosts.push({
      id: input.newPostId,
      subredditName: input.target.subredditName,
      authorName: input.appAuthor,
      postData: payload,
    });
  } else {
    postId = plan.postId;
    if (plan.action === 'update') {
      const post = targetPosts.find((item) => item.id === plan.postId);
      if (post) post.postData = payload;
    }
  }
  let cached: Array<{ subredditName?: unknown; postId?: unknown }> = [];
  try {
    const parsed: unknown = JSON.parse(input.source.redis[cacheKey] ?? '[]');
    if (Array.isArray(parsed)) cached = parsed as Array<{ subredditName?: unknown; postId?: unknown }>;
  } catch {
    cached = [];
  }
  const nextCache = [
    ...cached.filter((item) => item?.subredditName !== input.target.subredditName),
    { subredditName: input.target.subredditName, postId },
  ];
  return {
    action: plan.action,
    postId,
    source: {
      ...input.source,
      redis: { ...input.source.redis, [cacheKey]: JSON.stringify(nextCache) },
    },
    target: {
      ...input.target,
      redis: { ...input.target.redis },
      posts: targetPosts,
    },
  };
};
