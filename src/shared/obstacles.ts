export type Obstacle = {
  id: number;
  distanceMeters: number;
  type: 'ground' | 'air';
  kind: 'cactus' | 'rock' | 'ptera';
  widthMeters: number;
  heightMeters: number;
};

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GROUND_HEIGHT = 0.9;
const AIR_HEIGHT = 0.7;
const OBSTACLE_GAP_BASE = 26;
const OBSTACLE_GAP_MIN = 14;
const OBSTACLE_CURVE = 0.9;

export function generateTrack(seed: number, trackLengthMeters: number): Obstacle[] {
  const rand = mulberry32(seed);
  const obstacles: Obstacle[] = [];
  let pos = 24;
  let id = 0;

  while (pos < trackLengthMeters - 6) {
    const isAir = rand() < 0.28;
    const type: 'ground' | 'air' = isAir ? 'air' : 'ground';

    let kind: 'cactus' | 'rock' | 'ptera';
    if (type === 'air') {
      kind = 'ptera';
    } else {
      kind = rand() < 0.55 ? 'cactus' : 'rock';
    }

    const baseWidth = kind === 'ptera' ? 1.6 : kind === 'cactus' ? 0.9 : 1.2;
    const baseHeight = kind === 'ptera' ? AIR_HEIGHT : kind === 'cactus' ? 0.9 : GROUND_HEIGHT;

    const widthMeters = baseWidth;
    const heightMeters = baseHeight;

    const gap = OBSTACLE_GAP_BASE - (pos / trackLengthMeters) * (OBSTACLE_GAP_BASE - OBSTACLE_GAP_MIN) * OBSTACLE_CURVE;
    const nextPos = Math.max(pos + gap, pos + OBSTACLE_GAP_MIN);
    obstacles.push({
      id,
      distanceMeters: Math.round(nextPos * 100) / 100,
      type,
      kind,
      widthMeters,
      heightMeters,
    });

    id++;
    pos = nextPos;
  }

  return obstacles;
}

export function deriveSeed(roomCode: string, counter: number): number {
  return hashSeed(`${roomCode}:${counter}`);
}

export function trackSummary(obstacles: Obstacle[]): { count: number; firstDist: number; lastDist: number } {
  if (obstacles.length === 0) {
    return { count: 0, firstDist: 0, lastDist: 0 };
  }
  return {
    count: obstacles.length,
    firstDist: obstacles[0].distanceMeters,
    lastDist: obstacles[obstacles.length - 1].distanceMeters,
  };
}
