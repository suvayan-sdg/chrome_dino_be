const BASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += BASE[Math.floor(Math.random() * BASE.length)];
  }
  return code;
}
