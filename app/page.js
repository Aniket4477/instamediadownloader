'use client';
import { useState } from 'react';

const TABS = [
  { id: 'reel',  label: '🎬 Reel',  placeholder: 'https://www.instagram.com/reel/...' },
  { id: 'post',  label: '🖼️ Post',  placeholder: 'https://www.instagram.com/p/...'    },
  { id: 'story', label: '📖 Story', placeholder: 'https://www.instagram.com/stories/...' },
];

export default function Home() {
  const [activeTab, setActiveTab]   = useState('reel');
  const [url, setUrl]               = useState('');
  const [loading, setLoading]       = useState(false);
  const [media, setMedia]           = useState(null);
  const [error, setError]           = useState('');
  const [dlAll, setDlAll]           = useState(false);

  const currentTab = TABS.find((t) => t.id === activeTab);

  const handleTabChange = (id) => {
    setActiveTab(id); setUrl(''); setMedia(null); setError('');
  };

  const handleFetch = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMedia(null);
    try {
      const res  = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch media');
      setMedia(data);
    } catch (err) { setError(err.message); }
    finally       { setLoading(false); }
  };

  const proxyUrl = (src) => `/api/proxy?url=${encodeURIComponent(src)}`;

  const downloadOne = (src, idx) => {
    const a = document.createElement('a');
    a.href = proxyUrl(src);
    a.download = `instagram_${idx + 1}.jpg`;
    a.click();
  };

  const downloadAll = async (images) => {
    setDlAll(true);
    for (let i = 0; i < images.length; i++) {
      downloadOne(images[i].url, i);
      await new Promise((r) => setTimeout(r, 800)); // slight delay between downloads
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
            <span className="logo-icon">⬇</span>
            <h1 className="title">InstaDown</h1>
          </div>
          <p className="subtitle">Download Instagram media instantly</p>
        </div>

        {/* Tabs */}
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

        {/* Form */}
        <form onSubmit={handleFetch} className="form">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={currentTab.placeholder}
            required
            disabled={activeTab === 'story'}
            className="input"
          />

          {activeTab === 'story' ? (
            <div className="story-notice">
              <span className="notice-icon">🔒</span>
              <div>
                <strong>Stories require authentication</strong>
                <p>Instagram Stories are protected. Use <code>yt-dlp --cookies</code> on your own machine for personal use.</p>
              </div>
            </div>
          ) : (
            <button type="submit" disabled={loading} className="btn btn-primary" id="fetch-btn">
              {loading ? (
                <><svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Extracting...</>
              ) : (
                <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Fetch {currentTab.label.split(' ')[1]}</>
              )}
            </button>
          )}
        </form>

        {/* Error */}
        {error && <div className="error-message" role="alert"><span>⚠️</span> {error}</div>}

        {/* ── Results ──────────────────────────────────────────── */}
        {media && (
          <div className="media-preview">

            {/* ── Video / Reel ── */}
            {media.type === 'video' && (
              <>
                <div className="media-badge">🎬 Video ready</div>
                <video src={media.videoUrl} controls className="media-element" poster={media.thumbnail} />
                {media.title && <p className="media-title">{media.title}</p>}
                <button onClick={() => { window.location.href = proxyUrl(media.videoUrl); }} className="btn btn-success" id="download-btn">
                  <DownloadIcon /> Download Video
                </button>
              </>
            )}

            {/* ── Single Image ── */}
            {media.type === 'image' && !isCarousel && (
              <>
                <div className="media-badge">🖼️ Image ready</div>
                <img src={media.imageUrl} alt="Instagram media" className="media-element" />
                {media.title && <p className="media-title">{media.title}</p>}
                <button onClick={() => downloadOne(media.imageUrl, 0)} className="btn btn-success" id="download-btn">
                  <DownloadIcon /> Download Image
                </button>
              </>
            )}

            {/* ── Carousel ── */}
            {isCarousel && (
              <>
                <div className="carousel-header">
                  <div className="media-badge">🗂️ {media.count} Photos</div>
                  <button
                    onClick={() => downloadAll(media.images)}
                    disabled={dlAll}
                    className="btn btn-success btn-download-all"
                    id="download-all-btn"
                  >
                    {dlAll
                      ? <><svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Downloading...</>
                      : <><DownloadIcon /> Download All ({media.count})</>
                    }
                  </button>
                </div>

                <div className="carousel-grid">
                  {media.images.map((img, idx) => (
                    <div key={idx} className="carousel-item">
                      <div className="carousel-img-wrap">
                        <img src={img.url} alt={`Photo ${idx + 1}`} className="carousel-img" loading="lazy" />
                        <div className="carousel-overlay">
                          <span className="photo-num">{idx + 1} / {media.count}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadOne(img.url, idx)}
                        className="btn btn-item-dl"
                        id={`download-img-${idx}`}
                      >
                        <DownloadIcon /> Photo {idx + 1}
                      </button>
                    </div>
                  ))}
                </div>

                {media.author && <p className="media-title">by @{media.author}</p>}
              </>
            )}
          </div>
        )}
      </div>

      <p className="footer-text">
        Not affiliated with Instagram · Personal use only · Respect copyright &amp; ToS
      </p>
    </>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
