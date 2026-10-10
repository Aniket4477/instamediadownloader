# InstaDown - Instagram Media Downloader

A modern, fast, and self-hosted web application for downloading publicly available Instagram media including Reels, Videos, Photos, Multi-Photo Carousels, and Stories.

---

## 📌 What is This Project?

**InstaDown** provides an interface to view and download public Instagram media in original high quality without requiring Instagram account credentials, session cookies, or subscriptions.

---

## ⚙️ How It Works

1. **Input Submission**: The user submits a public Instagram URL (Post, Reel, Story) or a public username handle.
2. **Server-Side Extraction**:
   - The server validates the format and enforces strict SSRF and domain checks.
   - A multi-tier extraction pipeline resolves the direct high-resolution media CDN streams.
   - For multi-item carousels and active story reels, all individual media items are enumerated with thumbnails and direct links.
3. **Secure Streaming & Download**:
   - The media is routed through a streaming proxy (`/api/proxy`) that attaches proper MIME headers and content dispositions for seamless browser downloading.
   - Rate limiting, strict CORS, and Content Security Policies prevent abuse.

---

## 🛠️ Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | Next.js 16 (App Router) | Serverless API routes and server components |
| **UI Library** | React 18 | Interactive tabs, modal lightboxes, media player |
| **Styling** | Vanilla CSS | Custom responsive glassmorphism design system |
| **Bundler** | Turbopack | Fast development and optimized production builds |
| **Extraction Engine** | REST Pipelines & Headless Chromium | Multi-tier failover media extractors |
| **Security Layer** | Custom Security Middleware | SSRF mitigation, IP rate limiting, strict CSP headers |

---

## 📂 Project Structure

```text
├── app/
│   ├── api/
│   │   ├── download/
│   │   │   ├── route.js          # Unified media extraction endpoint
│   │   │   └── storyExtractor.js # Multi-tier Instagram story extraction pipeline
│   │   ├── lib/
│   │   │   ├── rateLimit.js      # Server-side sliding-window rate limiter
│   │   │   └── security.js       # SSRF validation, allowed CDN domains, CORS
│   │   └── proxy/
│   │       └── route.js          # Secure media streaming and download gateway
│   ├── globals.css               # Design system tokens and styling
│   ├── layout.js                 # Root HTML layout and metadata
│   └── page.js                   # Client application interface
├── public/                       # Static public assets (logos, icons)
├── scripts/                      # Build-time helper scripts
├── next.config.mjs               # Next.js build configuration & security headers
├── package.json                  # Dependencies and scripts
└── README.md                     # Project documentation
```

---

## 🎨 Design System

### 🔤 Typography & Fonts
- **Primary Font**: `Plus Jakarta Sans` (Weights: 400, 500, 600, 700, 800)
- **Secondary Font**: `Inter` (Weights: 400, 500, 600, 700)
- **Fallback**: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### 🎨 Color Palette
- **Background**:
  - Base Dark: `#07080d`
  - Subtle Surface: `#0b0d14`
- **Cards & Glassmorphism**:
  - Card Fill: `rgba(16, 18, 27, 0.70)`
  - Card Hover: `rgba(22, 25, 38, 0.85)`
  - Border: `rgba(255, 255, 255, 0.08)`
  - Border Hover: `rgba(255, 255, 255, 0.16)`
- **Accents & Gradients**:
  - Primary Gradient: `linear-gradient(135deg, #e11d74 0%, #9333ea 100%)`
  - Hover Gradient: `linear-gradient(135deg, #f43f8e 0%, #a855f7 100%)`
  - Accent Pink: `#e11d74`
  - Accent Purple: `#9333ea`
  - Tag / Highlight Purple: `#c084fc`
- **Text**:
  - Primary: `#f8fafc`
  - Muted: `#94a3b8`
  - Dim: `#64748b`

---

## ⚖️ Disclaimer

This project is for educational and personal archival purposes only. It interacts strictly with publicly available web data and does not bypass private account restrictions or authentication barriers. Not affiliated with, endorsed by, or sponsored by Instagram or Meta Platforms, Inc.
