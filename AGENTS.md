# Repository Guidelines

## Project Structure & Module Organization
All runtime code lives under `frontend/`. Next.js routes stay in `frontend/src/app/` (`layout.tsx`, `page.tsx`, and `globals.css` for Tailwind reset). Shared UI is grouped in `frontend/src/components/` (`MapView.tsx`, `Sidebar.tsx`, `StatusBanner.tsx`). HTTP helpers and cross-cutting hooks sit in `frontend/src/lib/` (`api.ts`, `utils.ts`), while domain types belong to `frontend/src/types/`. Keep new assets in `frontend/public/` and mirror the existing folder names when adding features so Mapbox, forms, and banners remain predictable.

## Build, Test, and Development Commands
Run these from `frontend/`:
- `npm install` — installs Next.js, Tailwind, Mapbox, and testing deps.
- `npm run dev` — starts the Next.js dev server (MapView renders client-side with `ssr: false`).
- `npm run build` — type-checks and emits the production bundle.
- `npm run lint` — executes ESLint/`next lint` plus Tailwind class validation.
- `npm run test` — runs Vitest + Testing Library suites.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation and single quotes. Components follow `PascalCase` (`RouteCard.tsx`), hooks use `useCamelCase`, and helper files prefer `kebab-case`. Keep React components functional, store styling in Tailwind utility strings, and rely on the `cn` helper for conditional classes. Guard client-only modules (`mapbox-gl`) with `'use client'` headers and lazy imports inside `MapView`.

## Testing Guidelines
Vitest plus `@testing-library/react` handles unit and integration tests. Co-locate tests beside source files using `.test.tsx` (e.g., `components/__tests__/Sidebar.test.tsx`). Describe behaviors (“shows shelter ETA once route data arrives”) and stub Mapbox APIs to keep suites deterministic. Every feature PR should include at least one success and one failure-path test, and run `npm run test -- --coverage` to keep alert logic above 80% statement coverage.

## Commit & Pull Request Guidelines
Use conventional commit prefixes (`feat:`, `fix:`, `chore:`) and keep commits scoped to a single concern. PRs require: a short summary, screenshots or GIFs for UI changes, explicit run/test steps, and notes on any env vars, Mapbox styles, or fixtures touched. Link the relevant issue or Trello card. Request review only after `npm run lint`, `npm run test`, and `npm run build` pass locally.

## Configuration & Environment Tips
Copy `.env.example` to `.env.local` and fill in keys like `NEXT_PUBLIC_MAPBOX_TOKEN`. Never commit real secrets. Tailwind design tokens live in `tailwind.config.ts`; update them before editing component classes. Use `.dockerignore` + `Dockerfile` to verify deployment parity via `docker build -t emberpath-frontend .` followed by `docker run -p 3000:3000 emberpath-frontend`.
