import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import {
  createSessionToken,
  buildSessionPayload,
  parseSessionPayload,
} from './lib/session';
import { Room, RoomPlayerDoc } from './models/Room';
import { Match as MatchModel } from './models/Match';
import { generateRoomCode } from './lib/roomCodes';
import { generateTrack, deriveSeed } from './shared/obstacles';
import {
  SPEED,
  MATCH,
  PHYSICS,
} from './shared/constants';
import type {
  GameSnapshot,
  SnapshotPlayer,
  SnapshotObstacle,
  InputState,
  GameEvent,
  GameStartedPayload,
} from './shared/types';

// ---------- helpers ----------

function playerIdFor(socket: Socket): string {
  return `p_${socket.id}`;
}

function sessionTokenFor(): string {
  return createSessionToken();
}

function serializeRoomForEmit(room: InstanceType<typeof Room>): {
  code: string;
  hostName: string;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  seed: number;
  players: {
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
  }[];
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    code: room.code,
    hostName: room.hostName,
    status: room.status,
    seed: room.seed,
    players: room.players.map((p: RoomPlayerDoc) => ({
      id: p.socketId,
      name: p.name,
      colorIndex: p.colorIndex,
      lives: p.lives,
      distance: p.distance,
      speedMultiplier: p.speedMultiplier,
      eliminated: p.eliminated,
      finished: p.finished,
      finishTimeMs: p.finishTimeMs,
      joinOrder: p.joinOrder,
      connected: p.connected,
      ready: p.ready,
      y: p.y,
      vy: p.vy,
      crouching: p.crouching,
      stumbling: p.stumbling,
      hitAtDistance: p.hitAtDistance,
      socketId: p.socketId,
    })),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function findPlayer(room: InstanceType<typeof Room>, playerId: string): RoomPlayerDoc | null {
  return room.players.find((p: RoomPlayerDoc) => p.socketId === playerId) ?? null;
}

// ---------- per-room input accumulator ----------

const inputs = new Map<string, Map<string, InputState>>();

function matchInputFor(roomCode: string, playerId: string, input: InputState): void {
  if (!inputs.has(roomCode)) {
    inputs.set(roomCode, new Map());
  }
  inputs.get(roomCode)!.set(playerId, input);
}

export { inputs };

// ---------- match lifecycle ----------

const matchLoops = new Map<string, ReturnType<typeof setInterval>>();
const activeMatchTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export function startMatch(io: SocketServer, room: InstanceType<typeof Room>, _starterPlayerId?: string): void {
  if (room.status !== 'lobby') return;

  const code = room.code;
  const seed = deriveSeed(code, 1);
  room.seed = seed;
  room.status = 'countdown';
  room.updatedAt = new Date();
  room.save().catch((err: unknown) => console.error('save room during start error:', err));

  const existingLoop = matchLoops.get(code);
  if (existingLoop) clearInterval(existingLoop);

  let secondsLeft = 3;
  io.to(code).emit('game:countdown', { secondsLeft });
  const countdownTimer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) {
      io.to(code).emit('game:countdown', { secondsLeft });
      return;
    }
    clearInterval(countdownTimer);

    room.status = 'racing';
    room.save().catch((err: unknown) => console.error('save room during racing start error:', err));

    const track = generateTrack(seed, MATCH.trackLengthMeters);
    const startAt = Date.now();

    const started: GameStartedPayload = {
      seed,
      startAt,
      players: room.players.map((p: RoomPlayerDoc) => ({
        id: p.socketId,
        name: p.name,
        colorIndex: p.colorIndex,
        lives: p.lives,
        distance: p.distance,
        speedMultiplier: p.speedMultiplier,
        eliminated: p.eliminated,
        finished: p.finished,
        finishTimeMs: p.finishTimeMs,
        joinOrder: p.joinOrder,
        connected: p.connected,
        ready: p.ready,
        y: p.y,
        vy: p.vy,
        crouching: p.crouching,
        stumbling: p.stumbling,
        hitAtDistance: p.hitAtDistance,
        socketId: p.socketId,
      })),
      trackLengthMeters: MATCH.trackLengthMeters,
      constants: {
        trackLengthMeters: MATCH.trackLengthMeters,
        maxDurationSeconds: MATCH.maxDurationSeconds,
        minMultiplier: SPEED.minMultiplier,
        maxMultiplier: SPEED.maxMultiplier,
        rampPer100ms: SPEED.rampPer100ms,
        postHitLockDurationMs: SPEED.postHitLockDurationMs,
        invincibilityDurationMs: SPEED.invincibilityDurationMs,
        lives: SPEED.lives,
        jumpVelocity: PHYSICS.jumpVelocity,
        gravity: PHYSICS.gravity,
        crouchHeight: PHYSICS.crouchHeight,
      },
    };
    io.to(code).emit('game:started', started);

    const loop = setInterval(() => runTick(io, room, track, code, startAt), 1000 / MATCH.tickRateHz);
    matchLoops.set(code, loop);

    const timeout = setTimeout(() => {
      endMatch(io, room, code, 'timeout', track);
    }, MATCH.maxDurationSeconds * 1000);
    activeMatchTimeouts.set(code, timeout);
  }, 1000);
}

