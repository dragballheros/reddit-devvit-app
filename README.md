# Devvit Navigation Experience

A futuristic portal-style navigation experience for a subreddit. The app keeps the original welcome/menu flow while presenting community destinations as animated widescreen portals.

## What the app does

The custom post opens with the recovered welcome animation, then transitions into a portal menu.

Current portal order:

1. **AnimeH34 Discord**
2. **Modmail**
3. **x.com/ElfariaNSFW**
4. **AlyaNSFW**
5. **HentaiGIFS**
6. **DragonBallNSFW**
7. **AnimeAI**
8. **Create Post**

Each portal is one clickable surface. Backgrounds and icons are separate assets so either can be replaced independently. A missing background or icon intentionally falls back to solid black instead of inventing or downloading a replacement asset.

The portal renderer includes a moving energy ring, animated scan/shimmer effects, icon glow/pulse, background motion, and hover/focus response. Android receives a lighter animation profile while keeping the same layout and visual structure.

## Create Example Post

The subreddit three-dot menu includes **Create Example Post** for moderators.

Use it to create a real custom post running the app's default entry point. This is also the intended way to create the example post that reviewers can open while testing the app.

The menu action:

- uses the current subreddit context
- creates an interactive custom post titled `AnimeH34 Portal Demo`
- opens the newly created post after creation
- reports a failure through a Reddit toast if the app account cannot submit the post

## Testing

1. Install the app in a development subreddit.
2. Open the subreddit three-dot menu.
3. Select **Create Example Post**.
4. Open the generated **AnimeH34 Portal Demo** post.
5. Confirm the welcome animation transitions into the portal menu.
6. Confirm all portals are the same widescreen size.
7. Confirm portals with supplied assets display their independent background and circular icon.
8. Confirm portals without an asset currently render black rather than a placeholder image.
9. Test each navigation destination.
10. Test the generated example post on both desktop and mobile Reddit clients.

## Development

> Node 24 or newer is required.

Install dependencies:

```bash
npm install
```

Type-check:

```bash
npm run type-check
```

Build:

```bash
npm run build
```

Playtest:

```bash
npm run dev
```

Upload:

```bash
npm run deploy
```

Publish for review:

```bash
npm run launch
```

## Project structure

- `src/client/`: React portal UI, animation, responsive renderer
- `src/server/`: Devvit Web server endpoints and menu actions
- `src/shared/`: portal configuration and subreddit helpers
- `public/portals/`: independently replaceable portal backgrounds and icons
- `public/`: recovered welcome animation assets

## Asset behavior

Portal configuration separates:

```text
Portal
├── background
├── icon
├── title
└── animation
```

The UI renders the title and icon independently of the background. This means replacing an icon does not require editing the banner, and replacing a banner does not require editing the icon.

## Commands

- `npm run dev`: starts a Devvit playtest build/watch flow
- `npm run build`: builds the client and server
- `npm run deploy`: builds and uploads a new app version
- `npm run launch`: deploys and submits the app for review
- `npm run login`: logs the Devvit CLI into Reddit
- `npm run type-check`: runs TypeScript checking
