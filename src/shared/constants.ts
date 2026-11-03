// Gameplay tuning constants — single source of truth for server simulation.
// DUPLICATE to client shared/constants.ts and keep in sync.

export const SPEED = {
  baseMetersPerSecond: 5,
  minMultiplier: 0.5,
  maxMultiplier: 2.5,
  rampPer100ms: 0.15,
  postHitLockMultiplier: 1.0,
  postHitLockDurationMs: 1000,
  invincibilityDurationMs: 1500,
  lives: 3,
} as const;

export const INPUT = {
  throttleIntervalMs: 33,
} as const;

export const MATCH = {
  maxDurationSeconds: 60,
  trackLengthMeters: 400,
  tickRateHz: 20,
  reconnectGraceSeconds: 15,
  roomTtlHours: 24,
  roomCodeLength: 4,
  maxPlayersPerRoom: 4,
  minPlayersToStart: 2,
} as const;

export const PHYSICS = {
  jumpVelocity: 9.5,
  gravity: 18,
  groundY: 0,
  crouchHeight: 0.5,
  normalHeight: 1,
  subSteps: 8,
} as const;

export const OBSTACLES = {
  groundTypes: ['cactus', 'rock'] as const,
  airTypes: ['ptera'] as const,
  minGapMeters: 14,
  maxGapMeters: 26,
  curveFactor: 0.9,
} as const;

export const COLORS = {
  players: [
    { hex: '#f97316', name: 'orange' },
    { hex: '#06b6d4', name: 'cyan' },
    { hex: '#a855f7', name: 'purple' },
    { hex: '#4ade80', name: 'green' },
  ] as const,
} as const;

export const RANK_MARKER = {
  shapes: ['▲', '■', '●', '◆'] as const,
} as const;
