# RouteSync Security Policy

## Supported Versions

| Version | Supported | Status |
|---------|-----------|--------|
| `main`  | ✅ Yes    | Active Development |

## Reporting a Vulnerability

As this is a portfolio repository, please email **omchaddha7@gmail.com** directly for any sensitive security disclosures. 

> [!WARNING]
> Do **not** open public GitHub issues for security reports or zero-day vulnerabilities.

---

## Authorization & Protected Endpoints

RouteSync implements strict Role-Based Access Control (RBAC) via stateless JSON Web Tokens (JWT). The API surface area is protected across three distinct tiers:

| API Endpoint | Authentication Tier | Access Level |
|----------|---------------|----------------|
| `GET /api/routes` | Unauthenticated | Public (Read-Only) |
| `GET /api/buses` | Unauthenticated | Public (Read-Only) |
| `GET /api/buses/:id/reviews` | Unauthenticated | Public (Read-Only) |
| `POST /api/auth/login` | Unauthenticated | Public (Authentication) |
| `POST /api/auth/register` | Feature Flagged* | Disabled by default |
| `POST /api/routes` | **JWT Required** | Admin Only |
| `PUT /api/routes/:id` | **JWT Required** | Admin Only |
| `DELETE /api/routes/:id` | **JWT Required** | Admin Only |
| `POST /api/driver/update` | **JWT Required** | Driver & Admin Only |
| `GET /api/demo/tick` | **Header Protected** | Vercel Cron Job Only (`CRON_SECRET`) |

\* *Registration logic guarantees that self-registered users are assigned the `driver` role. Privilege escalation to the `admin` role is mechanically restricted.*

---

## Secrets Management & Git Hygiene

No production secrets are committed to this repository. The architecture securely handles secrets using environment-specific variables.

| Secret Key | Injection Vector | Status |
|--------|--------------|--------|
| `JWT_SECRET` | Vercel Environment Variables | Excluded from Git |
| `KV_REST_API_*` | Vercel Upstash Integration | Managed by Vercel |
| `CRON_SECRET` | Vercel Environment Variables | Excluded from Git |

> [!NOTE]
> **Safe in Repository:** The `backend/users.json` file contains `bcrypt` password hashes for the demo accounts. No plaintext passwords are tracked in version control.

---

## The "Portfolio Sandbox" Environment

Because this repository serves as a live engineering portfolio, it is intentionally configured in a **Sandbox Mode**.

### 1. Public Demo Accounts
Credentials for `demo-admin` and `demo-driver` are publicly displayed on the frontend. This is an intentional engineering decision to eliminate friction for technical recruiters and hiring managers reviewing the live application.

### 2. Read-Only Route Protection
To prevent vandalism while maintaining an interactive demo, the `demo-admin` account operates under a strict **Read-Only Mode**. 
- The UI permits simulated route creation and editing.
- The Express API intercepts the payload and gracefully returns a `403 Forbidden` response for the `demo-admin` email address, preserving the integrity of the routing tables.

### 3. Enterprise Deployment Checklist
If this repository were to be forked and deployed for a real-world municipal transit authority, the following architectural hardening steps would be required:
- [ ] **Rate Limiting:** Implement `express-rate-limit` on the authentication and review ingestion endpoints to mitigate DDoS and brute-force attacks.
- [ ] **CORS Hardening:** Restrict `ALLOWED_ORIGINS` to the exact frontend domain.
- [ ] **Credential Rotation:** Terminate and purge the public demo accounts from the production database.
- [ ] **Disable Registration:** Ensure `ALLOW_PUBLIC_REGISTER=false` to restrict internal system access.
