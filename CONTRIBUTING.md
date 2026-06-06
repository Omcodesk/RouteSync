# Contributing to RouteSync

Thank you for your interest in contributing to RouteSync. As an open-source project designed to demonstrate enterprise-grade real-time systems, we maintain high standards for code quality, architecture, and modularity.

---

## 🏗️ Architectural Overview for Developers

Before diving into the code, please familiarize yourself with the project's structural boundaries:

- **Frontend (`A-Frontend/js/`)**: The client is built using Vanilla ES Modules to maintain a zero-build pipeline. Logic is strictly separated by domain (`passenger.js`, `driver.js`, `admin.js`, `maps.js`). Do **not** write monolithic files or inject inline scripts.
- **Backend API (`backend/createApp.js`)**: All Express middleware, JWT validation, and endpoint routing is encapsulated here.
- **Persistence Layer (`backend/lib/store.js`)**: **CRITICAL:** Do not write directly to the JSON files from your route handlers. All database transactions must pass through `store.js` so they can be transparently routed to either the local file system or the Upstash Redis cluster depending on the environment context.

---

## 🚀 Local Development Workflow

### 1. Repository Setup
Fork the repository on GitHub, then clone your fork locally:
```bash
git clone https://github.com/YOUR_USERNAME/RouteSync.git
cd RouteSync
npm install
```

### 2. Environment Configuration
Copy the `.env.example` file to create your local environment file:
```bash
cp .env.example backend/.env
```
By default, the application runs entirely on local JSON files.

*(Optional)* If you wish to test the Vercel Production parity locally with Redis:
1. Provision a free Upstash Redis database.
2. Add `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your `backend/.env` file.

### 3. Running the Server
```bash
npm start
```
The application will be served at `http://localhost:3000`.

---

## 💻 Making Contributions

1. **Branching Strategy:** Create a well-named feature branch from `main`:
   ```bash
   git checkout -b feature/your-descriptive-feature-name
   ```
2. **Commit Hygiene:** Make small, focused commits with clear, descriptive messages.
3. **Local Testing:** You must test your changes across all three persona flows before opening a Pull Request:
   - Ensure Passenger maps load and poll correctly.
   - Ensure the Driver dashboard successfully broadcasts GPS telemetry.
   - Ensure the Admin dashboard can accurately save/edit/delete a route.

---

## 🐛 Bug Reports & Feature Requests

When opening an issue, please provide robust context to help us triage efficiently:
- A descriptive title and clear explanation of the bug/feature.
- Exact steps to reproduce the issue.
- Expected behavior vs. actual behavior observed.
- Environment details (Browser, OS, Node.js version).
- Code snippets or screenshots where applicable.

---

## ✅ Pull Request Checklist

Before marking your PR as "Ready for Review", ensure you have verified the following:
- [ ] The application boots successfully locally via `npm start`.
- [ ] All three roles (Passenger, Driver, Admin) have been manually tested.
- [ ] No secrets or `.env` files are accidentally included in your commits.
- [ ] You have strictly utilized `store.js` for any new data persistence requirements.
- [ ] The `README.md` has been updated if your PR modifies the deployment process or setup instructions.
