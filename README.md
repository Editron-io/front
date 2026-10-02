# AudioVerse Studio — Vercel Frontend

This is the browser-only AudioVerse Studio frontend.

## Backend connection
Edit `config.js` and set:

`window.AUDIOVERSE_API_BASE = 'https://YOUR-BACKEND-PROJECT.vercel.app/api';`

The frontend calls only the backend bridge. It does not call Microsoft Edge TTS directly.

## Deploy
Import this folder as a separate Vercel project. No build command is required; `index.html` is served as a static site.
