import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaUrl = searchParams.get('url');
    const isDownload = searchParams.get('dl') === '1';

    if (!mediaUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    // Fetch the media from Instagram CDN with proper headers
    const response = await fetch(mediaUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.error(`[Proxy] CDN returned ${response.status} for: ${mediaUrl.slice(0, 80)}...`);
      return new NextResponse(`CDN fetch failed (${response.status})`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extension = 'jpg';
    if (contentType.includes('video') || contentType.includes('mp4')) {
      extension = 'mp4';
    } else if (contentType.includes('webp')) {
      extension = 'webp';
    } else if (contentType.includes('png')) {
      extension = 'png';
    }

    const filename = `instagram_${Date.now()}.${extension}`;
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
