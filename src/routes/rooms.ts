import { Router, Request, Response } from 'express';
import { Room, RoomPlayerDoc } from '../models/Room';
import { generateRoomCode } from '../lib/roomCodes';
import { createSessionToken } from '../lib/session';
import crypto from 'crypto';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }
    const code = generateRoomCode();
    const token = createSessionToken();
    const playerId = `p_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

    const room = await Room.create({
      code,
      hostName: name.trim(),
      status: 'lobby',
      seed: 0,
      players: [
        {
          name: name.trim(),
          colorIndex: 0,
          socketId: playerId,
          connected: true,
          lives: 3,
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

    res.json({
      roomCode: room.code,
      playerId,
      sessionToken: token,
      room: serializeRoom(room),
    });
  } catch (err: unknown) {
    console.error('POST /rooms error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:code', async (req: Request, res: Response) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ room: serializeRoom(room) });
  } catch (err: unknown) {
    console.error('GET /rooms/:code error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function serializeRoom(room: InstanceType<typeof Room>) {
  return {
    code: room.code,
    hostName: room.hostName,
    status: room.status,
    seed: room.seed,
    players: room.players.map((p: RoomPlayerDoc) => ({
      name: p.name,
      colorIndex: p.colorIndex,
      socketId: p.socketId,
      connected: p.connected,
      lives: p.lives,
      distance: p.distance,
      speedMultiplier: p.speedMultiplier,
      eliminated: p.eliminated,
      finished: p.finished,
      finishTimeMs: p.finishTimeMs,
      joinOrder: p.joinOrder,
      ready: p.ready,
      y: p.y,
      vy: p.vy,
      crouching: p.crouching,
      stumbling: p.stumbling,
      hitAtDistance: p.hitAtDistance,
    })),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

export default router;
