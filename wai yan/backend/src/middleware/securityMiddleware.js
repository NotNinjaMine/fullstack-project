/**
 * Lightweight security middleware (no extra native deps required).
 * - Security headers
 * - JSON body size limit (via express.json options in app.js)
 * - Simple in-memory rate limit for auth
 */

// Very small in-memory rate limiter (single process). Good enough for demo/SME.
const buckets = new Map();

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  // API only — no CSP needed for JSON; frontend has its own host
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/**
 * Rate limit by IP for a path prefix.
 * @param {{ windowMs?: number, max?: number }} opts
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 100 } = {}) {
  return (req, res, next) => {
    const ip =
      req.ip ||
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, max - bucket.count))
    );

    if (bucket.count > max) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      });
    }
    next();
  };
}

/** Stricter limiter for login */
const loginRateLimit = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.LOGIN_RATE_MAX || 30),
});

/** General API limiter */
const apiRateLimit = rateLimit({
  windowMs: Number(process.env.API_RATE_WINDOW_MS || 60 * 1000),
  max: Number(process.env.API_RATE_MAX || 300),
});

function assertJwtSecretConfigured() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-me' || secret.length < 16) {
    console.warn(
      '[security] JWT_SECRET is missing or weak. Set a long random JWT_SECRET in .env'
    );
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to start: JWT_SECRET must be set in production');
    }
  }
}

module.exports = {
  securityHeaders,
  rateLimit,
  loginRateLimit,
  apiRateLimit,
  assertJwtSecretConfigured,
};
