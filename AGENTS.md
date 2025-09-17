# Repository Guidelines

## Project Structure & Module Organization
- `entrypoints/`: Extension entry points (`background.ts`, `popup/`, `injected.ts`, `output/`).
- `handlers/`: Site-specific logic and router (`index.ts`) with tests in `handlers/__tests__/`.
- `components/`: Vue 3 SFC UI pieces used by the popup/output.
- `utils/` and `types/`: Shared helpers and TypeScript types (e.g., `utils/messageHandling.ts`, `types/Slide.ts`).
- `assets/` and `public/`: Static styles/icons. `manifest.json` is at the root. Build config in `wxt.config.ts`.

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
- Scope: Unit-test handler behavior and URL matching. Add tests when modifying or adding handlers.
- Run: `pnpm test`. Ensure type-checks pass (`pnpm compile`).

## Commit & Pull Request Guidelines
- Commits: Use clear, imperative messages. Conventional prefixes encouraged: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`.
- PRs: Include a concise description, linked issues, and before/after screenshots or a short screen capture of the extension behavior when UI/flow changes.
- Validation: Include reproduction steps and note any permission/manifest changes.

## Security & Configuration Tips
- Permissions are minimal (`activeTab`, `scripting`). Avoid adding new permissions or host matches without discussion.
- Never include secrets. Do not inject remote scripts; keep resources bundled.
