import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaUrl = searchParams.get('url');

    if (!mediaUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    // Fetch the actual media file from Instagram CDN
    const response = await fetch(mediaUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      console.error(`[Proxy] CDN returned status ${response.status} for URL: ${mediaUrl.slice(0, 100)}...`);
      return new NextResponse(`Failed to fetch media from CDN (status ${response.status})`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine appropriate file extension
    let extension = 'jpg';
    if (contentType.includes('video') || contentType.includes('mp4')) {
      extension = 'mp4';
    } else if (contentType.includes('webp')) {
      extension = 'webp';
    } else if (contentType.includes('png')) {
      extension = 'png';
    } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      extension = 'jpg';
    }

    const filename = `instagram_${Date.now()}.${extension}`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[Proxy Error]:', error);
    return new NextResponse('Internal Server Error while proxying download', { status: 500 });
  }
}
