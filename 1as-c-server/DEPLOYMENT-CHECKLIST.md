# Deployment checklist

- [ ] Copy `.env.example` to `.env` and set a unique delegate password and random session secret.
- [ ] Keep `.env` private; do not upload it or commit it to a public repository.
- [ ] Deploy this folder to a Node.js host or run with Docker.
- [ ] For public hosting, attach persistent storage and set `DB_PATH` and `UPLOAD_DIR` to paths on that storage.
- [ ] Enable HTTPS at the hosting provider.
- [ ] Open `/api/health` on the deployed URL; it should return `{"ok":true}`.
- [ ] Publish a test post as delegate, then open the site in a private/incognito window and confirm it appears.
- [ ] Refresh the private window and confirm the post remains.
- [ ] Confirm a student session has no publish/delete controls and API requests without delegate login are rejected.
- [ ] Delete the test post as delegate and confirm it disappears for everyone.
- [ ] Back up the database and uploads directory regularly.
