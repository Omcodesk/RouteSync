# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in RouteSync, please report it responsibly.

**Do not** open a public GitHub issue for security-sensitive reports.

Instead, email **omchaddha7@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You can expect an initial response within **72 hours**.

## Security Notes

- Never commit `.env` files, API keys, or `JWT_SECRET` values to the repository.
- Use strong, unique `JWT_SECRET` values in production.
- Demo credentials (`demo1234`) are for portfolio demos only — change them in production deployments.
- On Vercel, use environment variables for all secrets; do not hardcode credentials in source files.

## Known Considerations

- `ALLOW_PUBLIC_ROUTES=true` exposes route data without authentication (intentional for demo).
- Bus driver updates (`POST /api/driver/update`) are open in the current demo configuration.
- Redis credentials should only be set via Vercel environment variables or local `.env` (gitignored).
