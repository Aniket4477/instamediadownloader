'use client';
import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMedia(null);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract video');
      }

      setMedia(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const proxyUrl = (src) => `/api/proxy?url=${encodeURIComponent(src)}`;

  return (
    <>
      <div className="container">
        {/* Header */}
        <div className="header">
          <div className="logo">
            <span className="logo-icon">🎬</span>
            <h1 className="title">ReelDown</h1>
          </div>
          <p className="subtitle">Self-hosted Instagram Reels & Video Downloader</p>
          <div className="badge-features">
            <span>⚡ Direct MP4</span>
            <span>🔒 No Login</span>
            <span>🚫 No API Keys</span>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleFetch} className="form">
          <div className="input-wrap">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste Instagram Reel or Video URL (e.g. /reel/ or /p/)..."
              required
              className="input"
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" id="fetch-btn">
            {loading ? (
              <>
                <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Extracting Video...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Download Reel / Video
              </>
            )}
          </button>
        </form>

        {/* Error Notification */}
        {error && (
          <div className="error-message" role="alert">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Video Preview & Download Section */}
        {media && media.videoUrl && (
          <div className="media-preview">
            <div className="media-badge">🎬 HD Video Ready</div>

            <div className="video-wrap">
              <video
                src={media.videoUrl}
                controls
                className="media-element"
                poster={media.thumbnail}
                playsInline
              />
            </div>

            {media.title && <p className="media-title">{media.title}</p>}
            {media.author && <p className="media-author">Creator: @{media.author}</p>}

            <a
              href={proxyUrl(media.videoUrl)}
              className="btn btn-success btn-download-main"
              id="download-btn"
              download="instagram_reel.mp4"
            >
              <DownloadIcon />
              Download MP4 Video
            </a>
          </div>
        )}
      </div>

      <p className="footer-text">
        Self-hosted open-source downloader · Works with public Instagram Reels & Videos · For personal use only
      </p>
    </>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
