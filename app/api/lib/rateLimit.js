/**
 * app/api/lib/rateLimit.js
 *
 * Sliding window in-memory rate limiter for serverless Next.js endpoints.
 * Protects against API credit exhaustion, brute force abuse, and DoS attacks.
 */

import { NextResponse } from 'next/server';

// In-memory rate limit store: Map<string, { count: number, resetTime: number }>
const rateLimitStore = new Map();

// Periodic cleanup to avoid memory leaks in long-running instances
let lastCleanup = Date.now();
function cleanupExpiredRecords() {
  const now = Date.now();
  if (now - lastCleanup < 60000) return; // Cleanup at most once per minute
  lastCleanup = now;

  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Extracts a normalized, safe client IP identifier from request headers.
 */
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list of IPs; first is client
    const clientIp = forwarded.split(',')[0].trim();
    if (clientIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(clientIp)) {
      return clientIp;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(realIp.trim())) {
    return realIp.trim();
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(cfIp.trim())) {
    return cfIp.trim();
  }

  return 'anonymous';
}

/**
 * Evaluates rate limit for a given key (e.g. `ip:endpoint`).
 *
 * @param {string} key Identifier for rate limiting
 * @param {number} limit Maximum permitted requests within the window
 * @param {number} windowMs Time window in milliseconds
 * @returns {{ success: boolean, limit: number, remaining: number, reset: number }}
 */
export function checkRateLimit(key, limit = 120, windowMs = 60000) {
  if (key.endsWith(':anonymous')) {
    return { success: true, limit, remaining: limit, reset: Date.now() + windowMs };
  }
  cleanupExpiredRecords();

  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, record);
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - 1),
      reset: record.resetTime,
    };
  }

  record.count += 1;
  const remaining = Math.max(0, limit - record.count);
  const success = record.count <= limit;

  return {
    success,
    limit,
    remaining,
    reset: record.resetTime,
  };
}

/**
 * Constructs a standardized HTTP 429 Too Many Requests response with standard rate limit headers.
 */
export function rateLimitExceededResponse(rateInfo) {
  const retryAfterSec = Math.max(1, Math.ceil((rateInfo.reset - Date.now()) / 1000));

  return NextResponse.json(
    {
      error: 'Too many requests. Please wait a moment before trying again.',
      retryAfter: retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(rateInfo.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(rateInfo.reset / 1000)),
      },
    }
  );
}
