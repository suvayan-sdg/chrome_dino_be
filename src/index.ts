import { createApp } from './app';
import { connectMongo, disconnectMongo } from './db/mongo';
import { Server as SocketServer } from 'socket.io';
import http from 'http';
import { setupSocket } from './wiring';

function parsePort(env: string | undefined, fallback = 4000): number {
  const parsed = parseInt(env ?? String(fallback), 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

function parseOrigins(env: string | undefined, fallback = 'http://localhost:5173'): string {
  return (env ?? fallback).split(',').map((s) => s.trim()).filter(Boolean).join(',');
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is required but not set.');
    process.exit(1);
  }

  const port = parsePort(process.env.PORT);
  const clientOrigin = parseOrigins(process.env.CLIENT_ORIGIN);
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  const matchDurationSeconds = parseInt(process.env.MATCH_DURATION_SECONDS ?? '60', 10) || 60;
  const tickRateHz = parseInt(process.env.TICK_RATE_HZ ?? '20', 10) || 20;
  const roomCodeLength = parseInt(process.env.ROOM_CODE_LENGTH ?? '4', 10) || 4;
  const maxPlayersPerRoom = parseInt(process.env.MAX_PLAYERS_PER_ROOM ?? '4', 10) || 4;
  const reconnectGraceSeconds = parseInt(process.env.RECONNECT_GRACE_SECONDS ?? '15', 10) || 15;
  const roomTtlHours = parseInt(process.env.ROOM_TTL_HOURS ?? '24', 10) || 24;

  console.log('Dino Race server starting…');
  console.log({ port, clientOrigin, nodeEnv, mongoUri: mongoUri.slice(0, 20) + '…' });

  try {
    await connectMongo(mongoUri);
    console.log('MongoDB connected.');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    console.error('Server will continue in-memory-only for active matches where possible.');
  }

  const app = createApp({
    mongoUri,
    port,
    clientOrigin,
    nodeEnv,
    matchDurationSeconds,
    tickRateHz,
    roomCodeLength,
    maxPlayersPerRoom,
    reconnectGraceSeconds,
    roomTtlHours,
  });

  const allowedOrigins = clientOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  const httpServer = http.createServer(app);
  const io = new SocketServer(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  (globalThis as any).__io = io;

  setupSocket(httpServer, io);

  httpServer.listen(port, () => {
    console.log(`Dino Race server listening on :${port}`);
    console.log(`Health: http://localhost:${port}/health`);
    console.log(`CORS allowed origin(s): ${clientOrigin}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down…`);
    io.close(() => {
      httpServer.close(() => {
        disconnectMongo().finally(() => {
          console.log('Server stopped.');
          process.exit(0);
        });
      });
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
