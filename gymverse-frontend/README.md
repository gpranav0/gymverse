# GymVerse Frontend

The React single-page app for GymVerse, a gym management system. It talks to the
Express API in `../gymverse-backend`.

## Tech Stack
- **React 19** with **React Router 7**
- **Vite** for dev server and builds
- **Tailwind CSS 4** for styling
- **Axios** for API calls
- **CSS-drawn charts** for the revenue chart (no charting library)
- **lucide-react** for icons
- **Oxlint** for linting

## Running Locally

Start the backend first (see `../gymverse-backend/README.md`), then:

```bash
npm install
```

Copy `.env.example` to `.env` and point it at your API:

```
VITE_API_URL=http://localhost:5000/api
```

```bash
npm run dev
```

The app runs on `http://localhost:5173`. The backend's `CORS_ORIGIN` must include that
origin or every request will be blocked by the browser.

Sign in with a seeded account — `admin@gymverse.com` / `Password@123`.

## Scripts

| Script            | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Vite dev server with HMR.                |
| `npm run build`   | Production build into `dist/`.           |
| `npm run preview` | Serve the production build locally.      |
| `npm run lint`    | Run Oxlint.                              |
| `npm test`        | Run the Vitest suite.                    |

## Structure

```
src/
  components/
    forms/      Modal form bodies (member, trainer, plan, assignment, ...)
    ui/         Modal, StatCard, Pagination
  context/      AuthContext — token storage and the current user
  layouts/      DashboardLayout — sidebar shell for authenticated pages
  pages/        One folder per feature area
  routes/       ProtectedRoute (authentication) and RoleRoute (authorization)
  services/     Axios instance plus one module per API resource
```

## Notes

- **Routing.** Everything except the sign-in page — the dashboard shell, the chat
  assistant and every feature page — is loaded with `React.lazy`, so the initial bundle
  stays small.
- **Auth.** The JWT lives in `localStorage`. A 401 on any request other than login or
  register clears it and redirects to `/login`; a 401 *from* login is left alone so the
  page can display the reason.
- **Errors.** `getErrorMessage` in `services/api.js` pulls the useful message out of an
  axios error. Prefer it over reaching into `err.response.data` by hand.
- **Roles.** `RoleRoute` gates whole route subtrees; individual pages additionally hide
  actions the current role cannot perform. The backend enforces both independently —
  never rely on the UI alone.
- **Tailwind 4.** The `*-opacity-*` utilities were removed in v4. Use slash syntax
  (`bg-black/50`), not `bg-black bg-opacity-50`, which silently produces no output.
