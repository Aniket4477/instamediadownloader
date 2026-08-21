import { NextResponse } from 'next/server';

function extractShortcode(url) {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('instagram.com')) {
      return null;
    }
    
    // Match /p/SHORTCODE/, /reel/SHORTCODE/, /tv/SHORTCODE/, etc.
    const regex = /\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/;
    const match = parsedUrl.pathname.match(regex);
    
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const shortcode = extractShortcode(url);
    if (!shortcode) {
      return NextResponse.json({ error: "Invalid Instagram URL format" }, { status: 400 });
    }

    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    
    // Fetch with a browser-like User-Agent
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch media from Instagram" }, { status: 500 });
    }

    const html = await response.text();

    // Extract video URL
    const videoUrlMatch = html.match(/"video_url":"([^"]+)"/);
    let videoUrl = videoUrlMatch ? videoUrlMatch[1] : null;
    
    // Extract image/thumbnail URL
    const imageUrlMatch = html.match(/"display_url":"([^"]+)"/);
    let imageUrl = imageUrlMatch ? imageUrlMatch[1] : null;

    if (!videoUrl && !imageUrl) {
      return NextResponse.json({ error: "Could not find media in this post. It might be private or removed." }, { status: 404 });
    }

    // Unescape unicode sequences (e.g. \u0026 to &)
    if (videoUrl) {
      // JSON.parse handles unescaping unicode properly
      videoUrl = JSON.parse(`"${videoUrl}"`);
    }
    if (imageUrl) {
      imageUrl = JSON.parse(`"${imageUrl}"`);
    }

    const type = videoUrl ? 'video' : 'image';

    return NextResponse.json({
      type,
      videoUrl,
      imageUrl,
      thumbnail: imageUrl
    });

  } catch (error) {
    console.error("Download API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
