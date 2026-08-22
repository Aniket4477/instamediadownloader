import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let targetUrl = searchParams.get('url');
    const isDownload = searchParams.get('dl') === '1';

    if (!targetUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
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
      // Use original URL if parsing fails
    }

    // Clean any extra download query tags from the CDN link
    const cleanFetchUrl = targetUrl.replace(/[?&]dl=1/, '');

    // Fetch the media from Instagram CDN with official referer
    const response = await fetch(cleanFetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.error(`[Proxy] CDN returned ${response.status} for: ${cleanFetchUrl.slice(0, 80)}...`);
      return new NextResponse(`CDN fetch failed (${response.status})`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extension = 'jpg';
    if (contentType.includes('video') || contentType.includes('mp4') || cleanFetchUrl.includes('.mp4')) {
      extension = 'mp4';
    } else if (contentType.includes('webp') || cleanFetchUrl.includes('.webp')) {
      extension = 'webp';
    } else if (contentType.includes('png') || cleanFetchUrl.includes('.png')) {
      extension = 'png';
    }

    const filename = `instagram_story_${Date.now()}.${extension}`;
    const disposition = isDownload ? `attachment; filename="${filename}"` : 'inline';

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[Proxy Error]:', error);
    return new NextResponse('Internal Server Error in Proxy', { status: 500 });
  }
}
