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
| `components/` | `Sidebar`, `MessageList`, `Reader`, `ProductSpot`, `ProductFeature`, `ProductMark`, each with its CSS |
| `constants/` | `products.ts` (the Buun Group products and their words), `ui.ts` (theme key, labels) |
| `hooks/` | `useMailbox`, `useTheme`, `useRotation` |
| `lib/time.ts` | Received times for the list and the reader |
| `icons.ts` | Every glyph |
| `styles/` | `tokens.css` (the only colours), `base.css`, `app.css` |
| `__tests__/` | Products in step with marks and capabilities, times, the app in a browser |
