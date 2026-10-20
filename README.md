# Community Navigation for Reddit

Community Navigation is a Reddit Devvit custom post that helps members move between Safe for Work subreddits. A moderator with Reddit’s **Everything** permission owns that community’s admin dashboard and can explicitly grant edit access to other current moderators. Ordinary members, and moderators without Everything or an explicit grant, cannot change the dashboard. Moderating a different subreddit does not grant access.

**This app is for Safe for Work (SFW) use only. NSFW content and destinations are not allowed.** Installations and configurations must follow the current [Devvit Rules](https://developers.reddit.com/docs/devvit_rules) and all other applicable Reddit policies.

## What members see

The public post stays an inline card in the feed. In Devvit 0.14.7 the `inline` flag in `devvit.json` is ignored, and every post entrypoint starts inline. **Open navigation** is the only control that asks Reddit to expand it. The full menu is not rendered in the feed unless Reddit reports that the post is already expanded. **Open navigation** then shows:

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

Reddit’s moderator permission named `all` is the **Everything** permission. This app uses that permission everywhere it previously required the first moderator in the list. If Reddit cannot return the acting user’s permissions, the action is denied.

| Action | Who can do it |
| --- | --- |
| Create or replace the admin panel | A current moderator with Everything in this subreddit |
| Grant or revoke dashboard access | A moderator with Everything, from the canonical admin panel |
| Edit and publish this community’s configuration | A moderator with Everything, or a current moderator with an explicit grant |
| Create a navigation post in this subreddit | Any current moderator |
| Connect, edit, paste, or publish another subreddit | Someone who can open this panel and has Everything in that subreddit, with the app installed there |

More than one moderator can have Everything. They are peers. Grants are a shared list for this installation, not the property of one moderator. Any moderator with Everything can grant or revoke. A grant stays valid only while that account is still a moderator and does not have Everything. Accounts with Everything are not stored as delegates, because they already have access. If an Everything moderator loses that permission, they lose the dashboard unless another Everything moderator grants them access. Older grants that were stored under a single top-moderator name are still read as the same delegate list.

- A delegated moderator can edit, copy, and paste this community’s configuration. They cannot grant access, revoke access, or replace the panel.
- A delegated moderator can connect, view, edit, or paste another subreddit only when they have Everything there. Otherwise that configuration stays hidden. The check fails closed when Reddit cannot confirm permissions.
- A moderator with Everything in this community can view every connected configuration, which lets them copy it. They can connect, paste, or publish a subreddit only when they also have Everything there.
- Every admin request checks the delegate’s current moderator permissions. Removal from the moderator team denies access immediately, even before the stored grant is cleaned up.
- **Scan Mod Team** reloads the live roster. Moderators with Everything are labeled **Everything**. **Grant Access** and **Revoke Access** apply only to moderators without Everything. Grants for accounts that left the team are deleted.
- **Create Navigation Admin Panel** removes the previous panel, creates a blank one, and clears delegated access. It does not copy the previous buttons, media, or grants. Before the old panel is removed, connected navigation posts are given their own copy when the acting user has Everything in that subreddit. Use it to replace a panel, not to refresh one.
- **Disconnect** removes a subreddit from this panel and keeps its navigation post. If that post still follows this community, disconnect is refused unless the acting user has Everything there, so the post is not left on a shared link. Connecting the same name again reuses the remembered post.

Devvit cannot list the subreddits a user moderates or where this app is installed. The **Connected Subreddits** section therefore asks for a typed name. The server accepts it only when both checks pass: this app is installed in that subreddit, and the acting user has Everything there. A community the actor cannot change is labeled **r/{name} (Everything only)**.

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

`devvit.json` sets the default playtest subreddit to `communitypro_dev`. Override it for one session with `DEVVIT_SUBREDDIT`, or change `dev.subreddit`. The account that playtests must moderate that community. A moderator with Everything creates the admin panel from the post menu. The public entrypoint uses height `regular`, which only sizes the inline feed card. Expanded mode ignores that height.

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

1. Install or playtest the app in a subreddit where you have the Everything moderator permission.
2. Open one of the app’s posts and choose **Create Navigation Admin Panel**.
3. Choose **Open admin editor**.
4. In **Moderator Access**, choose **Scan Mod Team**, then **Grant Access** beside a current moderator. **Revoke Access** removes that grant.
5. Add SFW welcome media if you want an intro.
6. Add subreddit buttons with direct Reddit subreddit URLs.
7. Under **Connected Subreddits**, use **Editing** to choose `r/{this community} (this community)` or another connected subreddit. Each one has its own configuration.
8. To connect another subreddit, type its name (for example in **Subreddit name, e.g. YourSubreddit**) and choose **Connect Subreddit**. You must have Everything there, and the app must already be installed there. The new navigation post starts from this community’s saved configuration, so save unsaved work first.
9. Choose **Copy Config** on the community you want to copy. Select the other community under **Editing**, choose **Paste Config**, then **Replace Config**. Cancel leaves the target unchanged. Pasted configurations are checked again on the server.
10. Choose **Save & Apply to r/{name}** to publish only the community selected under **Editing**.
11. Use **Create Navigation Post** when you want another navigation post in the current subreddit for review. That local post keeps following this community’s configuration.

A navigation post created before this per-subreddit storage keeps showing the configuration it shows today. The first time someone who can open this panel, and who has Everything in that subreddit, loads the dashboard, that configuration is stored on the navigation post itself. Later edits to this community do not change it. If that permission cannot be confirmed, the post stays linked to this community. Saving this community can still change a post that has not been given its own copy.

Confirm an ungranted moderator is denied, a removed moderator loses access immediately, a moderator who loses Everything loses owner access, and external or non-subreddit URLs are rejected. In the feed, confirm the public post shows **Open navigation** and does not open the full menu until that button is used. Check the expanded post on web and mobile, and confirm every destination and image complies with Reddit’s current rules.

## Compliance

Moderators choose the destinations and media for their community. That choice does not exempt the configuration from Reddit’s policies.

- Link only to relevant SFW subreddits.
- Do not configure NSFW communities, sexually explicit or otherwise mature media, or misleading labels.
- Do not use the app to promote Discord, other external apps, or off-platform services.
- Do not use the app to evade subreddit restrictions, age gates, or other Reddit safety systems.

Read the current Devvit Rules before installing or configuring the app. Reddit may update its policies and may reject, restrict, or remove apps or content that do not comply.