export function endMatch(
  io: SocketServer,
  room: InstanceType<typeof Room>,
  code: string,
  reason: 'finish' | 'timeout' | 'all_eliminated',
  track?: ReturnType<typeof generateTrack>,
): void {
  const loop = matchLoops.get(code);
  if (loop) {
    clearInterval(loop);
    matchLoops.delete(code);
  }
  const timeout = activeMatchTimeouts.get(code);
  if (timeout) {
    clearTimeout(timeout);
    activeMatchTimeouts.delete(code);
  }

  room.status = 'finished';
  room.updatedAt = new Date();
  room.save().catch((err: unknown) => console.error('save room at end error:', err));

  const results = room.players
    .map((p: RoomPlayerDoc) => ({
      name: p.name,
      distance: p.distance,
      livesRemaining: p.lives,
      eliminated: p.eliminated,
      finishTimeMs: p.finishTimeMs,
      placement: 0,
    }))
    .sort((a: { name: string; distance: number; livesRemaining: number; eliminated: boolean; finishTimeMs: number | null; placement: number }, b: { name: string; distance: number; livesRemaining: number; eliminated: boolean; finishTimeMs: number | null; placement: number }) => {
      if (a.eliminated && !b.eliminated) return 1;
      if (!a.eliminated && b.eliminated) return -1;
      if (a.finishTimeMs && b.finishTimeMs) return a.finishTimeMs - b.finishTimeMs;
      if (a.finishTimeMs && !b.finishTimeMs) return -1;
      if (!a.finishTimeMs && b.finishTimeMs) return 1;
      return b.distance - a.distance;
    })
    .map((r: { name: string; distance: number; livesRemaining: number; eliminated: boolean; finishTimeMs: number | null; placement: number }, idx: number) => ({ ...r, placement: idx + 1 }));

  const winnerName = results[0]?.name ?? null;

  MatchModel.create(
    {
      roomCode: code,
      seed: room.seed,
      startedAt: new Date(),
      endedAt: new Date(),
      results,
      winnerName,
      reason,
      createdAt: new Date(),
    },
    (err: unknown) => {
      if (err) console.error('create match error:', err);
    },
  );

  io.to(code).emit('game:over', { results, reason });

  inputs.delete(code);
}

// ---------- simulation tick ----------

