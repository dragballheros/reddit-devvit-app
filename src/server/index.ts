import { Hono } from 'hono';
import { createServer, context, getServerPort, reddit } from '@devvit/web/server';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';

const app = new Hono();

app.post('/internal/menu/create-post', async (c) => {
  try {
    await c.req.json<MenuItemRequest>().catch(() => ({}));

    const subredditName = context.subredditName;
    if (!subredditName) {
      return c.json<UiResponse>({
        showToast: 'No subreddit context was available.',
      });
    }

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

const server = createServer(app);
server.on('error', (error) => console.error(`server error; ${error}`));
server.listen(getServerPort());
