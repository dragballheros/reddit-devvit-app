# Community Navigation for Reddit

Community Navigation is a reusable Reddit Devvit custom post intended to help members find and navigate between subreddits. Each participating community's moderators control the subreddit destinations and presentation configured for their community. The app does not decide which communities should be recommended, and ordinary members do not control a community's configuration.

**This app is for Safe for Work (SFW) use only. NSFW content and destinations are not allowed.** The app and its configuration must comply with the current Devvit Rules and all other applicable Reddit policies.

## What the app provides

- A moderator-only **Community Navigation Admin** panel.
- A configurable navigation page for subreddit destinations.
- Customizable button labels and appearance, including colors, gradients, icons, and backgrounds.
- Optional welcome GIFs and a reusable asset library for uploaded images.
- Placeholder buttons (**Subreddit 1** through **Subreddit 4**) when no destinations have been configured.
- Moderator actions for creating a navigation post and creating or recreating the configuration panel.
- Managed subreddit support, allowing moderators to create or update navigation posts in other subreddits where the app is installed and they have the required permissions.

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

From the app's custom-post menu, choose **Create Navigation Admin Panel**. The app creates a configuration post in the current subreddit. Running the action again attempts to remove the previous admin post and creates a fresh one.

The admin panel is accessed from the app's own custom-post menu. Reddit profile pinning is not performed automatically. Moderators can use Reddit's normal post pin controls if they want the configuration post pinned.

### 2. Configure the welcome screen

In **Welcome Screen**:

- Add one or more SFW welcome GIFs or images.
- Multiple GIFs may be selected randomly when the post loads or refreshes.
- Remove all welcome media to skip the intro and go directly to the navigation buttons.

All uploaded media must be SFW and comply with Reddit's policies.

### 3. Configure subreddit navigation

Use **+ Add Button** to configure a destination. The intended destination is a subreddit that is appropriate for a general SFW audience.

Give each button a clear, accurate label. Do not use misleading labels or configure NSFW destinations. Do not use legacy Discord, Modmail, or arbitrary external-link destination options if they appear in the interface.

### 4. Manage reusable assets

The **Asset Library** stores reusable images and GIFs uploaded through Reddit/Devvit.

Use the upload controls to add SFW welcome media, button backgrounds, or icons. Existing assets can be selected again from the relevant controls.

Use **Delete** in the Asset Library to remove an asset from the app configuration. Deleting an asset also clears button references to it. Changes are persisted with **Save & Apply**.

### 5. Apply the configuration

Click **Save & Apply**.

The app stores the configuration in the admin post and creates or updates managed navigation posts for the selected subreddits. Each target subreddit must have the app installed, and the moderator must have the necessary moderation permissions there. Configure only SFW subreddit destinations.

### 6. Create a standalone test post

The moderator **Create Navigation Post** action creates a Community Navigation post for testing or review using the saved administrator configuration. The configuration post remains separate.

## Configuration behavior

The app is intended to be reusable across SFW communities. A fresh installation has no community-specific destinations or media configured.

When there are no configured buttons, the app shows four disabled placeholders:

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
4. Add, edit, and remove navigation buttons.
5. Upload and delete an asset, confirming references are cleared.
6. Save and apply the configuration.
7. Create a standalone test navigation post.
8. Refresh the navigation post and confirm the saved configuration persists.
9. Test mobile and web layouts.
10. Confirm all displayed destinations and media comply with the current Devvit Rules and Reddit policies.
