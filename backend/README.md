# Transport Tracker — Full Stack Real-Time Bus Tracking

This repository is a demo/full-stack project for a real-time bus-tracking system with three roles:
**Passenger**, **Driver**, and **Admin**. The backend is Node.js + Express with Socket.IO. The frontend is plain HTML/CSS/JS using Leaflet for maps.

> This README assumes the backend lives in `backend/` and the frontend files (`index.html`, `styles.css`, `app.js`) are in `frontend/`. You can serve the frontend via a static server (python, live-server, etc).

---

## Quick status
- Backend: `server.js` (Express + Socket.IO) — listening on port `3000` by default.
- Frontend: static files in `frontend/` — open with `python -m http.server 5500` or similar.
- Emulator: `emulator.js` — simulates buses by reading `routes.json` and posting updates.

---

## Prerequisites

- Node.js (v16+ recommended)
- npm
- Python (for serving frontend, optional)
- Optional: `nodemon` for dev

---

## Backend — Setup & Run

1. Open a terminal in `backend/`:

```bash
cd backend
npm install
