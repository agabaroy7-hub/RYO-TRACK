# RYO TRACK

RYO TRACK is an Electron + React + TypeScript desktop app for video editors to track completed work, streaks, earnings, XP, achievements, and forecasts.

## Stack

- Electron
- React
- TypeScript
- Tailwind CSS
- Recharts
- Framer Motion
- SQLite via `sql.js`

## Folder Structure

- `electron/main.ts` Electron app lifecycle, window creation, IPC handlers
- `electron/preload.ts` secure bridge into the renderer
- `electron/services/worktrack-service.ts` SQLite persistence and domain logic
- `src/shared/*` shared types, level engine, forecasting, streak and achievement helpers
- `src/renderer/*` React UI, hooks, and styles

## Database Schema

- `app_state` singleton row with cash goal, daily target, XP, level, totals, streaks, and last activity date
- `work_log` append-only work events and recent wins
- `daily_stats` persisted analytics history by day
- `achievements` unlocked achievement state

## Component Architecture

- Dashboard shell and hero summary
- Quick log buttons
- Daily target module
- Streak tracker
- XP and level panel
- Achievements feed
- Forecasting card
- Analytics charts
- Recent wins feed
- Lifetime stats panel
- Motivation banner

## Development

1. Install dependencies: `npm install`
2. Start the renderer and Electron: `npm run dev`
3. Build the app bundle: `npm run build`