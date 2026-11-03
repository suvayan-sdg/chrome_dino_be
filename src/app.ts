import express, { Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { parseOrigins, corsOriginDelegate } from './lib/cors';
import roomRouter from './routes/rooms';
import healthRouter from './routes/health';

function mongooseConnectionState(): string {
  const state = mongoose.connection?.readyState;
  if (state === 0) return 'disconnected';
  if (state === 1) return 'connected';
  if (state === 2) return 'connecting';
  if (state === 3) return 'disconnecting';
  return 'unknown';
}

type AppEnv = {
  mongoUri: string;
  port: number;
  clientOrigin: string;
  nodeEnv: string;
  matchDurationSeconds: number;
  tickRateHz: number;
  roomCodeLength: number;
  maxPlayersPerRoom: number;
  reconnectGraceSeconds: number;
  roomTtlHours: number;
};

export function createApp(env: AppEnv) {
  const app = express();
  app.use(express.json());

  const allowedOrigins = parseOrigins(env.clientOrigin, 'http://localhost:5173');
  const defaultOrigin = Array.from(allowedOrigins)[0] ?? 'http://localhost:5173';

  app.use(cors({
    origin: corsOriginDelegate(allowedOrigins, defaultOrigin) as any,
    methods: ['GET', 'POST'],
    credentials: true,
    maxAge: 86400,
  }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      env: env.nodeEnv,
      mongo: mongooseConnectionState(),
    });
  });

  app.use('/rooms', roomRouter);

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Dino Race — server',
      status: 'ok',
      endpoints: {
        health: '/health',
        rooms: '/rooms',
        socket: 'Socket.IO',
      },
    });
  });

  app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
    console.error('Unhandled Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export type { AppEnv };
