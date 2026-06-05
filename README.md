# RouteSync — Real-Time Bus Tracking

Live demo stack: **Leaflet maps**, **Express API**, **JWT auth** (passenger / driver / admin), and **live bus updates** via polling (Vercel) or Socket.IO (local).

No XAMPP required.

---

## Live demo (Vercel)

After deploy, your resume link looks like:

```
https://your-project.vercel.app
```

---

## Demo credentials (for resume reviewers)

Shown on the home page. **Passenger** needs no login.

| Panel | Email | Password |
|-------|-------|----------|
| Driver | `demo-driver@routesync.app` | `demo1234` |
| Admin | `demo-admin@routesync.app` | `demo1234` |

Passwords are stored as bcrypt hashes in `backend/users.json` — you log in with the plain password each time; no re-hashing needed unless you change a password.

---

## Run locally (no XAMPP)

From the project root:

```powershell
npm install
npm start
```

Open **http://localhost:3000** — frontend and API on the same port.

Optional — simulate moving buses:

```powershell
cd emulator
$env:API_URL="http://localhost:3000/api/driver/update"
$env:ROUTES_FILE="..\backend\routes.json"
npm start
```

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project at [vercel.com](https://vercel.com).
3. Add **Upstash Redis** from the Vercel Marketplace (Storage tab) — this sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Set environment variables:

| Variable | Value |
|----------|-------|
| `JWT_SECRET` | A long random string |
| `ALLOW_PUBLIC_ROUTES` | `true` (recommended for demo) |
| `DEMO_AUTO_VERIFY` | `true` |
| `CRON_SECRET` | Optional — secures `/api/demo/tick` |

5. Deploy. Vercel Cron (in `vercel.json`) moves demo buses every minute.

---

## Project structure

```
RouteSync/
├── A-Frontend/       Static UI (HTML, CSS, JS)
├── backend/          Express app + local server
│   ├── createApp.js  Shared API routes
│   ├── server.js     Local dev (port 3000)
│   └── lib/store.js  JSON files locally, Redis on Vercel
├── api/index.js      Vercel serverless entry
├── emulator/         Optional bus simulator
└── vercel.json       Deploy config
```

---

## Resume bullet (example)

> **RouteSync** — Real-time bus tracking web app with Leaflet maps, serverless API (Vercel), Redis, and role-based JWT auth. [Live demo](https://your-project.vercel.app)
