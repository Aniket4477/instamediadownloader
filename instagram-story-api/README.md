# Instagram Public Story Downloader API

A self-hosted, modular Node.js / Express API designed to fetch **public** Instagram Stories without requiring Instagram logins, passwords, cookies, or paid API subscriptions.

---

## 🎯 Architecture

```
Frontend / Client
      │
      │ GET /api/instagram/story/:username
      ▼
Node.js Express API (Port 4000)
      │
      ├── Input Validation (validates 1-30 char username format)
      ├── Rate Limiting (prevents abuse)
      │
      ▼
Story Provider Layer (Modular Abstraction)
      ├── FabulaProvider (Connects to StoriesIG upstream)
      └── MockProvider (Deterministic testing & offline development)
      │
      ▼
Normalized Public Stories JSON Response
```

---

## 📡 API Endpoints

### 1. Fetch Public Stories
**`GET /api/instagram/story/:username`**

#### Success Response (Active Stories):
```json
{
  "success": true,
  "username": "instagram",
  "isPublic": true,
  "stories": [
    {
      "type": "video",
      "url": "https://instagram.fdbd1-3.fna.fbcdn.net/.../story.mp4",
      "thumbnail": "https://instagram.fdbd1-3.fna.fbcdn.net/.../thumb.jpg",
      "timestamp": 1785900000
    },
    {
      "type": "image",
      "url": "https://instagram.fdbd1-3.fna.fbcdn.net/.../story.jpg",
      "timestamp": 1785900500
    }
  ]
}
```

#### Success Response (No Active Stories):
```json
{
  "success": true,
  "username": "example",
  "isPublic": true,
  "stories": []
}
```

#### Error Response: Private Account (403):
```json
{
  "success": false,
  "error": "PRIVATE_ACCOUNT",
  "message": "This Instagram account is private."
}
```

#### Error Response: Nonexistent Account (404):
```json
{
  "success": false,
  "error": "ACCOUNT_NOT_FOUND",
  "message": "Instagram account was not found."
}
```

#### Error Response: Upstream / Cloudflare Failure (502 / 504):
```json
{
  "success": false,
  "error": "FETCH_FAILED",
  "message": "Unable to fetch public stories at this time."
}
```

---

## 🔍 Upstream Dependency Analysis: Fabula & StoriesIG

### What We Found During Verification:
1. **Fabula Project Inspection**: The Go repository [`mrizkimaulidan/fabula`](https://github.com/mrizkimaulidan/fabula) relies on `https://api-ig.storiesig.info/api/userInfoByUsername/%s` and `https://api-ig.storiesig.info/api/story?url=...`.
2. **Live Test Results**: Calling `https://api-ig.storiesig.info/` currently returns **HTTP 403 Forbidden with Cloudflare Turnstile / Bot Verification Challenge (`<title>Just a moment...</title>`)**.
3. **Implications**: The StoriesIG upstream has deployed active bot defense to prevent programmatic scraping.
4. **Design Decision**: Rather than breaking the system when upstream bot defenses trigger, this project provides:
   - Automated detection of Cloudflare challenges in `FabulaProvider`.
   - Clean, standardized `FETCH_FAILED` responses without crashing or leaking stack traces.
   - A modular `StoryProvider` base interface so alternative upstream services (e.g. self-hosted headless scrapers) can be swapped in seamlessly.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd instagram-story-api
npm install
```

### 2. Configure Environment
Copy the example environment file:
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```
Server runs on `http://localhost:4000`.

### 4. Run Test Suite (11 Test Cases)
```bash
npm test
```

---

## 🧪 Automated Test Coverage
The test suite in `tests/run-tests.js` tests all 11 scenarios:
1. ✅ Public account with active Story
2. ✅ Public account with no Story
3. ✅ Private account rejection
4. ✅ Invalid username format validation
5. ✅ Nonexistent account error (404)
6. ✅ Upstream timeout handling (504)
7. ✅ Upstream failure handling (502)
8. ✅ Malformed upstream response handling
9. ✅ Multiple Story items parsing
10. ✅ Video Story structure and metadata
11. ✅ Image Story structure and metadata

---

## 🛡️ Strict Privacy & Security
- **No Credentials**: No user passwords, session tokens, or cookies are stored or requested.
- **Public Content Only**: Strictly rejects private account queries.
- **No Paid APIs**: Zero RapidAPI or paid subscriptions required.
