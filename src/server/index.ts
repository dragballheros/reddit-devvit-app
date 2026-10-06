import { Hono } from 'hono';
import { createServer, context, getServerPort, reddit } from '@devvit/web/server';
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

app.post('/internal/menu/create-post', async (c) => {
  try {
    await c.req.json<MenuItemRequest>().catch(() => ({}));

    const subredditName = context.subredditName;
    if (!subredditName || !(await isCurrentUserModerator(subredditName))) {
      return c.json<UiResponse>({
        showToast: 'Moderator access is required to create the example post.',
      });
    }

    const post = await reddit.submitCustomPost({
      subredditName,
      title: 'HentaiApp Portal Demo',
      entry: 'default',
    });

    return c.json<UiResponse>({
      showToast: 'Example post created.',
      navigateTo: post.permalink,
    });
  } catch (error) {
    console.error('Failed to create example post', error);
    return c.json<UiResponse>({
      showToast: 'Failed to create the example post. Check the app account permissions.',
    });
  }
});

const server = createServer(app);
server.on('error', (error: Error) => console.error(`server error; ${error.message}`));
server.listen(getServerPort());
