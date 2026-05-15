# Assistenzprotokoll

Assistenzprotokoll is a Vite + React application for managing assistance customers, daily logs, PDF templates, statistics, backups, and offline browser data.

## Progressive Web App support

This project is configured as a Progressive Web App (PWA):

- installable from supported browsers
- offline-capable after the first successful load
- standalone app experience on desktop and mobile
- browser-cached static assets via a service worker

## Development

```powershell
npm install
npm run dev
```

To test the PWA behavior locally, open the app in a Chromium-based browser and use the browser's install prompt or application tools.

## Production build

```powershell
npm run build
npm run preview
```

The production bundle is written to `dist/`.

## Deployment

Deploy the contents of `dist/` to any static host (IIS, Nginx, Apache, local static server, or CDN-backed static hosting).

## Data storage

Application data is stored in the browser using IndexedDB/Dexie, so user data stays on the device/browser profile unless exported with the built-in backup feature.

