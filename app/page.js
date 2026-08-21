'use client';
import { useState } from 'react';

const TABS = [
  { id: 'auto',  label: '⚡ Auto-Detect', placeholder: 'Paste any Instagram Reel, Video, or Post link...' },
  { id: 'reel',  label: '🎬 Reel / Video', placeholder: 'https://www.instagram.com/reel/... or /tv/...' },
  { id: 'post',  label: '🖼️ Post / Carousel', placeholder: 'https://www.instagram.com/p/...' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState('auto');
  const [url, setUrl]             = useState('');
  const [loading, setLoading]     = useState(false);
  const [media, setMedia]         = useState(null);
  const [error, setError]         = useState('');
  const [dlAll, setDlAll]         = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const currentTab = TABS.find((t) => t.id === activeTab);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setUrl('');
    setMedia(null);
    setError('');
    setSelectedPhoto(null);
  };

  const handleFetch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMedia(null);
    setSelectedPhoto(null);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch Instagram media');
      }

      setMedia(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Inline preview proxy (bypasses Instagram CDN hotlink block)
  const previewUrl = (src) => {
    if (!src) return '';
    return `/api/proxy?url=${encodeURIComponent(src)}`;
  };

  // Download proxy with attachment header
  const downloadUrl = (src) => {
    if (!src) return '';
    return `/api/proxy?url=${encodeURIComponent(src)}&dl=1`;
  };

  const downloadAll = async (images) => {
    setDlAll(true);
    for (let i = 0; i < images.length; i++) {
      const a = document.createElement('a');
      a.href = downloadUrl(images[i].url);
      a.download = `instagram_photo_${i + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      await new Promise((r) => setTimeout(r, 600));
    }
    setDlAll(false);
  };

  const isCarousel = media && (media.type === 'carousel' || (media.images && media.images.length > 1));

  return (
    <>
      <div className="container">
        {/* Header */}
        <div className="header">
          <div className="logo">
            <span className="logo-icon">✨</span>
            <h1 className="title">InstaDown</h1>
          </div>
          <p className="subtitle">Self-hosted Instagram Reels, Videos &amp; Photo Downloader</p>
          <div className="badge-features">
            <span>⚡ Direct HD</span>
            <span>🖼️ Live Previews</span>
            <span>🔒 100% Free &amp; Private</span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleFetch} className="form">
          <div className="input-wrap">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={currentTab.placeholder}
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
                Extracting Media...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Fetch Media
              </>
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="error-message" role="alert">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Results Display ────────────────────────────────────── */}
        {media && (
          <div className="media-preview">
            
            {/* ── 1. Video / Reel ── */}
            {media.type === 'video' && (
              <>
                <div className="media-badge">🎬 HD Video Ready</div>
                <div className="video-wrap">
                  <video
                    src={previewUrl(media.videoUrl)}
                    controls
                    className="media-element"
                    poster={previewUrl(media.thumbnail)}
                    playsInline
                  />
                </div>
                {media.title && <p className="media-title">{media.title}</p>}
                {media.author && <p className="media-author">@{media.author}</p>}
                <a
                  href={downloadUrl(media.videoUrl)}
                  className="btn btn-success btn-download-main"
                  id="download-btn"
                  download={`instagram_video_${Date.now()}.mp4`}
                >
                  <DownloadIcon /> Download MP4 Video
                </a>
              </>
            )}

            {/* ── 2. Single Photo Post ── */}
            {media.type === 'image' && !isCarousel && (
              <>
                <div className="media-badge">🖼️ HD Photo Ready</div>
                <div className="single-img-wrap">
                  <img
                    src={previewUrl(media.imageUrl)}
                    alt="Instagram post"
                    className="media-element"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                  />
                </div>
                {media.title && <p className="media-title">{media.title}</p>}
                {media.author && <p className="media-author">@{media.author}</p>}
                <a
                  href={downloadUrl(media.imageUrl)}
                  className="btn btn-success btn-download-main"
                  id="download-btn"
                  download={`instagram_photo_${Date.now()}.jpg`}
                >
                  <DownloadIcon /> Download HD Photo
                </a>
              </>
            )}

            {/* ── 3. Multi-Photo Carousel Post ── */}
            {isCarousel && (
              <>
                <div className="carousel-header">
                  <div className="media-badge">🗂️ {media.count} Photos Found</div>
                  <button
                    type="button"
                    onClick={() => downloadAll(media.images)}
                    disabled={dlAll}
                    className="btn btn-success btn-download-all"
                    id="download-all-btn"
                  >
                    {dlAll ? (
                      <>
                        <svg className="spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Downloading All...
                      </>
                    ) : (
                      <>
                        <DownloadIcon /> Download All ({media.count})
                      </>
                    )}
                  </button>
                </div>

                <div className="carousel-grid">
                  {media.images.map((img, idx) => (
                    <div key={idx} className="carousel-item">
                      <div
                        className="carousel-img-wrap"
                        onClick={() => setSelectedPhoto(previewUrl(img.url))}
                        title="Click to view full preview"
                      >
                        <img
                          src={previewUrl(img.url)}
                          alt={`Photo ${idx + 1}`}
                          className="carousel-img"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                        />
                        <div className="carousel-overlay">
                          <span className="photo-num">{idx + 1} / {media.count}</span>
                        </div>
                      </div>
                      <a
                        href={downloadUrl(img.url)}
                        download={`instagram_photo_${idx + 1}.jpg`}
                        className="btn btn-item-dl"
                        id={`download-img-${idx}`}
                      >
                        <DownloadIcon /> Photo {idx + 1}
                      </a>
                    </div>
                  ))}
                </div>

                {media.title && <p className="media-title">{media.title}</p>}
                {media.author && <p className="media-author">@{media.author}</p>}
              </>
            )}

          </div>
        )}
      </div>

      {/* ── Photo Lightbox Modal ── */}
      {selectedPhoto && (
        <div className="modal-backdrop" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto} alt="Full preview" className="modal-img" />
            <button className="modal-close" onClick={() => setSelectedPhoto(null)}>✕</button>
            <a href={selectedPhoto.replace('dl=0', 'dl=1') + '&dl=1'} download className="btn btn-success modal-dl-btn">
              <DownloadIcon /> Download Photo
            </a>
          </div>
        </div>
      )}

      <p className="footer-text">
        Self-hosted open-source downloader · Supports Reels, Videos, Photos &amp; Carousels · For personal use only
      </p>
    </>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
