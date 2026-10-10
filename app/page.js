'use client';

import { useState, useRef } from 'react';

const TABS = [
  { id: 'auto', label: '⚡ Auto-Detect', placeholder: 'Paste any Instagram link or @username...' },
  { id: 'reel', label: 'Reel', placeholder: 'Paste Instagram Reel link...' },
  { id: 'video', label: 'Video', placeholder: 'Paste Instagram Video link...' },
  { id: 'post', label: 'Post', placeholder: 'Paste Instagram Post or Carousel link...' },
  { id: 'story', label: 'Story', placeholder: 'Paste public @username or Story URL...' },
];

const FAQS = [
  {
    q: 'Do I need an Instagram account?',
    a: 'No. InstaDown only downloads public media and never requires you to log into Instagram, register, or provide any credentials.',
  },
  {
    q: 'Can I download private posts?',
    a: 'No. InstaDown is built strictly for publicly available Instagram posts, Reels, and Stories. Private accounts and close friends stories cannot and will not be accessed.',
  },
  {
    q: 'Which Instagram content is supported?',
    a: 'We support public Reels, IGTV/feed video posts, single photo posts, multi-photo carousels, and active 24-hour public Stories.',
  },
  {
    q: 'Do Stories need to be currently active?',
    a: 'Yes. Instagram Stories are temporary and expire after 24 hours. Stories must be actively live on the public profile at the time of download.',
  },
  {
    q: 'Are my Instagram credentials required?',
    a: 'Never. You never need to enter your username, password, cookies, API keys, or session tokens.',
  },
  {
    q: 'Can I use InstaDown on mobile?',
    a: 'Yes! InstaDown is fully responsive and works smoothly on iOS (Safari/Chrome), Android (Chrome/Firefox), tablets, and desktops.',
  },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [media, setMedia] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [dlAll, setDlAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const inputRef = useRef(null);
  const resultRef = useRef(null);

  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setError(null);
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrl(text.trim());
          if (inputRef.current) inputRef.current.focus();
        }
      }
    } catch {
      // ignore
    }
  };

  const handleClear = () => {
    setUrl('');
    if (inputRef.current) inputRef.current.focus();
  };

  const handleFetch = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setMedia(null);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), tab: activeTab }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 504
            ? 'Request timed out on the server. Please try again.'
            : 'Unable to parse server response. Please try again.'
        );
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to fetch media');
      }

      setMedia(data);
      setTimeout(() => {
        if (resultRef.current) {
          resultRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    } catch (err) {
      setError(err.message || 'An error occurred while fetching the media');
      setTimeout(() => {
        if (resultRef.current) {
          resultRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    } finally {
      setLoading(false);
    }
  };

  const previewUrl = (src) => {
    if (!src || typeof src !== 'string') return '';
    const clean = src.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return '';
    return `/api/proxy?url=${encodeURIComponent(clean)}`;
  };

  const downloadUrl = (src) => {
    if (!src || typeof src !== 'string') return '';
    const clean = src.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return '';
    return `/api/proxy?url=${encodeURIComponent(clean)}&dl=1`;
  };

  const downloadAll = async (items) => {
    if (!items || items.length === 0) return;
    setDlAll(true);
    const isStory = media?.type === 'story';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const link = document.createElement('a');
      link.href = downloadUrl(item.url || item);
      const ext = item.type === 'video' ? 'mp4' : 'jpg';
      link.download = isStory ? `instagram_story_${i + 1}.${ext}` : `instagram_image_${i + 1}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((r) => setTimeout(r, 600));
    }
    setDlAll(false);
  };

  const handleCopyLink = () => {
    if (url) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const scrollToTop = (tabToSet) => {
    if (tabToSet) setActiveTab(tabToSet);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 350);
  };

  const isMultiItem = media && (media.type === 'carousel' || (media.images && media.images.length > 1));
  const isSingleStoryVideo = media && media.type === 'story' && media.images?.length === 1 && media.images[0].type === 'video';
  const isSingleStoryImage = media && media.type === 'story' && media.images?.length === 1 && media.images[0].type === 'image';

  const getItemButtonLabel = (item, idx) => {
    if (media?.type === 'story') return `Story ${idx + 1}`;
    if (item.type === 'video') return `Video ${idx + 1}`;
    return `Image ${idx + 1}`;
  };

  return (
    <>
      {/* ── Glass Navbar ── */}
      <header className="navbar">
        <div className="nav-container">
          <a href="#" className="nav-brand">
            <img src="/logo.png" alt="InstaDown Logo" className="nav-brand-img" />
            <span className="nav-brand-text">InstaDown</span>
          </a>

          <ul className="nav-links">
            <li><a href="#hero" className="nav-link">Home</a></li>
            <li><a href="#how-it-works" className="nav-link">How it works</a></li>
            <li><a href="#supported-media" className="nav-link">Supported media</a></li>
            <li><a href="#faq" className="nav-link">FAQ</a></li>
          </ul>

          <button onClick={() => scrollToTop()} className="nav-cta-btn" suppressHydrationWarning>
            Start Downloading
          </button>
        </div>
      </header>

      {/* ── Main Layout Wrapper ── */}
      <main className="main-wrap" suppressHydrationWarning>

        {/* ── 1. Hero Section ── */}
        <section className="hero-section" id="hero">
          <div className="hero-pill-badge">
            <span className="hero-pill-item">
              <span className="glowing-green-dot"></span>
              Fast
            </span>
            <span className="hero-pill-item">
              <span className="glowing-green-dot"></span>
              Public content
            </span>
            <span className="hero-pill-item">
              <span className="glowing-green-dot"></span>
              No login
            </span>
          </div>

          <h1 className="hero-title">
            Download Instagram<br />media effortlessly.
          </h1>

          <p className="hero-subtitle">
            Paste a public Instagram link and get your video, photo, Reel, or Story in<br />seconds.
          </p>

          {/* Filter Tabs Pill */}
          <div className="tab-pills-wrap" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`tab-pill ${activeTab === tab.id ? 'tab-pill-active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
                suppressHydrationWarning
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Hero Input Glass Card */}
          <div className="input-glass-card" id="download-input">
            <div className="input-card-title">Paste your Instagram link</div>
            <form onSubmit={handleFetch} suppressHydrationWarning>
              <div className="input-row">
                <span className="input-icon-left">
                  <LinkIcon />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={currentTab.placeholder}
                  required
                  className="url-input"
                  suppressHydrationWarning
                />
                <div className="input-action-buttons">
                  {url && (
                    <button type="button" onClick={handleClear} className="btn-inside-action btn-clear-inside" title="Clear input" suppressHydrationWarning>
                      Clear
                    </button>
                  )}
                  <button type="button" onClick={handlePaste} className="btn-inside-action btn-paste-inside" suppressHydrationWarning>
                    Paste
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-download-hero" id="fetch-btn" suppressHydrationWarning>
                {loading ? (
                  <>
                    <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Extracting Media...
                  </>
                ) : (
                  'Download'
                )}
              </button>
            </form>
            <div className="input-card-helper">
              Supports public Reels, Posts, Videos &amp; Stories
            </div>
          </div>

          {/* Checklist Bullets */}
          <div className="hero-checklist">
            <div className="hero-check-item">
              <span className="hero-check-dot"></span>
              <span>No Instagram login</span>
            </div>
            <div className="hero-check-item">
              <span className="hero-check-dot"></span>
              <span>Public content only</span>
            </div>
            <div className="hero-check-item">
              <span className="hero-check-dot"></span>
              <span>Fast processing</span>
            </div>
          </div>
        </section>

        {/* ── 2. Result State Section (Only appears when media or error is present) ── */}
        {(media || error) && (
          <section className="result-section" id="result-state" ref={resultRef}>
            <span className="section-tag">RESULT STATE</span>
            <h2 className="section-title">Your media is ready.</h2>
            <p className="section-subtitle">Reusable result card for video, image, carousel and Story downloads.</p>

            {/* Active Results Card */}
            {media && (
              <div className="result-card-wrap">
                {/* Single Reel / Video / Single Story Video */}
                {(media.type === 'video' || isSingleStoryVideo) && !isMultiItem && (
                  <div className="result-card-inner">
                    <div className="result-media-frame">
                      <video
                        src={previewUrl(media.videoUrl || media.images?.[0]?.url)}
                        controls
                        className="result-media-video"
                        poster={previewUrl(media.thumbnail || media.images?.[0]?.thumbnail)}
                        playsInline
                      />
                    </div>
                    <div className="result-info">
                      <div className="result-breadcrumb">
                        Instagram &gt; {media.type === 'story' ? 'Story' : 'Reel'}
                      </div>
                      <h3 className="result-media-title">{media.title || 'Media ready'}</h3>
                      <div className="result-meta-pill">
                        <span>1080 × 1920</span>
                        <span>•</span>
                        <span>MP4</span>
                        {media.username && (
                          <>
                            <span>•</span>
                            <span>@{media.username}</span>
                          </>
                        )}
                      </div>
                      <div className="result-actions">
                        <a
                          href={downloadUrl(media.videoUrl || media.images?.[0]?.url)}
                          className="btn-primary-gradient"
                          download={media.type === 'story' ? `instagram_story_${Date.now()}.mp4` : `instagram_video_${Date.now()}.mp4`}
                        >
                          <DownloadIcon /> {media.type === 'story' ? 'Download Story' : 'Download Video'}
                        </a>
                        <button type="button" onClick={handleCopyLink} className="btn-dark-action">
                          {copied ? '✓ Copied' : 'Copy Link'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Single Photo / Story Image */}
                {(media.type === 'image' || isSingleStoryImage) && !isMultiItem && (
                  <div className="result-card-inner">
                    <div className="result-media-frame">
                      <img
                        src={previewUrl(media.imageUrl || media.images?.[0]?.url)}
                        alt="Instagram media"
                        className="result-media-img"
                      />
                    </div>
                    <div className="result-info">
                      <div className="result-breadcrumb">
                        Instagram &gt; {media.type === 'story' ? 'Story' : 'Post'}
                      </div>
                      <h3 className="result-media-title">{media.title || 'Image ready'}</h3>
                      <div className="result-meta-pill">
                        <span>HD Resolution</span>
                        <span>•</span>
                        <span>JPG</span>
                        {media.username && (
                          <>
                            <span>•</span>
                            <span>@{media.username}</span>
                          </>
                        )}
                      </div>
                      <div className="result-actions">
                        <a
                          href={downloadUrl(media.imageUrl || media.images?.[0]?.url)}
                          className="btn-primary-gradient"
                          download={media.type === 'story' ? `instagram_story_${Date.now()}.jpg` : `instagram_image_${Date.now()}.jpg`}
                        >
                          <DownloadIcon /> {media.type === 'story' ? 'Download Story' : 'Download Image'}
                        </a>
                        <button type="button" onClick={handleCopyLink} className="btn-dark-action">
                          {copied ? '✓ Copied' : 'Copy Link'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Multi-Item Carousel / Multiple Stories */}
                {isMultiItem && (
                  <div className="multi-grid-wrap">
                    <div className="multi-grid-header">
                      <div className="result-breadcrumb">
                        Instagram &gt; {media.type === 'story' ? `${media.count} Active Stories` : `${media.count} Carousel Images`}
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadAll(media.images)}
                        disabled={dlAll}
                        className="btn-primary-gradient"
                      >
                        {dlAll ? 'Downloading All...' : `Download All (${media.count})`}
                      </button>
                    </div>

                    <div className="multi-grid-cards">
                      {media.images.map((item, idx) => (
                        <div key={idx} className="multi-grid-card">
                          <div className="multi-grid-thumb">
                            {item.type === 'video' ? (
                              <video
                                src={previewUrl(item.url)}
                                poster={item.thumbnail ? previewUrl(item.thumbnail) : undefined}
                                controls
                                playsInline
                              />
                            ) : (
                              <img
                                src={previewUrl(item.url)}
                                alt={`Item ${idx + 1}`}
                                onClick={() => setSelectedPhoto(previewUrl(item.url))}
                                style={{ cursor: 'pointer' }}
                              />
                            )}
                            <span className="multi-grid-badge">{idx + 1}/{media.count}</span>
                          </div>
                          <a
                            href={downloadUrl(item.url)}
                            download={media.type === 'story' ? `instagram_story_${idx + 1}.${item.type === 'video' ? 'mp4' : 'jpg'}` : `instagram_image_${idx + 1}.${item.type === 'video' ? 'mp4' : 'jpg'}`}
                            className="btn-dark-action"
                            style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '0.5rem' }}
                          >
                            <DownloadIcon /> {getItemButtonLabel(item, idx)}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error Message Display */}
            {error && (
              <div className="result-card-wrap" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                <div style={{ color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                  <span style={{ fontWeight: 600 }}>{error}</span>
                </div>
                <button onClick={() => scrollToTop()} className="btn-dark-action">
                  Try again
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── 3. How It Works (Three Steps) ── */}
        <section className="how-it-works-section" id="how-it-works">
          <span className="section-tag">HOW IT WORKS</span>
          <h2 className="section-title">Three steps. That&apos;s it.</h2>
          <p className="section-subtitle">A focused flow from public Instagram link to download.</p>

          <div className="three-steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3 className="step-title">Paste</h3>
              <p className="step-desc">Paste your public Instagram link.</p>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <h3 className="step-title">Process</h3>
              <p className="step-desc">We find the publicly available media.</p>
            </div>
            <div className="step-card">
              <div className="step-number">03</div>
              <h3 className="step-title">Download</h3>
              <p className="step-desc">Download your media instantly.</p>
            </div>
          </div>
        </section>

        {/* ── 4. Simple By Design (Features) ── */}
        <section className="features-section" id="features">
          <span className="section-tag">KEY BENEFITS</span>
          <h2 className="section-title">Simple by design.</h2>
          <p className="section-subtitle">Everything important is visible, predictable, and easy to use.</p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-bullet">✦</div>
              <h3 className="feature-title">No Instagram login</h3>
              <p className="feature-desc">Never asks for your Instagram credentials or personal account access.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-bullet">✦</div>
              <h3 className="feature-title">Public content only</h3>
              <p className="feature-desc">Focuses purely on readily accessible public media without private bypasses.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-bullet">✦</div>
              <h3 className="feature-title">Fast processing</h3>
              <p className="feature-desc">High-speed parallel stream extraction without unnecessary waiting.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-bullet">✦</div>
              <h3 className="feature-title">Mobile friendly</h3>
              <p className="feature-desc">Optimized responsive experience on iOS, Android, tablets, and desktop.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-bullet">✦</div>
              <h3 className="feature-title">Privacy focused</h3>
              <p className="feature-desc">No logs, tracking cookies, or user history recorded on our servers.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-bullet">✦</div>
              <h3 className="feature-title">Simple interface</h3>
              <p className="feature-desc">One clean input box, one-click immediate download.</p>
            </div>
          </div>
        </section>

        {/* ── 5. Supported Media ── */}
        <section className="supported-section" id="supported-media">
          <span className="section-tag">SUPPORTED MEDIA</span>
          <h2 className="section-title">Everything you need in one place.</h2>
          <p className="section-subtitle">One interface for Reels, videos, posts and public Stories.</p>

          <div className="supported-grid">
            <div className="supported-card" onClick={() => scrollToTop('reel')} style={{ cursor: 'pointer' }}>
              <div>
                <div className="supported-icon">▶</div>
                <h3 className="supported-title">REELS</h3>
                <p className="supported-desc">Download public Instagram Reels.</p>
              </div>
              <div className="supported-arrow">↗</div>
            </div>

            <div className="supported-card" onClick={() => scrollToTop('video')} style={{ cursor: 'pointer' }}>
              <div>
                <div className="supported-icon">◉</div>
                <h3 className="supported-title">VIDEO POSTS</h3>
                <p className="supported-desc">Save public Instagram video posts.</p>
              </div>
              <div className="supported-arrow">↗</div>
            </div>

            <div className="supported-card" onClick={() => scrollToTop('post')} style={{ cursor: 'pointer' }}>
              <div>
                <div className="supported-icon">▣</div>
                <h3 className="supported-title">PHOTO POSTS</h3>
                <p className="supported-desc">Download images and carousel posts.</p>
              </div>
              <div className="supported-arrow">↗</div>
            </div>

            <div className="supported-card" onClick={() => scrollToTop('story')} style={{ cursor: 'pointer' }}>
              <div>
                <div className="supported-icon">▢</div>
                <h3 className="supported-title">STORIES</h3>
                <p className="supported-desc">Download currently available public Stories.</p>
              </div>
              <div className="supported-arrow">↗</div>
            </div>
          </div>
        </section>

        {/* ── 6. Interaction States ── */}
        <section className="feedback-section" id="interaction-states">
          <span className="section-tag">INTERACTION STATES</span>
          <h2 className="section-title">Clear feedback at every step.</h2>
          <p className="section-subtitle">Loading and error states stay understandable.</p>

          <div className="feedback-grid">
            <div className="feedback-card">
              <div className="feedback-header">
                <span className="feedback-dot yellow"></span>
                <span>Fetching your media...</span>
              </div>
              <p className="feedback-desc">
                ✓ Link validation &nbsp;•&nbsp; Finding media &nbsp;•&nbsp; Preparing download
              </p>
              <button onClick={() => scrollToTop()} className="feedback-btn">
                Try again
              </button>
            </div>

            <div className="feedback-card">
              <div className="feedback-header">
                <span className="feedback-dot red"></span>
                <span>Invalid Instagram link</span>
              </div>
              <p className="feedback-desc">
                Please paste a valid public Instagram link or username.
              </p>
              <button onClick={() => scrollToTop()} className="feedback-btn">
                Try again
              </button>
            </div>

            <div className="feedback-card">
              <div className="feedback-header">
                <span className="feedback-dot blue"></span>
                <span>No active Story found</span>
              </div>
              <p className="feedback-desc">
                This public account currently has no active 24-hour Stories.
              </p>
              <button onClick={() => scrollToTop()} className="feedback-btn">
                Try again
              </button>
            </div>
          </div>
        </section>

        {/* ── 7. FAQ Accordion ── */}
        <section className="faq-section" id="faq">
          <span className="section-tag">FAQ</span>
          <h2 className="section-title">Questions, answered.</h2>
          <p className="section-subtitle">Keep the most important expectations clear.</p>

          <div className="faq-list">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="faq-item">
                  <button
                    type="button"
                    className="faq-question"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                  >
                    <span>{faq.q}</span>
                    <span className="faq-icon" style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}>
                      +
                    </span>
                  </button>
                  {isOpen && (
                    <div className="faq-answer">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-left">
            <div>Email: <a href="mailto:aniketpat@gmail.com">aniketpat@gmail.com</a></div>
            <div>GitHub: <a href="https://github.com/Aniket4477/instamediadownloader" target="_blank" rel="noopener noreferrer">https://github.com/Aniket4477/instamediadownloader</a></div>
            <div style={{ marginTop: '0.4rem' }}>Thanks for checking out! Crafted for speed.</div>
          </div>

          <div className="footer-center">
            <div className="footer-logo-box">
              <img src="/logo2.png" alt="InstaDown Logo" className="footer-brand-img" />
            </div>
            <div className="footer-brand-title">InstaDown</div>
          </div>

          <div className="footer-right">
            <div className="footer-nav">
              <a href="#hero">Home</a>
              <a href="#how-it-works">How it works</a>
              <a href="#faq">FAQ</a>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-copy">
              © 2026 InstaDown. All rights reserved.<br />
              InstaDown is an independent tool and is not affiliated with Instagram.
            </div>
          </div>
        </div>
      </footer>

      {/* ── Photo Lightbox Modal ── */}
      {selectedPhoto && (
        <div className="modal-backdrop" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto} alt="Full preview" className="modal-img" />
            <button className="modal-close" onClick={() => setSelectedPhoto(null)}>✕</button>
            <a
              href={selectedPhoto.replace('dl=0', 'dl=1') + '&dl=1'}
              download
              className="btn-primary-gradient"
              style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
            >
              <DownloadIcon /> Download Media
            </a>
          </div>
        </div>
      )}
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

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
