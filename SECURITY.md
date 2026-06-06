# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main`  | Yes |

## Reporting a Vulnerability

Email **omchaddha7@gmail.com** — do **not** open public GitHub issues for security reports.

---

## What Is Protected

| Endpoint | Auth required | Who can access |
|----------|---------------|----------------|
| `GET /api/routes` | No | Everyone (passenger demo) |
| `GET /api/buses` | No | Everyone |
| `GET /api/buses/:id/reviews` | No | Everyone |
| `POST /api/auth/login` | No | Everyone |
| `POST /api/auth/register` | No* | Only if `ALLOW_PUBLIC_REGISTER=true` |
| `POST /api/routes` | **Yes** | Admin JWT only |
| `PUT /api/routes/:id` | **Yes** | Admin JWT only |
| `DELETE /api/routes/:id` | **Yes** | Admin JWT only |
| `POST /api/driver/update` | **Yes** | Driver or Admin JWT |
| `POST /api/buses/:id/reviews` | No | Everyone (rate-limited by validation) |
| `GET /api/demo/tick` | **Yes** (production) | `CRON_SECRET` header only |

\* Registration always creates **driver** accounts only — admin role cannot be self-assigned.

---

## Secrets — Never Commit

| Secret | Where to set |
|--------|--------------|
| `JWT_SECRET` | Vercel env vars / local `.env` |
| `UPSTASH_REDIS_*` | Vercel Marketplace |
| `CRON_SECRET` | Vercel env vars |
| Personal passwords | Never in repo |

**Safe in repo:** bcrypt password **hashes** in `backend/users.json` (demo accounts only), `.env.example` placeholders.

**Gitignored:** `.env`, `backend/.env`, all `node_modules/`

---

## Production Checklist (Vercel)

- [ ] `JWT_SECRET` — long random string (not `change_me`)
- [ ] `ALLOW_PUBLIC_REGISTER=false`
- [ ] `CRON_SECRET` set if using demo bus tick
- [ ] Upstash Redis connected
- [ ] Demo passwords (`demo1234`) are intentional for portfolio — change for real production

---

## Demo vs Production

This project is configured as a **portfolio demo**. Demo credentials are shown on the home page by design. For a real transit deployment you would:

- Disable public registration
- Rotate demo passwords
- Add rate limiting
- Use HTTPS only (Vercel provides this)
- Restrict CORS via `ALLOWED_ORIGINS`
