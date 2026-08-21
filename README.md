# InstaDown — Instagram Media Downloader

A **Next.js** web app to download Instagram Reels, Videos, and Photos.

## Features
- 🎬 Download **Reels & Videos**
- 🖼️ Download **Images & Carousels**
- ⚡ Fast extraction via Instagram's embed endpoint
- 🌙 Beautiful dark-mode UI
- 🚦 Built-in rate limiting support (Upstash Redis)

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Deployment:** Vercel

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

1. Push to GitHub
2. Import repo on [vercel.com](https://vercel.com)
3. Add any env vars (`.env.local`)
4. Deploy 🚀

## Environment Variables

Create a `.env.local` file in the root:

```
# Optional: Only if using a paid RapidAPI extractor (Option B)
RAPIDAPI_KEY=your_key_here

# Optional: Only if adding Upstash rate limiting
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Disclaimer
Not affiliated with Instagram. Respect copyright and Instagram's Terms of Service. For personal use only.
