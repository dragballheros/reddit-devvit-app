import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, reddit, context } from '@devvit/web/server';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';

const app = new Hono();

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

app.post('/api/moderator/create-post', async (c) => {
  try {
    const subredditName = context.subredditName;
    if (!subredditName || !(await isCurrentUserModerator(subredditName))) {
      return c.json({ error: 'Moderator access required.' }, 403);
    }

    const post = await reddit.submitCustomPost({
      subredditName,
      title: 'HentaiApp Portal Demo',
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
      title: 'HentaiApp Portal Demo',
      entry: 'default',
    });

    console.log('Created HentaiApp custom post ' + post.id + ' in r/' + subredditName);

    return c.json<UiResponse>({
      showToast: 'Example post created.',
      navigateTo: post.permalink,
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
