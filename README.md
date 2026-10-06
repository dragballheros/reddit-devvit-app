# hentaiapp recovery

Recovered from the deployed `hentaiapp` v0.1.2 WebView.

## Exact recovery

The uploaded source map contains the original `sourcesContent` for:

- `src/client/MenuApp.tsx`
- `src/shared/subreddit.ts`

The MHTML capture supplies:

- the production `MenuApp.css`
- the captured `intro-hentai-desktop.gif`

The compiled `MenuApp.js` and its source map are also preserved under `public/`.

## Caveat

The recovered source references additional mobile/alternate GIF paths. The supplied MHTML captured only the desktop intro asset, so those remaining media assets are not claimed as recovered yet.

`devvit.json`, `vite.config.ts`, `tsconfig.json`, and `src/client/splash.tsx` are a current Devvit Web wrapper around the recovered application source. They are not claimed to be the original lost wrapper files.

## Commands

```bash
npm install
npm run type-check
npm run build
npx devvit playtest
```

Do not publish until the rebuilt project has been compared against the existing `hentaiapp` v0.1.2 deployment.
