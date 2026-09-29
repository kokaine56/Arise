import { createHmac } from 'node:crypto';
import type { RequestContext } from './http.js';
import { HttpError } from './http.js';

export const getAccessCode = (): string => {
  const code = process.env.APP_ACCESS_CODE;
  if (!code || !/^\d{4}$/.test(code)) {
    console.error('CRITICAL: APP_ACCESS_CODE environment variable must be exactly 4 digits.');
    process.exit(1);
  }
  return code;
};

const sign = (val: string) => createHmac('sha256', getAccessCode()).update(val).digest('hex');

export const setAccessCookie = (res: RequestContext['res']) => {
  const payload = 'authenticated';
  const signature = sign(payload);
  // Using Secure in production (Render sets x-forwarded-proto). We'll omit Secure for localhost.
  const cookie = `arise_access=${payload}.${signature}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax`;
  res.setHeader('Set-Cookie', cookie);
};

export const clearAccessCookie = (res: RequestContext['res']) => {
  res.setHeader('Set-Cookie', `arise_access=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
};

export const hasAccessSession = (req: RequestContext['req']): boolean => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return false;
  
  const match = cookieHeader.match(/arise_access=([^;]+)/);
  if (!match) return false;

  const parts = match[1].split('.');
  if (parts.length !== 2) return false;
  
  const payload = parts[0];
  const signature = parts[1];
  
  if (payload !== 'authenticated') return false;

  return sign(payload) === signature;
};

export const requireAccessSession = (ctx: RequestContext) => {
  if (!hasAccessSession(ctx.req)) {
    throw new HttpError(401, 'unauthorized', 'Access denied.');
  }
};
