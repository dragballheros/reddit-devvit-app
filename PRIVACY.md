# Privacy Policy

## Community Navigation

Community Navigation is a Reddit Devvit app that lets subreddit moderators configure navigation buttons and related media.

## Media safety screening

When a moderator uploads an image/GIF through the app, the image data is sent to OpenAI's moderation API for automated safety screening before the asset can be accepted.

When a moderator provides a Catbox URL for button media, the URL is screened by OpenAI's moderation API before the URL can be saved as an active asset.

The app does not intentionally store uploaded image bytes in Redis. Configuration data stored by the app may include asset URLs, button settings, and subreddit configuration.

## Catbox media

Catbox-hosted button media remains hosted by Catbox. The app may fetch the approved Catbox image through its server-side proxy when the navigation post displays it.

## Data minimization

The app uses only the information necessary to provide its moderator configuration and navigation functionality. It does not intentionally collect passwords, payment information, or unrelated personal information.

## Third-party services

The app uses:
- Reddit/Devvit for app hosting, subreddit configuration, and runtime storage.
- OpenAI for automated image safety screening.
- Catbox only when a moderator explicitly supplies a Catbox media URL.

Use of those services is subject to their respective terms and privacy policies.

## Changes

This policy may be updated when the app's data practices change or when required by Reddit or applicable law.

## Contact

Questions or privacy requests should be directed to the app developer through the Reddit community or app support channel associated with Community Navigation.
