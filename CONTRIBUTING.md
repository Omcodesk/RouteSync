# Contributing to RouteSync

Thank you for your interest in contributing to RouteSync. This document outlines how to get started.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/RouteSync.git
   cd RouteSync
   ```
3. **Install** dependencies and run the app:
   ```bash
   npm install
   npm start
   ```
4. Open **http://localhost:3000** and verify everything works.

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes with clear, focused commits.
3. Test locally — passenger map, driver trip flow, and admin route CRUD.
4. Push to your fork and open a **Pull Request** against `main`.

## Code Guidelines

- Match existing code style and naming conventions.
- Keep frontend logic in `A-Frontend/js/` modules — avoid growing monolithic files.
- Shared API logic belongs in `backend/createApp.js`.
- Use `backend/lib/store.js` for persistence — do not write directly to JSON in route handlers.
- Prefer small, reviewable PRs over large refactors.

## Reporting Issues

When opening an issue, please include:

- A clear title and description
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Browser and OS (for frontend issues)
- Screenshots if applicable

## Pull Request Checklist

- [ ] App runs locally with `npm start`
- [ ] Passenger, driver, and admin flows tested
- [ ] No secrets or `.env` files committed
- [ ] README updated if behavior or setup changed

## Questions?

Open a [GitHub Issue](https://github.com/Omcodesk/RouteSync/issues) for questions or suggestions.
