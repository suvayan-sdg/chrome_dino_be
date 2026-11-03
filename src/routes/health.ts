import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    name: 'Dino Race — server health',
    uptime: process.uptime(),
  });
});

export default router;
