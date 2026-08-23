# Spotify Clone

A Spotify-style music platform built with Node.js, Express, and vanilla JavaScript.

## Owner admin panel

Open `/admin.html` to sign in and manage songs and site settings. The password is never stored in the repository or sent back to the browser. Configure these deployment secrets before using the admin panel (see `.env.example`):

- `ADMIN_PASSWORD` — a long, unique owner password.
- `ADMIN_SESSION_SECRET` — a random secret of at least 32 characters used to sign HTTP-only admin session cookies.
- `NODE_ENV=production` — ensures admin cookies are HTTPS-only in production.

Run locally with `npm install`, set the variables in your shell or a local `.env` file that is excluded from Git, then run `npm start` and visit `http://localhost:3000/admin.html`.

### Deployment and persistence

The existing Vercel configuration runs with a temporary `/tmp` filesystem. That means uploaded files and JSON changes (songs, playlists, settings) can disappear when a serverless instance is replaced; it is not durable production persistence. For persistent production data, deploy this Express app to a host with a persistent mounted volume and preserve the `data/` and `uploads/` directories, or migrate those files to managed object storage and a database before deploying to Vercel.
