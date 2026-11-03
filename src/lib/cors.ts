import { IncomingMessage } from 'http';
import * as cors from 'cors';

export function parseOrigins(envValue: string | undefined, fallback: string): Set<string> {
  const raw = envValue ?? fallback;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isAllowedOrigin(origin: string | null, allowed: Set<string>, defaultOrigin: string): boolean {
  if (!origin) {
    return true;
  }
  if (allowed.has(origin)) {
    return true;
  }
  if (allowed.has('*')) {
    return true;
  }
  return false;
}

export function corsOriginDelegate(allowed: Set<string>, defaultOrigin: string) {
  return (req: IncomingMessage, _origin: string | undefined, next: (err: Error | null) => void) => {
    const reqAny = req as any;
    const originHeader = reqAny.get?.('Origin') ?? null;
    if (!isAllowedOrigin(originHeader, allowed, defaultOrigin)) {
      return next(new Error(`CORS blocked: ${originHeader}`));
    }
    const reflect =
      originHeader && isAllowedOrigin(originHeader, allowed, defaultOrigin)
        ? originHeader
        : defaultOrigin;
    return { origin: reflect };
  };
}
