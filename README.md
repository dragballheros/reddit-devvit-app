# Community Navigation for Reddit

Community Navigation is a reusable Reddit Devvit custom post intended to help members find and navigate between subreddits. Each participating community's top moderator controls that community's navigation dashboard and presentation. Ordinary members and other moderators cannot change the dashboard, and being a moderator in another subreddit does not grant access.

**This app is for Safe for Work (SFW) use only. NSFW content and destinations are not allowed.** The app and its configuration must comply with the current Devvit Rules and all other applicable Reddit policies.

## What the app provides

- A **Community Navigation Admin** panel restricted to the current subreddit’s top moderator.
- A configurable navigation page for subreddit destinations.
- A built-in **Subreddit Menu** button that automatically opens the installed subreddit’s `/about/` page.
- Customizable button labels and appearance, including colors, gradients, icons, and backgrounds.
- Optional welcome GIFs and a reusable asset library for uploaded images.
- Placeholder buttons (**Subreddit 1** through **Subreddit 4**) when no destinations have been configured.
- Moderator actions for creating a navigation post and creating or recreating the configuration panel.
- Managed subreddit support, allowing the source subreddit’s top moderator to create or update navigation posts only in target subreddits where they also have moderator permissions and the app is installed.

The app is community-configured. A fresh installation has no community-specific destinations or media. Uploaded media uses Reddit/Devvit's media pipeline.

## Intended use and community control

Community Navigation is a general-purpose subreddit navigation utility, not an endorsement of any particular community or an advertising tool for external platforms.

- Subreddit moderators are responsible for choosing and maintaining the destinations and media configured for their community.
- Only use the app to direct members to relevant **SFW subreddits**.
- Do not configure NSFW subreddits or destinations, sexually explicit or otherwise mature content, or media that violates Reddit's rules.
- Do not use the app to promote Discord servers, other external apps, or off-platform services. If legacy destination controls are present in the current interface, do not use them; the intended use is subreddit-to-subreddit navigation only.
- The app must not be used to evade Reddit's rules, subreddit restrictions, age-gating requirements, or other safety mechanisms.

A moderator's ability to configure a community does not exempt that configuration or the app from Reddit's policies. All moderators and users must use the app in accordance with the Devvit Rules and all applicable Reddit Terms & Policies.

