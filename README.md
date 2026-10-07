# Community Navigation for Reddit

A reusable Reddit Devvit custom post that gives moderators a configurable community navigation page.

## What it provides

- A moderator-only admin panel for configuring the community navigation.
- Custom buttons with labels, destinations, icons, backgrounds, gradients, colors, and layout controls.
- Optional welcome GIFs, including multiple GIFs selected randomly on each post load or refresh.
- If no welcome GIF is configured, the navigation opens directly to the button section.
- A moderator menu action for creating a community navigation post for review or testing.
- A second moderator menu action for creating the configuration/admin post.
- A managed subreddit list that lets moderators apply the same configuration to multiple communities where the app is installed.
- A minimal default configuration with no community-specific links or bundled artwork.

## Configuration model

The repository intentionally contains no community-specific destination links, icons, banners, or welcome media.

Each community supplies its own configuration through the admin panel. This keeps the project reusable instead of tying the code to a particular subreddit, brand, Discord server, social account, or artwork collection.

### Welcome media

Welcome GIFs are optional.

- Add one GIF to show a single welcome animation.
- Add multiple GIFs to randomly select one whenever the post loads or refreshes.
- Remove all GIFs to skip the welcome screen and show the configured buttons immediately.

### Navigation buttons

Moderators can create and customize buttons for:

- Subreddits
- Discord servers
- Modmail
- Custom external links

Buttons can optionally use uploaded Reddit-hosted media or CSS gradients. A button without an image uses its configured gradient.

## Review and testing

The moderator **Create Navigation Post** action creates an independent custom post so the community navigation can be reviewed or tested without changing the administrator configuration.

The admin panel can also create and update managed navigation posts in selected subreddits. Moderation permissions and app installation are required in each target subreddit.


## Moderator admin panel

The **Create Navigation Admin Panel** action is available from the app's own custom-post menu, not the subreddit menu. It creates the configuration post. Open that post and use Reddit's native **Pin Post To Profile** action to place it on the app account's profile.

## Development

Install dependencies and run the type check and build:

```bash
npm install
npm run type-check
npm run build
```

For Devvit runtime testing:

```bash
npm run dev
```

The project is intended to be configured per community rather than shipped with a preconfigured set of destinations or media.
