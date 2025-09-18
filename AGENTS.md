# Repository Guidelines

## Project Structure & Module Organization
- `entrypoints/`: Extension entry points (`background.ts`, `popup/`, `injected.ts`, `output/`).
- `handlers/`: Site-specific logic and router (`index.ts`) with tests in `handlers/__tests__/`.
- `components/`: Vue 3 SFC UI pieces used by the popup/output.
- `utils/` and `types/`: Shared helpers and TypeScript types (e.g., `utils/messageHandling.ts`, `types/Slide.ts`, `types/messages.ts`).
- `assets/` and `public/`: Static styles/icons. `manifest.json` is at the root. Build config in `wxt.config.ts`.
  - Theme colors live in `assets/tailwind.css` (CSS variables like `--color-brand`, `--color-accent`).

## Build, Test, and Development Commands
- `pnpm dev`: Start WXT in watch mode. Load the unpacked extension from `.output/chromium-mv3/` in Chrome.
- `pnpm dev:firefox`: Same for Firefox (`.output/firefox-mv3/`).
- `pnpm build`: Production build to `.output/*`.
- `pnpm zip`: Create a distributable archive.
- `pnpm compile`: Type-check the project with `vue-tsc`.
- `pnpm test`: Run unit tests with Vitest.

## Coding Style & Naming Conventions
- Language: TypeScript + Vue 3. Use 2-space indentation and semicolons.
- Filenames: Components `PascalCase.vue` (e.g., `components/Popup.vue`); utilities/types `camelCase.ts` (e.g., `utils/sendKeyEvent.ts`).
- Modules: Keep site logic in `handlers/` and expose a `getHandlerFor(url)` function as seen in `handlers/*`.
- Imports: Prefer relative paths within the repo; group types/imports logically.

## Testing Guidelines
- Framework: Vitest. Place tests under `__tests__` and name files `*.test.ts` (e.g., `handlers/__tests__/docsend.test.ts`).
- Scope: Unit-test handler behavior, URL matching, and messaging helpers/routers. Add tests when modifying or adding handlers or events.
- Run: `pnpm test`. Ensure type-checks pass (`pnpm compile`).

## Messaging & Listeners
- Use the typed message bus in `utils/messageHandling.ts` and `types/messages.ts`.
  - `types/messages.ts` defines `MessageMap`, mapping each `event` to request/response types.
  - Use `sendToBg(event, data?, { timeoutMs? })` and `sendToTab(tabId, event, data?, { timeoutMs? })` for typed messaging.
  - Use `onMessage({ ...handlers })` to register a declarative router that returns an envelope via `sendResponse`.
  - `ensureContentReady(tabId, { retries?, delayMs?, inject? })` centralizes the ping+inject retry loop for content scripts.
- Prefer the declarative router style in `entrypoints/background.ts` and `entrypoints/injected.ts` instead of long if/else chains.
- Broadcasts: keep one-way notifications as plain `runtime.sendMessage` without expecting a response (e.g., `slides:updated`, `output:opened`, `auto:progress`).
- Listener lifecycle: always remove listeners on teardown/unmount.
  - In Vue components (e.g., sidepanel), keep references and call corresponding `removeListener` in `onUnmounted`.
  - Avoid leaving polling intervals/timers running after flows complete.

### Adding a New Event
1. Add it to `types/messages.ts` under `MessageMap` with `req`/`res` types.
2. Implement the handler in the appropriate router using `onMessage` (background or injected).
3. Call it from UI/content with `sendToBg`/`sendToTab`.
4. Add unit tests in `utils/__tests__/` for the helper or router behavior.

### Error Handling
- The helpers return typed results and unwrap the `{ result, error }` envelope; errors throw by default.
- Optional `timeoutMs` can be used to prevent indefinite waits when a receiver is missing.
- Verbose messaging logs are gated by a local DEBUG flag in `utils/messageHandling.ts`.

## Capture Workflow (Manual vs Auto)
- Manual Capture (works on any site):
  - Open the side panel from the extension icon. Shortcut: `Alt+Shift+S` opens panel and starts selection.
  - Click `Select Area`, then drag on the page to mark the slide region (Esc cancels). The selection is saved per-origin.
  - Click `Capture` for each slide view. On page, you can also press `Shift+K` to capture quickly using the saved selection.
  - Reorder/delete as needed, then click `Print/Save` to open the output tab and print or save as PDF.
- Auto Capture (only on supported sites):
  - When supported, an `Auto Capture` button appears in the side panel.
  - Click `Auto Capture` to let the content script drive the site’s controls and capture all slides automatically.
  - Progress is shown (e.g., `Auto capturing… 3/20`). When done, the output tab opens automatically.
  - Supported sites and their logic live under `handlers/`; add support by implementing a handler and counts provider.

## Commit & Pull Request Guidelines
- Commits: Use clear, imperative messages. Conventional prefixes encouraged: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`.
- PRs: Include a concise description, linked issues, and before/after screenshots or a short screen capture of the extension behavior when UI/flow changes.
- Validation: Include reproduction steps and note any permission/manifest changes.

## Security & Configuration Tips
- Permissions are minimal (`activeTab`, `scripting`). Avoid adding new permissions or host matches without discussion.
- Never include secrets. Do not inject remote scripts; keep resources bundled.
