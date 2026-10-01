# SchoolFriends

This package is fixed for direct GitHub Pages/static hosting.

## Why the blank screen happened

The previous `index.html` tried to load:

`/src/main.tsx`

but the uploaded project did not contain `src/main.tsx`, a Vite build setup, or a compiled JavaScript bundle. It also had `App.tsx` at the repository root, which a browser cannot execute directly.

The fixed `index.html` is self-contained and renders the SchoolFriends chat UI directly, so GitHub Pages can serve it without running Vite.

## Deploy

Upload/push the contents of this folder to the GitHub Pages source branch. No `npm install` or build command is required for this fixed version.

The CNAME file is preserved.
