'use client';
import { useState } from 'react';

const TABS = [
  { id: 'reel', label: '🎬 Reel', placeholder: 'https://www.instagram.com/reel/...' },
  { id: 'post', label: '🖼️ Post', placeholder: 'https://www.instagram.com/p/...' },
  { id: 'story', label: '📖 Story', placeholder: 'https://www.instagram.com/stories/...' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState('reel');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState(null);
  const [error, setError] = useState('');

  const currentTab = TABS.find((t) => t.id === activeTab);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setUrl('');
    setMedia(null);
    setError('');
  };

  const handleFetch = async (e) => {
    e.preventDefault();
    if (activeTab === 'story') {
      setError('Story downloading requires authentication and is not supported as a public service. Use yt-dlp with --cookies on your own machine for personal use.');
      return;
    }
    setLoading(true);
    setError('');
    setMedia(null);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch media');
      setMedia(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!media) return;
    const downloadUrl = media.type === 'video' ? media.videoUrl : media.imageUrl;
    window.location.href = `/api/proxy?url=${encodeURIComponent(downloadUrl)}`;
  };

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

        {/* Tab Switcher */}
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
          <div className="input-wrap">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={currentTab.placeholder}
              required
              className="input"
              disabled={activeTab === 'story'}
            />
          </div>

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
                <>
                  <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Extracting...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  Fetch {currentTab.label.split(' ')[1]}
                </>
              )}
            </button>
          )}
        </form>

        {/* Error */}
        {error && (
          <div className="error-message" role="alert">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Preview */}
        {media && (
          <div className="media-preview">
            <div className="media-badge">
              {media.type === 'video' ? '🎬 Video ready' : '🖼️ Image ready'}
            </div>

            {media.type === 'video' ? (
              <video
                src={media.videoUrl}
                controls
                className="media-element"
                poster={media.thumbnail}
              />
            ) : (
              <img
                src={media.imageUrl}
                alt="Instagram media"
                className="media-element"
              />
            )}

            {media.title && <p className="media-title">{media.title}</p>}

            <button onClick={handleDownload} className="btn btn-success" id="download-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download {media.type === 'video' ? 'Video' : 'Image'}
            </button>
          </div>
        )}
      </div>

      <p className="footer-text">
        Not affiliated with Instagram · Personal use only · Respect copyright & ToS
      </p>
    </>
  );
}
