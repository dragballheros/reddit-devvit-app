import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { context, createServer, getServerPort, reddit } from '@devvit/web/server';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';

const app = new Hono();
const internal = new Hono();

internal.post('/menu/create-post', async (c) => {
  await c.req.json<MenuItemRequest>().catch(() => ({}));

  const subredditName = context.subredditName;
  if (!subredditName) {
    return c.json<UiResponse>({
      showToast: 'No subreddit context was available.',
    });
  }

  try {
    const post = await reddit.submitCustomPost({
      subredditName,
      title: 'AnimeH34 Portal Demo',
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

app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