function runTick(
  io: SocketServer,
  room: InstanceType<typeof Room>,
  track: ReturnType<typeof generateTrack>,
  code: string,
  startAt: number,
): void {
  const now = Date.now();
  const dt = 1 / MATCH.tickRateHz;
  const baseSpeed = SPEED.baseMetersPerSecond;
  const minMul = SPEED.minMultiplier;
  const maxMul = SPEED.maxMultiplier;
  const ramp = SPEED.rampPer100ms * (1000 * dt);

  const roomInputs = inputs.get(code) ?? new Map();
  const players = room.players;

  for (const player of players) {
    if (player.eliminated || player.finished) continue;
    const input = roomInputs.get(player.socketId);
    if (input) {
      if (input.speedUp) {
        player.speedMultiplier = Math.min(maxMul, player.speedMultiplier + ramp);
      }
      if (input.speedDown) {
        player.speedMultiplier = Math.max(minMul, player.speedMultiplier - ramp);
      }
    }
    const prevDistance = player.distance;
    player.distance += baseSpeed * player.speedMultiplier * dt;

    if (input?.down) {
      player.crouching = true;
    } else {
      player.crouching = false;
    }
    if (input?.up && player.y <= PHYSICS.groundY + 0.05) {
      player.vy = PHYSICS.jumpVelocity;
    }
    player.vy -= PHYSICS.gravity * dt;
    player.y += player.vy * dt;
    if (player.y < PHYSICS.groundY) {
      player.y = PHYSICS.groundY;
      player.vy = 0;
    }
    if (player.hitAtDistance !== null && player.y <= PHYSICS.groundY + 0.05) {
      player.stumbling = false;
    }

    const hitInfo = checkCollisions(player, track, prevDistance, player.distance, dt);
    if (hitInfo) {
      onHit(player, code, hitInfo.distance);
    }

    if (player.distance >= MATCH.trackLengthMeters && !player.finished) {
      player.finished = true;
      player.finishTimeMs = now - startAt;
      io.to(code).emit('game:event', {
        type: 'finish',
        playerId: player.socketId,
        atDistance: player.distance,
      } as GameEvent);
      endMatch(io, room, code, 'finish', track);
      return;
    }
  }

  const snapshot: GameSnapshot = {
    t: now,
    players: players.map((p: RoomPlayerDoc) => ({
      id: p.socketId,
      distance: p.distance,
      speedMultiplier: p.speedMultiplier,
      lives: p.lives,
      eliminated: p.eliminated,
      finished: p.finished,
      y: p.y,
      state: renderStateFor(p),
    })),
    obstacles: track.map((o) => ({
      id: o.id,
      distanceMeters: o.distanceMeters,
      type: o.type,
      kind: o.kind,
      widthMeters: o.widthMeters,
      heightMeters: o.heightMeters,
    })),
  };
  io.to(code).emit('game:snapshot', snapshot);
}

function renderStateFor(p: RoomPlayerDoc): { type: 'running' | 'jumping' | 'crouching' | 'stumbling' | 'eliminated' | 'finished' } {
  if (p.eliminated) return { type: 'eliminated' };
  if (p.finished) return { type: 'finished' };
  if (p.stumbling) return { type: 'stumbling' };
  if (p.crouching) return { type: 'crouching' };
  if (p.y > PHYSICS.groundY + 0.05) return { type: 'jumping' };
  return { type: 'running' };
}

// ---------- collision ----------

interface HitResult {
  distance: number;
}

function checkCollisions(
  player: RoomPlayerDoc,
  track: ReturnType<typeof generateTrack>,
  prevDistance: number,
  nextDistance: number,
  dt: number,
): HitResult | null {
  const dir = nextDistance >= prevDistance ? 1 : -1;
  for (const obs of track) {
    const obsDist = obs.distanceMeters;
    if (dir > 0 && obsDist + obs.widthMeters < prevDistance) continue;
    if (dir < 0 && obsDist > nextDistance) continue;
    const steps = PHYSICS.subSteps;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const sampleDist = prevDistance + (nextDistance - prevDistance) * t;
      const halfWidth = obs.widthMeters / 2;
      const dinoHalfWidth = 0.6;
      if (Math.abs(sampleDist - obsDist) > halfWidth + dinoHalfWidth) continue;
      const playerY = player.y;
      const playerHeight = player.crouching ? PHYSICS.crouchHeight : PHYSICS.normalHeight;
      const playerBottom = playerY;
      const playerTop = playerY + playerHeight;
      const obsHeight = obs.heightMeters;
      const obsTop = obsHeight;
      if (playerBottom < obsTop && playerTop > 0) {
        if (obs.type === 'ground') {
          if (playerTop > obsHeight + 0.2) continue;
          return { distance: obsDist };
        } else {
          if (playerHeight <= PHYSICS.crouchHeight + 0.2 && playerTop < obsTop) continue;
          return { distance: obsDist };
        }
      }
    }
  }
  return null;
}

