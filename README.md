# Community Navigation for Reddit

Community Navigation is a reusable Reddit Devvit custom post that gives subreddit moderators a configurable navigation page. It is designed for communities that want a simple, branded way to direct members to other subreddits, Discord servers, Modmail, or other approved destinations.

The app is community-configured. It does not ship with community-specific links, artwork, icons, banners, or welcome media.

## What the app provides

- A moderator-only **Community Navigation Admin** panel.
- Configurable navigation buttons with labels, destination URLs, button types, icons, backgrounds, gradients, colors, and background positioning/scaling.
- Optional welcome GIFs, including multiple GIFs chosen randomly when the navigation post loads or refreshes.
- An Asset Library for reusable uploaded images/GIFs, including asset deletion and automatic removal of deleted-asset references.
- Placeholder buttons (**Subreddit 1** through **Subreddit 4**) when no navigation buttons have been configured, so a new installation never looks like an empty shell.
- A moderator action for creating a new Community Navigation post for testing or review.
- A moderator action for creating or recreating the Community Navigation Admin panel.
- Managed subreddit support so one configuration can create or update navigation posts in multiple subreddits where the app is installed and the moderator has the required permissions.

Uploaded media uses Reddit/Devvit's media pipeline. The app does not depend on external media hosts.

## How moderators use the app

### 1. Create the admin panel

Install or playtest the app in a subreddit you moderate.

From the app's custom-post menu, choose **Create Navigation Admin Panel**. The app creates a fresh configuration post in the current subreddit. When the action is run again, the previous admin post is removed when possible and a fresh configuration post is created.

The admin panel is accessed from the app's own custom-post menu. Reddit profile pinning is not performed automatically. Moderators can use Reddit's normal post pin controls when they want the configuration post pinned.

### 2. Configure the welcome screen

In **Welcome Screen**:

- Add one or more welcome GIFs.
- Multiple GIFs are randomly selected when the post loads or refreshes.
- Remove all welcome GIFs to skip the intro and go directly to the navigation buttons.

### 3. Configure navigation buttons

Use **+ Add Button** to create a button.

Supported button types are:

- **Subreddit**
- **Discord**
- **Modmail**
- **Custom Link**

Each button can have a label, destination, accent color, gradient, optional icon, and optional background image. Background position and scale can also be adjusted.

### 4. Manage reusable assets

The **Asset Library** stores reusable Reddit-hosted images and GIFs.

Use **Upload Background** or **Upload Icon** from a button, or upload welcome media from the Welcome Screen. Existing assets can then be selected from the button's **Existing Background** and **Existing Icon** controls.

Use **Delete** in the Asset Library to remove an asset from the app configuration. Deleting an asset also clears button references to that asset. Changes are persisted with **Save & Apply**.

### 5. Apply the configuration

Click **Save & Apply**.

The app stores the configuration in the admin post and creates or updates managed navigation posts for the selected subreddits. Each target subreddit must have the app installed, and the moderator must have the necessary moderation permissions there.

### 6. Create a standalone test/review post

The moderator **Create Navigation Post** action creates a separate Community Navigation post for testing or review. This does not replace the administrator configuration post.

## Configuration behavior

The app is intentionally reusable across communities. A fresh installation has no community-specific destinations or media configured.

When there are no configured buttons, the app shows four disabled placeholders:

**Subreddit 1**, **Subreddit 2**, **Subreddit 3**, and **Subreddit 4**.

This makes the initial experience clear to moderators and reviewers while they configure the app.

## Review and testing

Before publishing, test the full moderator and member flows in a sandbox subreddit:

1. Create the admin panel.
2. Open the admin panel from the custom-post menu.
3. Add and remove welcome GIFs.
4. Add, edit, and remove navigation buttons.
5. Upload an image/GIF to the Asset Library.
6. Delete an asset and confirm its button references are cleared.
7. Save and apply the configuration.
8. Create a standalone test navigation post.
9. Refresh the navigation post and confirm saved configuration persists.
10. Test both mobile and web layouts.

## Development

Install dependencies and run the project checks:

```bash
npm install
npm run type-check
npm run build
```

For Devvit runtime testing:

```bash
npx devvit playtest
```

To create an installable app version:

```bash
npx devvit upload
```

To submit a version for Reddit review:

```bash
npx devvit publish
```

For public App Directory distribution, submit with:

```bash
npx devvit publish --public
```

The repository's source configuration is the authoritative implementation. Reviewers can use the moderator actions and the admin panel described above to exercise the app's complete feature set.
