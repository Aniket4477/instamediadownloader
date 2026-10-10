import { NextResponse } from 'next/server';
import {
  validateProxyTargetUrl,
  getCorsHeaders,
  getSafeContentTypeAndExtension,
} from '../lib/security';
import { getClientIp, checkRateLimit, rateLimitExceededResponse } from '../lib/rateLimit';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Handle CORS preflight
 */
export async function OPTIONS(request) {
  const corsHeaders = getCorsHeaders(request);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request) {
  const corsHeaders = getCorsHeaders(request);

  try {
    // 1. Rate Limiting: 120 proxy requests per minute per IP
    const clientIp = getClientIp(request);
    const rateInfo = checkRateLimit(`proxy:${clientIp}`, 1200, 60000);
    if (!rateInfo.success) {
      return rateLimitExceededResponse(rateInfo);
    }

    // 2. Extract and Validate Target URL
    const { searchParams } = new URL(request.url);
    let targetUrl = searchParams.get('url');
    const isDownload = searchParams.get('dl') === '1';

    if (!targetUrl) {
      return new NextResponse('Missing url parameter', {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Auto-unwrap nested CDN URLs from wrapper services if present
    try {
      if (
        targetUrl.includes('igram.world/get') ||
        targetUrl.includes('storiesig.info/get') ||
        targetUrl.includes('anonyig.com/get') ||
        targetUrl.includes('instasaver.io/api/media/proxy')
      ) {
        const parsed = new URL(targetUrl);
        const innerUri = parsed.searchParams.get('uri');
        if (innerUri && innerUri.startsWith('http')) {
          targetUrl = innerUri;
        }
      } else if (targetUrl.includes('indown.io/fetch')) {
        const parsed = new URL(targetUrl);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl && innerUrl.startsWith('http')) {
          targetUrl = innerUrl;
        }
      }
    } catch {
      // Keep original targetUrl on parse error
    }

    // Clean download flag query tags from CDN link
    const cleanFetchUrl = targetUrl.replace(/[?&]dl=1/, '');

    // 3. Strict SSRF Protection & Domain Allowlist Validation
    const validation = validateProxyTargetUrl(cleanFetchUrl);
    if (!validation.valid) {
      return new NextResponse(`Forbidden: ${validation.error}`, {
        status: 403,
        headers: corsHeaders,
      });
    }

    // 4. Fetch media from verified Instagram / Meta CDN
    const response = await fetch(validation.sanitizedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return new NextResponse(`CDN fetch failed (${response.status})`, {
        status: response.status >= 400 && response.status < 500 ? response.status : 502,
        headers: corsHeaders,
      });
    }

    // 5. Enforce Safe MIME Types and Filenames
    const rawContentType = response.headers.get('content-type') || 'image/jpeg';
    const { contentType, extension } = getSafeContentTypeAndExtension(rawContentType, cleanFetchUrl);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate safe deterministic filename (path traversal immune)
    const filename = `instagram_media_${Date.now()}.${extension}`;
    const disposition = isDownload ? `attachment; filename="${filename}"` : 'inline';

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': disposition,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    return new NextResponse('Internal Server Error in Proxy', {
      status: 500,
      headers: corsHeaders,
    });
  }
}
