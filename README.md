# ✨ InstaDown — Instagram Media Downloader

A modern, fast, and self-hosted **Next.js** web application to download public Instagram **Reels, Videos, Single Photos, Multi-Photo Carousels, and Stories**.

100% Free · No API Keys · No Instagram Logins · No Subscriptions · Self-Hosted

---

## 🚀 Key Features

- 🎬 **Reels & Video Posts**: Instant 1080p HD video download powered by self-hosted `yt-dlp`.
- 🖼️ **Single Photos & Carousels**: Extracts all full-resolution images from multi-photo carousel posts with sequential **"Download All"** support.
- 📖 **Public Stories (Single & Multi-Story Grid)**:
  - Supports both exact **Story URLs** and public **@usernames**.
  - Automatically extracts and displays **ALL active public stories** from an account.
  - Interactive video playback with custom thumbnail posters and one-click download buttons.
- ⚡ **Direct Stream Proxy (`/api/proxy`)**:
  - Automatically unwraps direct Instagram CDN media URLs.
  - Fixes cross-origin restrictions, enabling crisp previews and downloads with custom filenames.
- 🌙 **Modern Glassmorphism UI**:
  - 4 specialized media tabs (`Auto-Detect`, `Reel / Video`, `Post / Carousel`, `Story`).
  - Dark-mode interface, responsive carousel grids, and photo lightbox modal.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React, Vanilla CSS | Glassmorphism UI, video player, carousel grid, lightbox |
| **Reels / Videos** | Local `yt-dlp` Engine | High-speed direct MP4 extraction |
| **Carousels / Photos** | Public oEmbed + Flat-playlist Sub-shortcodes | Multi-photo carousel extraction |
| **Stories Engine** | Headless Chrome (`puppeteer-core`) | Real-time active public multi-story scraper & stream extractor |
| **Proxy Gateway** | Next.js Edge / Node API Route (`/api/proxy`) | Instagram CDN streaming, attachment downloads, and CORS handling |

---

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- Google Chrome installed on your machine (for headless story extraction)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Aniket4477/instamediadownloader.git
   cd instamediadownloader
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🎯 How to Use

1. **Reels / Videos**:
   - Switch to the **🎬 Reel / Video** tab.
   - Paste a public Reel URL (e.g. `https://www.instagram.com/reel/DQEh5ZvDyL_/`).
   - Click **Fetch Media** to play inline and download the MP4.

2. **Photos & Carousels**:
   - Switch to the **🖼️ Post / Carousel** tab.
   - Paste a single photo or multi-photo post link (e.g. `https://www.instagram.com/p/DbpYI8gGOJI/`).
   - Download individual images (`Image 1`, `Image 2`) or click **"Download All"** for the complete set.

3. **Stories**:
   - Switch to the **📖 Story** tab.
   - Enter a public handle (e.g. `@harsh.aniketkumar` or `harsh.aniketkumar`) or a direct Story URL.
   - All active stories published within the last 24 hours will load side-by-side in the story grid.

---

## 📁 Project Structure

```text
├── app/
│   ├── api/
│   │   ├── download/
│   │   │   ├── route.js            # Unified media router (Reels, Posts, Carousels, Stories)
│   │   │   └── storyExtractor.js   # Automated headless Chrome multi-story extractor
│   │   └── proxy/
│   │       └── route.js            # Direct Instagram CDN stream proxy with auto-unwrapping
│   ├── globals.css                 # Dark-mode glassmorphic styling & responsive grid
│   ├── layout.js                   # Root layout with SEO meta tags
│   └── page.js                     # Interactive 4-tab UI with video player and grid
├── bin/
│   └── yt-dlp.exe                  # Self-hosted yt-dlp binary
├── instagram-story-api/            # Standalone multi-provider Story API service
├── next.config.mjs                 # Next.js configuration
├── package.json                    # Project dependencies and scripts
└── README.md                       # Project documentation
```

---

## ⚖️ Disclaimer

This tool is designed for educational and personal archival purposes only. It is strictly limited to publicly accessible content and does not bypass any access controls or private account settings. Not affiliated with, endorsed by, or associated with Instagram or Meta Platforms, Inc.
