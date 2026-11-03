# Shared constants and types for the server.

## Sync note (two-repo setup)

The client repo contains its own copy of `shared/constants.ts` and
`shared/obstacles.ts`. These must stay in sync: any change to speed clamps, ramps,
lives, durations, obstacle spacing, or track length must be made in BOTH copies and
verified against each other. The obstacle generator must be deterministic and
identical on both sides so every client renders the same track as the server.

## Files

- constants.ts — gameplay tuning constants (not env; env is only for operational
  tuning like tick rate, room TTL, match duration cap).
- obstacles.ts — deterministic seeded obstacle sequence generator (shared with client).
- types.ts — room/snapshot/player shapes shared with client.
