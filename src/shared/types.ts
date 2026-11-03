export type RoomPlayer = {
  id: string;
  name: string;
  colorIndex: number;
  lives: number;
  distance: number;
  speedMultiplier: number;
  eliminated: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  joinOrder: number;
  connected: boolean;
  ready: boolean;
  y: number;
  vy: number;
  crouching: boolean;
  stumbling: boolean;
  hitAtDistance: number | null;
  socketId: string;
};

export type Room = {
  code: string;
  hostName: string;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  seed: number;
  players: RoomPlayer[];
  createdAt: Date;
  updatedAt: Date;
};

export type MatchResult = {
  name: string;
  distance: number;
  livesRemaining: number;
  eliminated: boolean;
  finishTimeMs: number | null;
  placement: number;
};

export type Match = {
  roomCode: string;
  seed: number;
  startedAt: Date;
  endedAt: Date;
  results: MatchResult[];
  winnerName: string | null;
  reason: 'finish' | 'timeout' | 'all_eliminated';
  createdAt: Date;
};

export type GameSnapshot = {
  t: number;
  players: SnapshotPlayer[];
  obstacles: SnapshotObstacle[];
};

export type SnapshotPlayer = {
  id: string;
  distance: number;
  speedMultiplier: number;
  lives: number;
  eliminated: boolean;
  finished: boolean;
  y: number;
  state: PlayerRenderState;
};

export type PlayerRenderState =
  | { type: 'running' }
  | { type: 'jumping' }
  | { type: 'crouching' }
  | { type: 'stumbling' }
  | { type: 'eliminated' }
  | { type: 'finished' };

export type SnapshotObstacle = {
  id: number;
  distanceMeters: number;
  type: 'ground' | 'air';
  kind: 'cactus' | 'rock' | 'ptera';
  widthMeters: number;
  heightMeters: number;
};

export type InputState = {
  up: boolean;
  down: boolean;
  speedUp: boolean;
  speedDown: boolean;
};

export type GameEventType = 'hit' | 'finish' | 'eliminate';

export type GameEvent = {
  type: GameEventType;
  playerId: string;
  atDistance: number;
};

export type CountdownPayload = {
  secondsLeft: number;
};

export type GameStartedPayload = {
  seed: number;
  startAt: number;
  players: RoomPlayer[];
  trackLengthMeters: number;
  constants: {
    trackLengthMeters: number;
    maxDurationSeconds: number;
    minMultiplier: number;
    maxMultiplier: number;
    rampPer100ms: number;
    postHitLockDurationMs: number;
    invincibilityDurationMs: number;
    lives: number;
    jumpVelocity: number;
    gravity: number;
    crouchHeight: number;
  };
};

export type CreateRoomAck = {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  room: Room;
};

export type JoinAck = { ok: true; playerId: string; sessionToken: string; room: Room } | { ok: false; error: string };

export type RoomError = {
  code: string;
  message: string;
};
