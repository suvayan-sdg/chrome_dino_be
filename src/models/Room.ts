import { Schema, model, models } from 'mongoose';

export type RoomPlayerDoc = {
  name: string;
  colorIndex: number;
  socketId: string;
  connected: boolean;
  lives: number;
  distance: number;
  speedMultiplier: number;
  eliminated: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  joinOrder: number;
  ready: boolean;
  y: number;
  vy: number;
  crouching: boolean;
  stumbling: boolean;
  hitAtDistance: number | null;
};

export const RoomPlayerSchema = new Schema<RoomPlayerDoc>(
  {
    name: { type: String, required: true },
    colorIndex: { type: Number, required: true },
    socketId: { type: String, required: true },
    connected: { type: Boolean, required: true, default: true },
    lives: { type: Number, required: true, default: 3 },
    distance: { type: Number, required: true, default: 0 },
    speedMultiplier: { type: Number, required: true, default: 1 },
    eliminated: { type: Boolean, required: true, default: false },
    finished: { type: Boolean, required: true, default: false },
    finishTimeMs: { type: Number, required: true, default: null },
    joinOrder: { type: Number, required: true },
    ready: { type: Boolean, required: true, default: false },
    y: { type: Number, required: true, default: 0 },
    vy: { type: Number, required: true, default: 0 },
    crouching: { type: Boolean, required: true, default: false },
    stumbling: { type: Boolean, required: true, default: false },
    hitAtDistance: { type: Number, required: true, default: null },
  },
  { _id: false }
);

export type RoomDoc = {
  code: string;
  hostName: string;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  seed: number;
  players: RoomPlayerDoc[];
  createdAt: Date;
  updatedAt: Date;
};

export const RoomSchema = new Schema<RoomDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, match: /^[A-Z]{4}$/ },
    hostName: { type: String, required: true },
    status: {
      type: String,
      enum: ['lobby', 'countdown', 'racing', 'finished'],
      required: true,
      default: 'lobby',
    },
    seed: { type: Number, required: true },
    players: { type: [RoomPlayerSchema], required: true, default: [] },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

RoomSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const Room = models.Room ?? model<RoomDoc>('Room', RoomSchema);
