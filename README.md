# Constellation Web Interface

This directory hosts the SvelteKit mission-control demo UI. It simulates a Constellation backend so you can explore Mission Control, the satellites list/detail views, live logs, metrics, runs, playground, and environment monitor.

## Quick start

Prerequisites:

- Node.js 20+ with npm (or pnpm)
- Make the helper executable once: `chmod +x web.sh`

```bash
cd web
./web.sh  # runs npm ci, npm run build, then npm run dev -- --host 0.0.0.0 --port 5173
```

You can also run the commands manually (`npm install`, `npm run build`, `npm run dev -- --host 0.0.0.0 --port 5173`).

### [Video Demo](https://drive.google.com/file/d/1QG45nfBbJ9wXSHtsoOfRWYOWr1tfouJ8/view?usp=sharing)

## What is implemented

1. **Mission Control** – global FSM controls, onboarding tour, statistics rail, and satellite cards that show state + role badges.
2. **Satellites page** – toggleable table/card views, bulk FSM actions, adaptive filters, and an Add Satellite modal whose Host dropdown lists hosts pulled from the live data.
3. **Satellite detail** – FSM diagram, command panel, configuration editor, live metrics, and command log history.
4. **Logs / Metrics / Runs** – streaming logs (with protocol colors), CSV export, Grafana-style charts + run markers, BOR/EOR diff view in Run History.
5. **Condition playground** – XYFlow graph editor with live evaluation log entries.
6. **Environment monitor** – per-host CPU/RAM/temp tiles representing lab machines plus status pills.
7. **UX polish** – account-style project switcher overlay (color picker / inline new project form / delete confirmation backed by `addDemoProject`/`removeDemoProject`), collapsed sidebar uses the avatar + `PanelLeftOpen` icon to expand, and the Add Satellite host selector is a dropdown instead of a free-text input.

## Layout

```
web/
├── src/lib/demo.ts      # data generators (satellites, logs, runs, metrics)
├── src/lib/store.ts     # store + simulation + helper APIs (project helpers, addSatellite, sendCommand)
├── src/routes/+layout.svelte  # sidebar + project switcher + nav
├── src/routes/+page.svelte    # Mission Control dashboard
├── src/routes/satellites/     # list + detail + dialog
├── src/routes/logs/
├── src/routes/metrics/
├── src/routes/runs/
├── src/routes/playground/
└── src/routes/environment/
```

## Production build

```bash
cd web
npm run build
npm run preview  # serves output on http://localhost:4173
```

Swap `src/lib/demo.ts`/`src/lib/store.ts` for your own HTTP/WebSocket adapters to connect the UI to a live Constellation deployment.
