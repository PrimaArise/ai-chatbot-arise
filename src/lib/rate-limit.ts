/**
 * In-memory rate limiter.
 * 20 requests per 60 seconds per userId.
 * Note: Works for single-server deployment.
 * For multi-instance production, use Upstash Redis.
 */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 menit

export function checkRateLimit(userId: string): {
    allowed: boolean;
    remaining: number;
    resetInMs: number;
} {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(userId, { count: 1, windowStart: now });
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetInMs: RATE_LIMIT_WINDOW_MS };
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        const resetInMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
        return { allowed: false, remaining: 0, resetInMs };
    }

    entry.count++;
    return {
        allowed: true,
        remaining: RATE_LIMIT_MAX - entry.count,
        resetInMs: RATE_LIMIT_WINDOW_MS - (now - entry.windowStart),
    };
}
