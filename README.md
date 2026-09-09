# XPLAW account board

## Run locally

The default site works standalone: open `index.html` directly in a browser. Accounts, reports, and listing drafts are stored in that browser's local storage.

For shared moderation, Discord report delivery, and server-side authentication, use Node.js 18 or newer:

1. Copy `.env.example` to `.env` and fill in the values. Never commit `.env`.
2. Set `ADMIN_USERNAME` to the private admin username.
3. Run `node make-admin-hash.js`, enter the private password locally, and put the two printed hash values in `.env`.
4. Set `DISCORD_WEBHOOK_URL` to a newly rotated Discord webhook.
5. Start the server with `node server.js`.
6. Open `http://localhost:3000`.

When opened at `http://localhost:3000`, listings and accounts use the server's shared `data.json` store, so different browsers can see the same listings. The direct `file://` version remains local-only.

The Discord webhook belongs in `DISCORD_WEBHOOK_URL` only. Rotate the webhook that was previously shared publicly before using it.

## Security notes

- Admin credentials are checked server-side with a scrypt hash and timing-safe comparison.
- Sessions are kept server-side and the browser receives only a random session token.
- Reports are sent from the server so the webhook is never exposed to visitors. Standalone reports remain local to the device.
- Listing submissions require an authenticated session and should be reviewed before publication.
- Add HTTPS, rate limiting, persistent session storage, CSRF protection, and platform-compliant moderation rules before public deployment.
