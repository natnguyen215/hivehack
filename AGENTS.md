# Repository Guidelines

## Project Structure & Module Organization
The repo has two apps plus orchestration. `frontend/` hosts the Next.js Mapbox UI (`src/app` for routes, `src/components` for UI, `src/lib` for API helpers, `src/types` for contracts, and `public/` for static assets). `backend/` is a FastAPI service with all logic inside `app/` (`main.py` endpoints, `models.py` Pydantic schemas, `mock.py` fixture data). Docker builds live in each subfolder, while `docker-compose.yml` wires `frontend`, `backend`, `postgres`, and `redis` onto `ember-net`.

## Build, Test, and Development Commands
Frontend (run inside `frontend/`):
- `npm install` — install Next.js, Tailwind, Mapbox, Vitest deps.
- `npm run dev` — Next.js dev server with MapView dynamically imported (`ssr: false`).
- `npm run build` — type-check + compile for production.
- `npm run lint` and `npm run test` — ESLint/`next lint` and Vitest suites.

Backend (run inside `backend/`):
- `python -m venv .venv && .venv/Scripts/activate`
- `pip install -r requirements.txt`
- `uvicorn app.main:app --reload` — serves the mock API.

Top-level: `docker-compose up --build` starts all four services.

## Coding Style & Naming Conventions
Use TypeScript + React with 2-space indentation and single quotes. Components use `PascalCase`, hooks use `useCamelCase`, helpers use `kebab-case`. Keep Tailwind classes inline, use the shared `cn()` helper, and gate `mapbox-gl` usage with `'use client'` + dynamic imports. Python follows Black-style conventions (lower_snake_case functions, single module per concern). Avoid `print`/`console.log` in committed code.

## Testing Guidelines
Vitest + Testing Library cover frontend units; place `.test.tsx` files beside their components (`components/__tests__/Sidebar.test.tsx`). Stub Mapbox in tests to avoid DOM errors. Backend routes are backed by static fixtures; if you add logic, add pytest coverage under `backend/tests/` and hit `/health` plus `/api/*` endpoints in integration smoke tests. Aim for >80% statements.

## Commit & Pull Request Guidelines
Commits follow conventional prefixes (`feat:`, `fix:`, `chore:`). Keep changes scoped to one area (e.g., `feat: backend overlays endpoint`). PRs should include summary, testing steps (`npm run lint && npm run test`, `uvicorn app.main:app --reload`), screenshots/GIFs for UI, and notes on env or data changes. Reference tickets/Trello cards when available.

## Configuration & Environment Tips
Copy `.env.example` files in both apps (`frontend/.env.local`, `backend/.env`) and provide Mapbox tokens, API URLs, and service URIs. Never commit real secrets. Map overlays load only after the Mapbox `load` event and must guard `map.getSource(id)` before add/remove. When running in Docker, remember `frontend` mounts host source plus an anonymous `node_modules` volume so local installs don’t conflict.
