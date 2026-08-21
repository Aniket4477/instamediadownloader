import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaUrl = searchParams.get('url');

    if (!mediaUrl) {
      return new NextResponse("Missing URL parameter", { status: 400 });
    }

    // Fetch the actual media file from Instagram's CDN
    const response = await fetch(mediaUrl, {
      headers: {
        // Sometimes required to bypass hotlink protection
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/'
      }
    });

    if (!response.ok) {
      return new NextResponse("Failed to fetch media from CDN", { status: 500 });
    }

    // Determine content type
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Create a filename based on type
    const extension = contentType.includes('video') ? 'mp4' : 'jpg';
    const filename = `instagram_download_${Date.now()}.${extension}`;

    // Return the stream with proper headers for downloading
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error("Proxy API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
