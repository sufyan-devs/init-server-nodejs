import type { Request } from 'express';

interface ClientIpOptions {
  trustedProxyCount?: number;
}

function getClientIp(req: Request, options: ClientIpOptions = {}): string {
  const { trustedProxyCount = 1 } = options;

  const cfIp = req.headers['cf-connecting-ip'] as string | undefined;
  if (cfIp && isValidIp(cfIp.trim())) return cfIp.trim();

  const trueClientIp = req.headers['true-client-ip'] as string | undefined;
  if (trueClientIp && isValidIp(trueClientIp.trim())) return trueClientIp.trim();

  const xRealIp = req.headers['x-real-ip'] as string | undefined;
  if (xRealIp && isValidIp(xRealIp.trim())) return xRealIp.trim();

  const xff = req.headers['x-forwarded-for'] as string | undefined;
  if (xff) {
    const ips = xff.split(',').map((ip: string) => ip.trim()).filter(Boolean);
    if (ips.length > 0) {
      const idx = Math.max(0, ips.length - trustedProxyCount);
      const candidate = ips[idx];
      if (candidate && isValidIp(candidate)) return candidate;
    }
  }

  return normalizeIp(req.socket?.remoteAddress || '');
}

function normalizeIp(ip: string): string {
  if (!ip) return '';
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : ip;
}

function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (ip.includes(':')) return true;
  return false;
}

export { getClientIp, normalizeIp };
