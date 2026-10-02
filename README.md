# SchoolFriends — Firebase Login Fix

This build uses the SchoolFriends Firebase project and a more robust Google authentication flow.

## Google login flow

1. Firebase local persistence is explicitly enabled.
2. Google popup sign-in is attempted first.
3. If the browser blocks/does not support the popup, the app falls back to Firebase redirect sign-in.
4. `getRedirectResult()` is processed on startup.
5. `onAuthStateChanged()` is the single source of truth for opening the main app.
6. A Cloudflare Worker `/api/auth/sync` failure can no longer force the user back to the login screen.

## Firebase settings required

Firebase Console → Authentication:

- Google provider: Enabled
- Authorized domain: `friends.pntr.dev`
- If testing another hostname, add that hostname too.

## Cloudflare Worker

The frontend calls:

`https://schoolfriends-api.mukhopadhyaysudip3.workers.dev`

The Worker must expose:

- `POST /api/auth/sync`
- `GET /api/messages`
- `POST /api/messages`
- `POST /api/admin/console`

The authentication UI does not depend on `/api/auth/sync` succeeding.

## GitHub Pages

Upload the contents of this folder to the repository root (not the ZIP file). Keep `index.html` and `app.js` at the same level.

A cache-busting query is included on `app.js` so browsers are less likely to keep an older JavaScript file after deployment.
