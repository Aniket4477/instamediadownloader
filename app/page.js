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
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch media');
      }
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
        <h1 className="title">InstaDown</h1>
        <p className="subtitle">Download Reels, Videos, and Photos instantly.</p>
        
        <form onSubmit={handleFetch} className="form">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Instagram link here..."
            required
            className="input"
          />
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation: 'spin 1s linear infinite'}}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Extracting...
              </>
            ) : (
              'Fetch Media'
            )}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}

        {media && (
          <div className="media-preview">
            {media.type === 'video' ? (
              <video src={media.videoUrl} controls className="media-element" poster={media.thumbnail} />
            ) : (
              <img src={media.imageUrl} alt="Extracted Instagram Media" className="media-element" />
            )}
            <button onClick={handleDownload} className="btn btn-success">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download {media.type === 'video' ? 'Video' : 'Image'}
            </button>
          </div>
        )}
      </div>
      <p className="footer-text">
        Not affiliated with Instagram. Respect copyright and Terms of Service. For personal use only.
      </p>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </>
  );
}
