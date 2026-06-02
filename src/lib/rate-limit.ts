/**
 * In-memory rate limiter.
 * 20 requests per 24 jam per userId.
 *
 * Disesuaikan dengan Groq free-tier TPD:
 *  - llama-3.3-70b-versatile: 100.000 token/hari
 *  - Rata-rata ~2.000 token/respons → max ~50 request/hari (shared semua user)
 *  - Limit 20/user/hari memberi ruang yang aman untuk beberapa user sekaligus
 *
 * Note: Works for single-server deployment.
 * For multi-instance production, use Upstash Redis.
 */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
export const RATE_LIMIT_MAX = 40; // 100K TPD / ~1.800 token/respons ≈ 55 max → ambil 40 dengan buffer 25%
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 jam

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

/**
 * Membaca status rate limit tanpa mengkonsumsi slot.
 * Digunakan oleh endpoint GET /api/rate-limit untuk tampilan di UI.
 */
export function getRateLimitStatus(userId: string): {
    used: number;
    remaining: number;
    max: number;
    resetInMs: number;
    resetsAt: number; // Unix timestamp (ms) kapan window reset
} {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        return {
            used: 0,
            remaining: RATE_LIMIT_MAX,
            max: RATE_LIMIT_MAX,
            resetInMs: RATE_LIMIT_WINDOW_MS,
            resetsAt: now + RATE_LIMIT_WINDOW_MS,
        };
    }

    const resetInMs = Math.max(0, RATE_LIMIT_WINDOW_MS - (now - entry.windowStart));
    return {
        used: entry.count,
        remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
        max: RATE_LIMIT_MAX,
        resetInMs,
        resetsAt: entry.windowStart + RATE_LIMIT_WINDOW_MS,
    };
}
