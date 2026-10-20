# Community Navigation for Reddit

Community Navigation is a Reddit Devvit custom post that helps members move between Safe for Work subreddits. Each community’s **top moderator** owns that community’s admin dashboard and decides which other current moderators, if any, may edit it. Ordinary members and moderators without an explicit grant cannot change the dashboard. Moderating a different subreddit does not grant access.

**This app is for Safe for Work (SFW) use only. NSFW content and destinations are not allowed.** Installations and configurations must follow the current [Devvit Rules](https://developers.reddit.com/docs/devvit_rules) and all other applicable Reddit policies.

## What members see

The public post opens from an inline card so the feed can still scroll. **Open navigation** expands the post and shows:

- A welcome image or GIF, when one is configured. If several are saved, one is chosen at random on each load. With none saved, the post goes straight to the buttons.
- A fixed **Subreddit Menu** button. It always opens `https://www.reddit.com/r/{currentSubreddit}/about/` for the subreddit where that post is running. Moderators do not edit this URL.
- The configured subreddit buttons, with their labels, colors, gradients, icons, and backgrounds.
- Four disabled placeholders (**Subreddit 1** through **Subreddit 4**) when no destinations are configured yet. The Subreddit Menu button is still active.
- A petal background, or a custom Reddit-hosted image or GIF.

The inline card also offers **Subreddit Menu** directly, without opening the full list.

## What moderators can configure

The **Community Navigation Admin** panel is a separate custom post. It opens in the expanded editor so the form can scroll.

- Welcome images and GIFs, including how each one is fitted.
- Petal or custom backgrounds.
- Subreddit buttons: label, destination, accent, label color, font, size, weight, gradient, icon, background, and background position/scale. A button can be disabled without deleting it.
- An asset library of Reddit-hosted images and GIFs. Deleting an asset clears references to it.
- Several subreddits from one admin post. Each connected subreddit has its own buttons, welcome media, backgrounds, and label styles. This community keeps its own configuration too.

Destination checks run in the editor and again on the server. Only HTTPS URLs on `reddit.com`, `www.reddit.com`, or `old.reddit.com` with a direct `/r/SubredditName/` path are accepted. Posts, profiles, other websites, query strings, fragments, and custom ports are rejected. Saved links are rewritten to `https://www.reddit.com/r/{name}/`.

Discord, Modmail, and other external button types are not supported. Older saved buttons of those types are dropped and are not shown.

Uploaded media must be PNG, JPEG, WEBP, or GIF, at most 20 MB, and must come back on a Reddit media host. The server rejects other image URLs.

## Access control

Reddit does not expose a separate subreddit-owner role. This app treats the **first moderator in Reddit’s live moderator list** as the top moderator. If Reddit cannot confirm that list, or cannot confirm the current user’s permissions, the app denies the action.

| Action | Who can do it |
| --- | --- |
| Create or replace the admin panel | Top moderator of the current subreddit |
| Grant or revoke dashboard access | Top moderator, from the canonical admin panel |
| Edit and publish this community’s configuration | Top moderator, or a current moderator with an explicit grant |
| Create a navigation post in this subreddit | Any current moderator |
| Connect, edit, paste, or publish another subreddit | Someone who can open this panel and is the live top moderator of that subreddit, with the app installed there |

Grants are stored for this installation only and are tied to the top moderator who issued them.

- A delegated moderator can edit, copy, and paste this community’s configuration. They cannot grant access, revoke access, or replace the panel.
- A delegated moderator can connect, view, edit, or paste another subreddit only when they are that subreddit’s live top moderator. Otherwise that configuration stays hidden. The check fails closed when Reddit cannot confirm the live moderator list.
- The top moderator of this community can view every connected configuration, which lets them copy it. They can connect, paste, or publish a subreddit only when they are also that subreddit’s live top moderator.
- Every admin request checks the delegate’s current moderator permissions. Removal from the moderator team denies access immediately, even before the stored grant is cleaned up.
- **Scan Mod Team** reloads the live roster and deletes grants for accounts that are no longer moderators. The top moderator is shown as the owner and cannot be stored as a delegate.
- If the top moderator changes, previous grants stop working. The new top moderator must grant access again.
- **Create Navigation Admin Panel** removes the previous panel, creates a blank one, and clears delegated access. It does not copy the previous buttons, media, or grants. Before the old panel is removed, connected navigation posts are given their own copy when the acting user is the live top moderator of that subreddit. Use it to replace a panel, not to refresh one.
- **Disconnect** removes a subreddit from this panel and keeps its navigation post. If that post still follows this community, disconnect is refused unless the acting user is the live top moderator there, so the post is not left on a shared link. Connecting the same name again reuses the remembered post.

Devvit cannot list the subreddits a user moderates or where this app is installed. The **Connected Subreddits** section therefore asks for a typed name. The server accepts it only when both checks pass: this app is installed in that subreddit, and the acting user is first in its live moderator list.

Each subreddit installation has its own Redis data, canonical admin post, and grant list. An admin panel in one community cannot edit another community’s panel.

## Install and playtest

Requirements:

- Node.js 24 or newer
- A Reddit account that can moderate the playtest subreddit
- This repository’s dependencies, including the Devvit CLI

```bash
npm install
npm run login
npm run dev
```

`npm run login` runs `devvit login`. `npm run dev` runs `devvit playtest`.

`devvit.json` sets the default playtest subreddit to `communitypro_dev`. Override it for one session with `DEVVIT_SUBREDDIT`, or change `dev.subreddit`. The account that playtests must moderate that community. The top moderator creates the admin panel from the post menu.

Playtest, upload, and publish need an interactive Reddit login. They are not run by the repository’s automated checks.

Other commands:

```bash
npm run test:community-isolation
npm run type-check
npm run build
npm run deploy   # build, then devvit upload
npm run launch   # deploy, then devvit publish
```

GitHub Actions runs the isolation tests, TypeScript check, and production build on pushes and pull requests to `main`.

## Moderator setup

1. Install or playtest the app in a subreddit where you are the top moderator.
2. Open one of the app’s posts and choose **Create Navigation Admin Panel**.
3. Choose **Open admin editor**.
4. In **Moderator Access**, choose **Scan Mod Team**, then **Grant Access** beside a current moderator. **Revoke Access** removes that grant.
5. Add SFW welcome media if you want an intro.
6. Add subreddit buttons with direct Reddit subreddit URLs.
7. Under **Connected Subreddits**, use **Editing** to choose `r/{this community} (this community)` or another connected subreddit. Each one has its own configuration.
8. To connect another subreddit, type its name (for example in **Subreddit name, e.g. YourSubreddit**) and choose **Connect Subreddit**. You must be the live top moderator there, and the app must already be installed there. The new navigation post starts from this community’s saved configuration, so save unsaved work first.
9. Choose **Copy Config** on the community you want to copy. Select the other community under **Editing**, choose **Paste Config**, then **Replace Config**. Cancel leaves the target unchanged. Pasted configurations are checked again on the server.
10. Choose **Save & Apply to r/{name}** to publish only the community selected under **Editing**.
11. Use **Create Navigation Post** when you want another navigation post in the current subreddit for review. That local post keeps following this community’s configuration.

A navigation post created before this per-subreddit storage keeps showing the configuration it shows today. The first time someone who can open this panel, and who is that subreddit’s live top moderator, loads the dashboard, that configuration is stored on the navigation post itself. Later edits to this community do not change it. If that person cannot be confirmed, the post stays linked to this community. Saving this community can still change a post that has not been given its own copy.

Confirm an ungranted moderator is denied, a removed moderator loses access immediately, a new top moderator must grant access again, and external or non-subreddit URLs are rejected. Check the expanded post on web and mobile, and confirm every destination and image complies with Reddit’s current rules.

## Compliance

Moderators choose the destinations and media for their community. That choice does not exempt the configuration from Reddit’s policies.

- Link only to relevant SFW subreddits.
- Do not configure NSFW communities, sexually explicit or otherwise mature media, or misleading labels.
- Do not use the app to promote Discord, other external apps, or off-platform services.
- Do not use the app to evade subreddit restrictions, age gates, or other Reddit safety systems.

Read the current Devvit Rules before installing or configuring the app. Reddit may update its policies and may reject, restrict, or remove apps or content that do not comply.
