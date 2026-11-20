# @buun-mail/brand

The Buun Mail brand kit: the Arrival mark, the outlined wordmark and lockups, favicons and app icons for every platform,
the social card and email logos, and the motion system with its React components. Everything is built from one
geometry (`src/geometry.ts`), so a change to the mark reaches every file.

## The mark

Arrival: a letter tilted in flight with two streaks behind it, a sibling of the Flung mark. Drawn on a 32 unit grid.
The letter carries an amber to burnt orange gradient (`#ffc35c`, `#f18707`, `#b45309`) with an ink flap
(`#16141c`); the streaks take the text colour, so the mark works on dark and light. Smallest size: 16 px.

| Tone | Use |
|---|---|
| `on-dark` | Orange letter, light streaks. Dark grounds, the app icon |
| `on-light` | Orange letter, ink streaks. Light grounds |
| `mono` | One colour (`currentColor`), the flap cut out. Embossing, single-colour print |
| `white`, `black` | Mono in a fixed colour |

## Motion

Import `@buun-mail/brand/motion.css` once. Every motion moves the mark's own parts. Under reduced motion everything
rests and the loader only fades.

| Class or component | Use |
|---|---|
| `<Mark motion="arrive">` | The letter flies in and settles: splash, first launch |
| `<Mark motion="loader">`, `<Loader>` | Hovering letter, pulsing streaks: loading, syncing |
| `<Mark motion="send">` | The letter leaves to the right: a reply sent |
| `<Mark motion="ping">` | A hop and a wiggle: new mail |
| `<Mark motion="draw">` | Outline traces, then fills: a first view |
| `<Splash done>` | The launch screen; fades when `done` |
| `<RouteFlow routes>` | Letters running from addresses to workspaces: onboarding, the site |

## Commands

| Command | Does |
|---|---|
| `pnpm brand:build` | Outlines the wordmark from Geist SemiBold, writes `src/svg/` and rasterises `assets/` with resvg |
| `pnpm --filter @buun-mail/brand readme` | Draws the README's animated hero and routing pictures into `.github/assets/readme/`, every word outlined from Geist Medium |
| `pnpm --filter @buun-mail/brand installer` | Draws the Windows installers' header, sidebar, banner and dialog images (24-bit BMP) into `apps/desktop/src-tauri/icons/installer/` |
| `pnpm dev:brand` | The preview on http://localhost:28610: every file, size and motion on dark and light |
| `pnpm exec tauri icon packages/brand/assets/app-icon-1024.png -o src-tauri/icons` (in `apps/desktop`) | The desktop icon set for macOS, Windows and Linux |

## Standards

Code here follows:
- [Constants](../../../.standards/docs/standards/core/constants.md) - every size and colour named once, in `geometry.ts` and `tokens.ts`
- [UI design system](../../../.standards/docs/standards/packs/ui-design-system/index.md) - colours mirror the app tokens; a test holds them equal
- [Accessibility](../../../.standards/docs/standards/core/accessibility.md) - unnamed marks are hidden, motion rests under reduced motion

## Contents

| Path | Purpose |
|---|---|
| `src/geometry.ts` | The mark, the favicon and the app tiles, as SVG strings |
| `src/tokens.ts` | Brand colours for files that cannot read CSS |
| `src/lockup.ts` | Horizontal and stacked lockups |
| `src/og.ts` | The 1200 by 630 social card |
| `src/generated/wordmark.ts` | "Buun Mail" outlined; written by the build |
| `src/css/motion.css` | Every animation |
| `src/react/` | `Mark`, `Logo`, `Loader`, `Splash`, `RouteFlow` |
| `src/svg/` | Built SVG files: marks, lockups, favicon, app icon, social card |
| `assets/` | Built PNGs, `favicon.ico`, `site.webmanifest` |
| `scripts/` | `build.ts`, the ICO writer, and `readme.ts` with the Simple Icons paths its chips use (`readme-icons.json`) |
| `preview/` | The local preview page |
