import { Schema, model, models } from 'mongoose';

export type MatchResultDoc = {
  name: string;
  distance: number;
  livesRemaining: number;
  eliminated: boolean;
  finishTimeMs: number | null;
  placement: number;
};

export const MatchResultSchema = new Schema<MatchResultDoc>(
  {
    name: { type: String, required: true },
    distance: { type: Number, required: true },
    livesRemaining: { type: Number, required: true },
    eliminated: { type: Boolean, required: true },
    finishTimeMs: { type: Number, required: true, default: null },
    placement: { type: Number, required: true },
  },
  { _id: false }
);

export type MatchDoc = {
  roomCode: string;
  seed: number;
  startedAt: Date;
  endedAt: Date;
  results: MatchResultDoc[];
  winnerName: string | null;
  reason: 'finish' | 'timeout' | 'all_eliminated';
  createdAt: Date;
};

export const MatchSchema = new Schema<MatchDoc>(
  {
    roomCode: { type: String, required: true },
    seed: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    results: { type: [MatchResultSchema], required: true, default: [] },
    winnerName: { type: String, required: true, default: null },
    reason: {
      type: String,
      enum: ['finish', 'timeout', 'all_eliminated'],
      required: true,
    },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: 'createdAt' } }
);

MatchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const Match = models.Match ?? model<MatchDoc>('Match', MatchSchema);