function onHit(player: RoomPlayerDoc, roomCode: string, distance: number): void {
  player.lives -= 1;
  player.hitAtDistance = distance;
  player.speedMultiplier = SPEED.postHitLockMultiplier;
  player.stumbling = true;
  player.vy = 0;
  player.y = PHYSICS.groundY;
  if (player.lives <= 0) {
    player.eliminated = true;
    const io = (globalThis as any).__io as SocketServer | undefined;
    if (io) {
      io.to(roomCode).emit('game:event', {
        type: 'eliminate',
        playerId: player.socketId,
        atDistance: distance,
      } as GameEvent);
    }
  } else {
    const io = (globalThis as any).__io as SocketServer | undefined;
    if (io) {
      io.to(roomCode).emit('game:event', {
        type: 'hit',
        playerId: player.socketId,
        atDistance: distance,
      } as GameEvent);
    }
  }
}

// ---------- Socket.IO wiring ----------

export function setupSocket(server: HttpServer, io: SocketServer): void {
  io.on('connection', (socket: Socket) => {
    socket.on('room:create', async (payload: { name: string }, ack) => {
      try {
        const name = (payload?.name ?? '').trim();
        if (!name) {
          return ack({ ok: false as const, error: 'Display name is required.' });
        }
        if (name.length > 18) {
          return ack({ ok: false as const, error: 'Display name must be <= 18 characters.' });
        }

        const code = generateRoomCode();
        const token = sessionTokenFor();
        const playerId = playerIdFor(socket);

        const room = await Room.create({
          code,
          hostName: name,
          status: 'lobby',
          seed: 0,
          players: [
            {
              name,
              colorIndex: 0,
              socketId: playerId,
              connected: true,
              lives: SPEED.lives,
              distance: 0,
              speedMultiplier: 1,
              eliminated: false,
              finished: false,
              finishTimeMs: null,
              joinOrder: 1,
              ready: false,
              y: 0,
              vy: 0,
              crouching: false,
              stumbling: false,
              hitAtDistance: null,
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        ack({
          ok: true as const,
          roomCode: code,
          playerId,
          sessionToken: token,
          room: serializeRoomForEmit(room),
        });

        socket.data.session = buildSessionPayload(code, token, playerId);
        socket.data.playerId = playerId;
        socket.data.roomCode = code;

        io.to(code).emit('room:update', { room: serializeRoomForEmit(room) });
      } catch (err) {
        console.error('room:create error:', err);
        ack({ ok: false as const, error: 'Could not create room.' });
      }
    });

    socket.on(
      'room:join',
      async (
        payload: {
          name: string;
          roomCode: string;
          sessionToken?: string;
        },
        ack,
      ) => {
        try {
          const name = (payload?.name ?? '').trim();
          const code = (payload?.roomCode ?? '').toUpperCase();
          if (!name) {
            return ack({ ok: false as const, error: 'Display name is required.' });
          }
          if (name.length > 18) {
            return ack({ ok: false as const, error: 'Display name must be <= 18 characters.' });
          }
          if (!/^[A-Z]{4}$/.test(code)) {
            return ack({ ok: false as const, error: 'Invalid room code.' });
          }

          const room = await Room.findOne({ code });
          if (!room) {
            return ack({ ok: false as const, error: 'Room not found.' });
          }
          if (room.status === 'finished') {
            return ack({ ok: false as const, error: 'Room already finished.' });
          }
          if (room.players.length >= MATCH.maxPlayersPerRoom) {
            return ack({ ok: false as const, error: 'Room is full.' });
          }
          if (room.players.some((p: RoomPlayerDoc) => p.name === name && p.socketId !== socket.id)) {
            return ack({ ok: false as const, error: 'Name already taken in this room.' });
          }
          if (room.status === 'racing') {
            return ack({ ok: false as const, error: 'Match already started.' });
          }

          let playerId = playerIdFor(socket);
          let token = sessionTokenFor();
          if (payload?.sessionToken) {
            const parsed = parseSessionPayload(payload.sessionToken);
            if (parsed && parsed.roomCode === code) {
              const existing = room.players.find((p: RoomPlayerDoc) => p.name === name);
              if (existing) {
                playerId = existing.socketId;
                token = parsed.token;
              }
            }
          }

          const existing = room.players.find((p: RoomPlayerDoc) => p.socketId === socket.id);
          if (existing && existing.name === name) {
            playerId = existing.socketId;
          }

          const colorIndex = room.players.length;
          const joinOrder = room.players.length + 1;

          room.players.push({
            name,
            colorIndex,
            socketId: playerId,
            connected: true,
            lives: SPEED.lives,
            distance: 0,
            speedMultiplier: 1,
            eliminated: false,
            finished: false,
            finishTimeMs: null,
            joinOrder,
            ready: false,
            y: 0,
            vy: 0,
            crouching: false,
            stumbling: false,
            hitAtDistance: null,
          });
          room.updatedAt = new Date();
          await room.save();

          socket.data.session = buildSessionPayload(code, token, playerId);
          socket.data.playerId = playerId;
          socket.data.roomCode = code;

          ack({
            ok: true as const,
            playerId,
            sessionToken: token,
            room: serializeRoomForEmit(room),
          });

          io.to(code).emit('room:update', { room: serializeRoomForEmit(room) });
        } catch (err) {
          console.error('room:join error:', err);
          ack({ ok: false as const, error: 'Could not join room.' });
        }
      },
    );

    socket.on('player:ready', async (payload: { roomCode: string; ready: boolean }, ack) => {
      try {
        const code = (payload?.roomCode ?? '').toUpperCase();
        if (!/^([A-Z]{4})?$/.test(code)) {
          return ack({ ok: false as const, error: 'Invalid room code.' });
        }
        const room = await Room.findOne({ code });
        if (!room) {
          return ack({ ok: false as const, error: 'Room not found.' });
        }
        const player = findPlayer(room, socket.data.playerId ?? playerIdFor(socket));
        if (!player) {
          return ack({ ok: false as const, error: 'Not in this room.' });
        }
        player.ready = !!payload?.ready;
        room.updatedAt = new Date();
        await room.save();

        io.to(code).emit('room:update', { room: serializeRoomForEmit(room) });

        if (room.status === 'lobby') {
          const presentPlayers = room.players.filter((p: RoomPlayerDoc) => p.connected);
          const readyCount = presentPlayers.filter((p: RoomPlayerDoc) => p.ready).length;
          const isHost = room.hostName === player.name;
          if (isHost && presentPlayers.length >= MATCH.minPlayersToStart && readyCount >= presentPlayers.length) {
            startMatch(io, room, socket.data.playerId ?? playerIdFor(socket));
          }
        }

        ack({ ok: true as const });
      } catch (err) {
        console.error('player:ready error:', err);
        ack({ ok: false as const, error: 'Could not update ready state.' });
      }
    });

    socket.on('game:start', async (payload: { roomCode: string }, ack) => {
      try {
        const code = (payload?.roomCode ?? '').toUpperCase();
        const room = await Room.findOne({ code });
        if (!room) {
          return ack({ ok: false as const, error: 'Room not found.' });
        }
        const player = findPlayer(room, socket.data.playerId ?? playerIdFor(socket));
        if (!player) {
          return ack({ ok: false as const, error: 'Not in this room.' });
        }
        if (room.hostName !== player.name) {
          return ack({ ok: false as const, error: 'Only the host can start.' });
        }

        const presentPlayers = room.players.filter((p: RoomPlayerDoc) => p.connected);
        const allReady = presentPlayers.every((p: RoomPlayerDoc) => p.ready);
        const readyCount = presentPlayers.filter((p: RoomPlayerDoc) => p.ready).length;
        if (presentPlayers.length < MATCH.minPlayersToStart) {
          return ack({ ok: false as const, error: 'Need at least 2 present players.' });
        }
        if (!allReady) {
          return ack({ ok: false as const, error: 'Not all present players are ready.' });
        }

        startMatch(io, room, socket.data.playerId ?? playerIdFor(socket));
        ack({ ok: true as const });
      } catch (err) {
        console.error('game:start error:', err);
        ack({ ok: false as const, error: 'Could not start match.' });
      }
    });

    socket.on('input:state', (payload: InputState, ack) => {
      const code = socket.data.roomCode;
      if (!code) {
        return;
      }
      const normalized: InputState = {
        up: !!payload?.up,
        down: !!payload?.down,
        speedUp: !!payload?.speedUp,
        speedDown: !!payload?.speedDown,
      };
      if (socket.data.playerId) {
        matchInputFor(code, socket.data.playerId, normalized);
      }
      ack({ ok: true as const });
    });

    socket.on('game:rejoin', async (payload: { roomCode: string; sessionToken: string }, ack) => {
      try {
        const code = (payload?.roomCode ?? '').toUpperCase();
        const parsed = parseSessionPayload(payload?.sessionToken ?? '');
        if (!parsed || parsed.roomCode !== code) {
          return ack({ ok: false as const, error: 'Invalid session.' });
        }
        const room = await Room.findOne({ code });
        if (!room) {
          return ack({ ok: false as const, error: 'Room not found.' });
        }
        const player = room.players.find((p: RoomPlayerDoc) => p.socketId === parsed.playerId);
        if (!player) {
          return ack({ ok: false as const, error: 'Player not in room.' });
        }
        if (room.status === 'finished') {
          return ack({ ok: false as const, error: 'Room already finished.' });
        }

        player.connected = true;
        player.socketId = parsed.playerId;
        room.updatedAt = new Date();
        await room.save();
        socket.data.playerId = parsed.playerId;
        socket.data.roomCode = code;
        socket.data.session = buildSessionPayload(code, parsed.token, parsed.playerId);

        ack({
          ok: true as const,
          playerId: parsed.playerId,
          sessionToken: parsed.token,
          room: serializeRoomForEmit(room),
        });
        io.to(code).emit('room:update', { room: serializeRoomForEmit(room) });
      } catch (err) {
        console.error('game:rejoin error:', err);
        ack({ ok: false as const, error: 'Could not rejoin.' });
      }
    });

    socket.on('disconnect', async () => {
      const code = socket.data.roomCode;
      const playerId = socket.data.playerId;
      if (!code || !playerId) return;
      try {
        const room = await Room.findOne({ code });
        if (!room) return;
        const player = findPlayer(room, playerId);
        if (!player) return;
        player.connected = false;
        room.updatedAt = new Date();
        await room.save();
        io.to(code).emit('room:update', { room: serializeRoomForEmit(room) });
      } catch (err) {
        console.error('disconnect error:', err);
      }
    });

    socket.on('room:leave', async (payload: { roomCode?: string }, ack) => {
      const code = (payload?.roomCode ?? socket.data.roomCode ?? '').toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) {
        return ack({ ok: false as const, error: 'Invalid room code.' });
      }
      try {
        const room = await Room.findOne({ code });
        if (!room) {
          return ack({ ok: false as const, error: 'Room not found.' });
        }
        const playerId = socket.data.playerId ?? playerIdFor(socket);
        const player = findPlayer(room, playerId);
        if (!player) {
          return ack({ ok: false as const, error: 'Not in this room.' });
        }
        room.players = room.players.filter((p: RoomPlayerDoc) => p.socketId !== playerId);
        if (room.players.length === 0) {
          await room.deleteOne();
          ack({ ok: true as const });
          socket.data.roomCode = null;
          socket.data.playerId = null;
          socket.data.session = null;
          return;
        }
        if (room.hostName === player.name) {
          const remaining = room.players.filter((p: RoomPlayerDoc) => p.socketId !== playerId).sort((a: RoomPlayerDoc, b: RoomPlayerDoc) => a.joinOrder - b.joinOrder);
          if (remaining.length) {
            room.hostName = remaining[0].name;
          }
        }
        room.updatedAt = new Date();
        await room.save();
        io.to(code).emit('room:update', { room: serializeRoomForEmit(room) });
        ack({ ok: true as const });
        socket.data.roomCode = null;
        socket.data.playerId = null;
        socket.data.session = null;
      } catch (err) {
        console.error('room:leave error:', err);
        ack({ ok: false as const, error: 'Could not leave room.' });
      }
    });
  });
}
