# Desktop UI source

The React UI: three panes (workspaces, messages, reader) and the Buun Group product spots.

## Standards

Code here follows:
- [React](../../../../.standards/docs/standards/packs/react/index.md) - function components, hooks for state
- [UI design system](../../../../.standards/docs/standards/packs/ui-design-system/index.md) - tokens only, one icon registry
- [Accessibility](../../../../.standards/docs/standards/core/accessibility.md) - real buttons, labels, focus rings, reduced motion
- [Copy style](../../../../.standards/docs/standards/core/copy-style.md) - plain words, no em dash

## Contents

| Path | Purpose |
|---|---|
| `main.tsx`, `App.tsx` | Entry and the three-pane layout |
| `api/` | `client.ts` (the only Tauri caller), `types.ts` (mirrors `dto.rs`), `preview.ts` (browser-only mailbox) |
| `components/` | `TitleBar` (the bar along the top: mark, sidebar toggle, bell, theme, settings, window buttons), `Sidebar` (collapsible rail, right-click menus), `MessageList`, `Reader`, `Settings` (General, Notifications, Workspaces with icon picker, Rules, Integrations, Agents), `ContextMenu`, `WorkspaceIcon`, `Tags`, `NotificationBell`, `Toasts`, `Tooltip`, `BrandMark`, `MoreFromBuun`, `BuunFooter`, `ProductMark`, each with its CSS |
| `constants/` | `products.ts`, `integrations.ts`, `agents.ts` (agent clients and what to paste), `ui.ts` (preferences, labels, settings sections) |
| `hooks/` | `useMailbox`, `usePreferences` (theme, density, grain, sidebar), `useWorkspaceLooks` (icons and images), `useFolded`, `usePeek`, `useShortcut`, `useNotifications` |
| `lib/` | `time.ts`, `clipboard.ts`, `place.ts` (floating boxes kept in the window), `rules.ts` (a rule in one sentence) |
| `icons.ts` | Every glyph |
| `styles/` | `tokens.css` (the only colours), `fonts.css` (Geist, Latin only), `base.css`, `app.css` |
| `__tests__/` | Products in step with marks and capabilities, times, the app, settings and sidebar in a browser |
