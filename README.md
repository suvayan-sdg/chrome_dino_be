# Dino Race — Chrome-Dino-style 4-player PvP racing game (server)

Node.js + Express + TypeScript + Socket.IO.
Authoritative simulation at 20 Hz; MongoDB Atlas for rooms/matches (TTL).

## Repo note (two-repo setup)

This repo is standalone. The obstacle-generation logic that must match the client
is duplicated here from the client repo under `src/shared/`. Keep those two files in
sync:

- `src/shared/constants.ts`
- `src/shared/obstacles.ts`

(The client repo has its own copy of the same two files.)

## Local setup

1. `cd server`
2. `npm install`
3. `cp .env.example .env` and fill `MONGO_URI` (required). Others optional.
4. `npm run dev` — server on http://localhost:4000.

## MongoDB Atlas connection string

This section tells you how to create the `MONGO_URI` value to paste into
`server/.env` under `MONGO_URI=...`.

1. Go to https://cloud.mongodb.com and open your Atlas organization/project.
2. Create or select a cluster. For a free test, a shared (M0) cluster is enough
   for this game.
3. Create a database user under **Database Access** (NOT the Atlas login). Pick
   a username and a strong password. Copy the password.
4. Choose the deployment connection method: **Drivers** (not "Connect with
   MongoDB Shell").
5. Select your driver (Node.js) and version, or just use the standard
   `mongodb+srv://` URI shown.
6. The URI looks like:

   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
   ```

   Replace:
   - `<username>` with the database user you created
   - `<password>` with that user's password (URL-encode special characters)
   - `<cluster>` with your cluster's hostname, e.g. `abc12345.mongodb.net`
   - `<dbname>` with the database name you want, e.g. `dinorace`

7. **IP allowlist:** In Atlas **Network Access**, add an IP allowlist entry that
   includes the caller. For local dev, add your current IP (or `0.0.0.0/0` only
   temporarily for testing). For Render, add the Render/Cloudflare egress ranges
   that Render documents, or use VPC peering / private endpoints if you want to
   avoid `0.0.0.0/0`.
8. Paste the final URI into `server/.env`:

   ```
   MONGO_URI=mongodb+srv://dino_user:strong-password-here@cluster0.mongodb.net/dinorace?retryWrites=true&w=majority
   ```

9. Optional: create the database/collection is not required up front — Mongoose
   will create `rooms` and `matches` as needed.

Security notes:
- Don't paste the URI into source control. `.env` is gitignored.
- Use a dedicated database user with only the access this app needs.
- Rotate the password if it may have been exposed.

## Local smoke check (server only, no client required)

From the `server` folder:

```bash
# With .env set (MONGO_URI required):
npm run dev
```

Then in another terminal:

```bash
# Healthcheck:
curl -fsS http://localhost:4000/health

# Root info:
curl -fsS http://localhost:4000/

# Create a room via REST (useful for a quick sanity check):
curl -fsS -X POST http://localhost:4000/rooms \
  -H 'Content-Type: application/json' \
  -d '{"name": "Tester"}'
```

If Mongo is unavailable, `/health` still returns `200` and reports the Mongo state.
The server logs the Mongo error but keeps running; active matches work in-memory
where possible.

## Deploy (Render)

1. Create a Render web service (Node) pointing at this repo.
2. Set the build command to `npm install && npm run build` and the start command to
   `npm start`, OR use a single command workflow if you prefer.
3. Set env vars per `.env.example` (especially `MONGO_URI`, `PORT`, `CLIENT_ORIGIN`).
   In production `CLIENT_ORIGIN` must include your GitHub Pages URL.
4. MongoDB Atlas: add the Render egress/Cloudflare IP ranges to the Atlas IP
   allowlist (Network Access). Use a strong username/password.
5. Healthcheck: `GET /health` returns `200` when the server is up (Mongo optional).

## CORS / cross-origin

When the client is on GitHub Pages, set `CLIENT_ORIGIN` on the server to the Pages
origin (e.g. `https://suvayan-sdg.github.io`). For local dev, `http://localhost:5173`.
The server logs the configured origin on startup.

## Env

- `MONGO_URI` — required; Atlas connection string.
- `PORT` — server port (default 4000).
- `CLIENT_ORIGIN` — allowed CORS origins, comma-separated (default localhost:5173).
- `NODE_ENV` — development/production.
- `MATCH_DURATION_SECONDS`, `TICK_RATE_HZ`, `ROOM_CODE_LENGTH`,
  `MAX_PLAYERS_PER_ROOM`, `RECONNECT_GRACE_SECONDS`, `ROOM_TTL_HOURS` — operational
  tuning only. Gameplay mechanics (clamps, ramps, lives, durations, spacing curve)
  stay in `src/shared/constants.ts` and are duplicated to the client.

## Shared codebase sync

Two files must be identical on client and server:
- `src/shared/constants.ts`
- `src/shared/obstacles.ts`

After any change, diff them against the client repo copy.
