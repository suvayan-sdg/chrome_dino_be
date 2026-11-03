import crypto from 'crypto';

export function createSessionToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export function buildSessionPayload(roomCode: string, token: string, playerId: string): string {
  const payload = JSON.stringify({ roomCode, token, playerId });
  return Buffer.from(payload).toString('base64url');
}

export function parseSessionPayload(raw: string): { roomCode: string; token: string; playerId: string } | null {
  try {
    const payload = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(payload) as {
      roomCode: string;
      token: string;
      playerId: string;
    };
    if (typeof parsed.roomCode !== 'string' || typeof parsed.token !== 'string' || typeof parsed.playerId !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
