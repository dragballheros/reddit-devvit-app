# HentaiApp

HentaiApp is a subreddit navigation experience built with Reddit's Developer Platform (Devvit). It gives a community one branded custom post that presents a welcome animation and then a clear, mobile-friendly navigation menu for community destinations.

The app is intentionally focused on navigation and community routing. It does not host, mirror, scrape, download, or redistribute the content of the linked communities. The destinations are configured by the app developer and are presented as explicit user-initiated links.

## Purpose and reviewer notes

This app is a navigation utility for an existing subreddit community.

The core experience is:

1. A short welcome animation is shown when the custom post opens.
2. The animation transitions into the navigation menu.
3. Users choose a destination explicitly by pressing a destination button.
4. Subreddit destinations open the selected subreddit.
5. Community resource links such as the configured Discord and X/Twitter destination open only when the user explicitly selects them.
6. The subreddit moderator menu provides a moderator-only action for creating a new HentaiApp custom post for testing and review.

The app does **not**:

- automatically post, comment, vote, subscribe, follow, or message users
- scrape or redistribute content from destination communities
- provide a mirror of another website or app
- collect or store personal user information
- use HTTP Fetch or third-party APIs
- require users to create an account outside Reddit
- make automated background changes to subreddit content

The app also does not claim to be operated by, sponsored by, or affiliated with Reddit, Discord, X/Twitter, or any destination community.

## Mature-community scope

The configured destinations may include communities intended for mature audiences. Those destinations remain separate communities with their own moderation, labeling, and access controls.

HentaiApp's function is to provide navigation to configured community destinations. It is not a general-purpose content feed and does not remove or bypass Reddit's labeling, safety, blocking, or age-related controls.

Community moderators should only install and configure the app in communities where the configured destinations are appropriate for that community and compliant with applicable Reddit rules and policies.

## Current navigation experience

The menu currently includes:

- **AnimeH34**
- **AlyaNSFW**
- **HentaiGIFS**
- **DragonBallNSFW**
- **AnimeAI**
- **X/Twitter (ElfariaNSFW)**
- **AnimeH34 Discord**
- **Modmail**

The navigation buttons are intentionally visual:

- Image-backed communities use their configured banner artwork without stretching the source image.
- Gradient-only destinations use unique animated dark gradient treatments.
- Navigation labels use community-specific font, size, weight, and color treatments.
- Image-backed destination buttons are taller than gradient-only destinations so their artwork has enough visual area.
- The welcome animation is separate from the menu background; after the transition, the menu uses an animated ambient gradient instead of continuing the GIF.

## Moderator menu action

The subreddit three-dot menu contains:

**Create HentaiApp Post**

This action is restricted to subreddit moderators by the Devvit configuration.

When selected, the server:

1. Reads the current subreddit context.
2. Creates a HentaiApp custom post using the app's `default` entrypoint.
3. Shows a success toast after the post is created.
4. Shows an error toast if the post cannot be created.

The action does not attempt to navigate to the created post automatically. This avoids passing Reddit's relative permalink directly to the Devvit UI navigation bridge.

## Asset and configuration model

Destination assets are configured in:

`src/shared/subreddit.ts`

Each destination can define:

```text
Destination
├── background
├── backgroundGradient
├── icon
├── accent
├── labelFont
├── labelSize
├── labelColor
└── labelWeight
```

Backgrounds and icons are independent, so changing one does not require changing the other.

The welcome animation assets are stored under `public/`.

## Development requirements

Node.js **24 or newer** is required.

Install dependencies:

```bash
npm install
```

Run TypeScript checks:

```bash
npm run type-check
```

Build the application:

```bash
npm run build
```

Run a Devvit playtest:

```bash
npm run dev
```

Upload a new app version:

```bash
npm run deploy
```

Publish the current version for Reddit review:

```bash
npm run launch
```

Log in to the Devvit CLI:

```bash
npm run login
```

## Testing checklist

Before submitting an update for review:

1. Run `npm run type-check`.
2. Run `npm run build`.
3. Run `npm run dev` and open the Playtest URL.
4. Verify the welcome animation loads on desktop and mobile-sized layouts.
5. Verify the transition from the welcome animation to the navigation menu.
6. Verify image-backed destinations preserve their artwork proportions.
7. Verify gradient-only destinations do not show placeholder image backgrounds.
8. Verify each destination opens only after an explicit user click.
9. Verify the moderator-only **Create HentaiApp Post** menu action.
10. Verify the generated custom post opens the normal `default` entrypoint.
11. Test the experience in both desktop and mobile Reddit clients when possible.

## Project structure

- `src/client/` - React custom-post UI, responsive layout, animation, and destination rendering
- `src/server/` - Devvit Web server endpoints and the moderator menu endpoint
- `src/shared/` - destination configuration, navigation destinations, and subreddit helpers
- `public/portals/` - destination icons and image-backed destination artwork
- `public/` - welcome animation assets
- `devvit.json` - Devvit custom-post and subreddit menu configuration

## Configuration

The current Devvit configuration defines:

- a single `default` custom-post entrypoint
- a server entrypoint for menu/API handling
- the moderator-only **Create HentaiApp Post** subreddit menu action
- Reddit permission required for the app's Reddit API operations

For the authoritative implementation, see `devvit.json`, `src/client/MenuApp.tsx`, `src/client/index.css`, `src/server/index.ts`, and `src/shared/subreddit.ts`.

## App review readiness

This README is intended to give reviewers and moderators a plain-language explanation of the app's purpose, operation, navigation behavior, and data practices.

The app should be reviewed together with the current source and its configured destinations. Configuration changes that materially change the app's functionality or policy posture should be reflected here before a new review submission.

Reddit's current Devvit rules require apps to provide a clear, non-vague README describing what the app does, who it is for, and how the full feature set works. See the official Devvit rules and review guidance for current requirements.