Read the current [Devvit Rules](https://developers.reddit.com/docs/devvit_rules) before installing, configuring, or using the app. Reddit may update its policies and may reject, restrict, or remove apps or content that do not comply.

## How moderators use the app

### 1. Create the admin panel

Install or playtest the app in a subreddit you moderate.

From the app's custom-post menu, the subreddit’s **top moderator** chooses **Create Navigation Admin Panel**. The app creates a configuration post in the current subreddit. Running the action again attempts to remove the previous admin post and creates a fresh one. The app defines its dashboard owner as the first moderator returned by Reddit’s live moderator list; if that check fails, access is denied.

The admin panel is accessed from the app's own custom-post menu. Only that subreddit’s top moderator can create, read, or change the dashboard. The server checks the live moderator list and verifies that the opened post is the canonical admin post for that installation on every admin endpoint. Stale admin panels and managed public posts cannot be used as alternate admin entry points. Reddit profile pinning is not performed automatically.

Each subreddit installation has its own Redis-backed configuration and canonical admin panel. A panel in one subreddit does not grant administrative access to another community's panel. If the top moderator selects a managed subreddit, the app creates or updates only its own navigation post there, after checking that the requesting top moderator is also a moderator in that target community and that the app is installed there. The target navigation post follows the source panel's saved public configuration; moderators of the target community do not gain edit access to the source admin panel. A target post cannot be used to change the source panel or another target.

### 2. Configure the welcome screen

In **Welcome Screen**:

- Add one or more SFW welcome GIFs or images.
- Multiple GIFs may be selected randomly when the post loads or refreshes.
- Remove all welcome media to skip the intro and go directly to the navigation buttons.

All uploaded media must be SFW and comply with Reddit's policies.

### 3. Configure subreddit navigation

Use **+ Add Subreddit Button** to configure a destination. Each configurable button must point directly to a subreddit landing page on Reddit, such as `https://www.reddit.com/r/ExampleSubreddit/`.

**Destination validation is enforced in both the admin interface and the server.** Only HTTPS URLs on `reddit.com`, `www.reddit.com`, or `old.reddit.com` with a direct `/r/SubredditName/` path are accepted. Links to other websites, Reddit posts, user profiles, and URLs with query parameters or fragments are rejected. Saved links are normalized to a canonical Reddit subreddit URL. Do not configure NSFW destinations or use misleading labels.

Discord, Modmail, and arbitrary external-link button types are not supported. Legacy saved buttons of those types are ignored and are not displayed.

### Built-in Subreddit Menu button

Every public navigation post includes a fixed **Subreddit Menu** button. Its destination is generated automatically from the subreddit where that post is running:

`https://www.reddit.com/r/{currentSubreddit}/about/`

For example, a post running in `r/ExampleCommunity` opens `https://www.reddit.com/r/ExampleCommunity/about/`. The subreddit name is obtained from Devvit's current subreddit context; moderators do not enter or edit this URL, and it is not stored as a configurable button.

The destination opens the community's About/community-information page. Reddit may expose community bookmarks and other resources there, but this URL does not guarantee that the Community Bookmarks section will be selected automatically.

### 4. Manage reusable assets

The **Asset Library** stores reusable images and GIFs uploaded through Reddit/Devvit.

Use the upload controls to add SFW welcome media, button backgrounds, or icons. Existing assets can be selected again from the relevant controls.

Use **Delete** in the Asset Library to remove an asset from the app configuration. Deleting an asset also clears button references to it. Changes are persisted with **Save & Apply**.

### 5. Apply the configuration

Click **Save & Apply**.

The app stores the configuration in the admin post and creates or updates managed navigation posts for the selected subreddits. Each target subreddit must have the app installed, and the dashboard’s top moderator must also be a moderator there. Configure only SFW subreddit destinations.

### 6. Create a standalone test post

The moderator **Create Navigation Post** action creates a Community Navigation post for testing or review using the saved administrator configuration. The configuration post remains separate.

## Configuration behavior

The app is intended to be reusable across SFW communities. A fresh installation has no community-specific destinations or media configured.

When there are no configured subreddit destinations, the app still shows the fixed **Subreddit Menu** button, followed by four disabled placeholders:

- **Subreddit 1**
- **Subreddit 2**
- **Subreddit 3**
- **Subreddit 4**

These placeholders help moderators recognize where to configure subreddit destinations.

## Compliance requirements

By installing, configuring, or using Community Navigation, moderators and users are expected to follow the current Devvit Rules and all applicable Reddit Terms & Policies.

**NSFW use is not permitted.** Do not add, display, link to, or promote NSFW subreddits, adult or sexually explicit content, mature media, or destinations intended for NSFW content. Do not use the app to facilitate policy violations or to bypass Reddit's safety systems.

Moderators are responsible for the destinations and media they configure. The app's general-purpose design does not guarantee that a particular configuration complies with Reddit policy, and this README does not replace the official rules. Check the official Devvit Rules regularly because they may change.

## Basic testing checklist

Before using the app in a community:

1. Create the admin panel in a subreddit you moderate.
2. Configure only SFW subreddit destinations.
3. Add and remove SFW welcome media.
4. Add, edit, and remove subreddit buttons using valid direct Reddit subreddit URLs.
5. Confirm an external URL, Reddit post URL, or profile URL is rejected by validation.
6. Confirm the fixed Subreddit Menu button opens the current subreddit’s `/about/` page and cannot be customized.
7. Upload and delete an asset, confirming references are cleared.
8. Save and apply the configuration.
9. Create a standalone test navigation post.
10. Refresh the navigation post and confirm the saved configuration persists.
11. Test mobile and web layouts.
12. Confirm all displayed destinations and media comply with the current Devvit Rules and Reddit policies.
