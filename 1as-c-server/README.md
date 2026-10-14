# 1AS-C Shared Class Website

A real server-backed replacement for the original Claude Artifact page. Posts and uploaded images are stored on the server, so all students opening the same deployed URL see the same content. Students can read without logging in. Only the delegate password configured on the server can publish or delete posts.

## Important

This folder is a deployable application, not a website already hosted on the public internet. You must run it on your computer or deploy it to a server. **Use persistent storage** for `DB_PATH` and `UPLOAD_DIR`; otherwise a host restart/redeploy may erase posts and uploaded images.

## Run on your computer

Requirements: Node.js 20+ and npm.

1. Copy `.env.example` to `.env`.
2. Edit `.env` and set `SESSION_SECRET` to a long random value (32+ characters) and `DELEGATE_PASSWORD` to a unique password of at least 12 characters. Do not share the `.env` file or commit it to Git.
3. In this folder, run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

Local posts are stored in `data/classroom.sqlite`; images are stored in `uploads/`.

## Deploy with Docker (persistent local/server volume)

Install Docker and Docker Compose, then run:

```sh
docker compose up --build -d
```

The Compose file reads secrets from `.env` and mounts persistent `./data` and `./uploads` folders. Open `http://localhost:3000` on that computer. For classmates outside your local network, deploy to a public host with HTTPS; do not expose a home computer directly to the internet unless you understand the security implications.

## Deploy to a public server

Use a Node.js host or VPS that supports a **persistent disk/volume** and HTTPS. On Render, create a Web Service from this folder/repository, build command `npm install`, start command `npm start`, and attach a persistent disk mounted at `/var/data`. Set these environment variables in the hosting dashboard:

- `NODE_ENV=production`
- `SESSION_SECRET` = a long random secret (32+ characters)
- `DELEGATE_PASSWORD` = a unique strong password (12+ characters)
- `DB_PATH=/var/data/classroom.sqlite`
- `UPLOAD_DIR=/var/data/uploads`

Set the service's port from the host's `PORT` environment variable (the app reads it automatically). Make sure the persistent disk is actually attached and mounted at `/var/data` before using the site. Some hosting plans do not include persistent disks; ephemeral storage is **not** suitable because files/database can disappear during restarts or deploys.

After deployment, send classmates the single public HTTPS URL. Everyone must use that same URL to see the same posts.

## Delegate access

The delegate password is checked on the server, never embedded in frontend HTML. Keep it private. Anyone who has the delegate password can publish and delete posts, so share it only with the delegate. The server limits login attempts and uses secure, HTTP-only session cookies in production.

## Backups

Back up both the SQLite database file (`classroom.sqlite`) and the uploads directory on the persistent volume. Persistent storage protects against ordinary app restarts but is not a substitute for backups.
