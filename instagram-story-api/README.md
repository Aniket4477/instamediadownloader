# Public Instagram Story Downloader API (SaveClip & InstaSaver Providers)

A production-ready, self-hosted Node.js / Express backend service that retrieves **PUBLIC Instagram Stories only** using a resilient dual-provider fallback architecture (`SaveClip` → `InstaSaver`).

---

## 🎯 Architecture

```text
Visitor / Frontend
        │
        │ POST /api/instagram/story { url }
        ▼
Node.js Express Server
        │
        ├── SSRF Validation & Input Sanitizer (utils/instagramUrl.js)
        ├── Rate Limiter Middleware (middleware/rateLimiter.js)
        ├── Short-Lived In-Memory Cache (services/storyService.js)
        │
        ▼
StoryService (Provider Orchestrator)
        │
        ├── 1. Try SaveClipProvider (services/providers/saveclipProvider.js)
        │       ├── Succeeded? → Return normalized media & cache
        │       └── Failed / Blocked / Unavailable? → Fall through
        │
        ├── 2. Try InstaSaverProvider (services/providers/instasaverProvider.js)
        │       ├── Succeeded? → Return normalized media & cache
        │       └── Failed / Blocked / Unavailable? → Fall through
        │
        └── 3. All Providers Failed? → Controlled 503 PROVIDERS_UNAVAILABLE
```

---

## 📡 API Endpoints

### 1. Retrieve Public Story
**`POST /api/instagram/story`**

**Request Headers:** `Content-Type: application/json`

**Request Body Examples:**
```json
{ "url": "https://www.instagram.com/stories/nike/3968731649252302820/" }
```
or
```json
{ "url": "https://www.instagram.com/nike/" }
```
or
```json
{ "url": "@nike" }
```

#### Successful Response:
```json
{
  "success": true,
  "provider": "saveclip",
  "username": "nike",
  "stories": [
    {
      "type": "video",
      "url": "https://cdn.saveclip.app/sample.mp4",
      "thumbnail": "https://cdn.saveclip.app/sample.jpg",
      "mimeType": "video/mp4"
    },
    {
      "type": "image",
      "url": "https://cdn.saveclip.app/sample2.jpg",
      "mimeType": "image/jpeg"
    }
  ]
}
```

#### No Active Public Stories:
```json
{
  "success": true,
  "provider": "saveclip",
  "username": "example",
  "stories": []
}
```

#### Private Account (403):
```json
{
  "success": false,
  "error": "PRIVATE_ACCOUNT",
  "message": "Only public Instagram accounts are supported."
}
```

#### Providers Unavailable (503):
```json
{
  "success": false,
  "error": "PROVIDERS_UNAVAILABLE",
  "message": "Unable to retrieve this public Story right now."
}
```

---

### 2. Provider Health Check
**`GET /api/providers/status`**

**Response:**
```json
{
  "saveclip": {
    "available": false,
    "reason": "Cloudflare Bot Protection Challenge"
  },
  "instasaver": {
    "available": false,
    "reason": "Security Header / Cloudflare Validation Required"
  }
}
```

---

## 🔬 Investigation Results for SaveClip & InstaSaver

### 1. SaveClip.app
- **Live Test Behavior**: Direct server POST requests to `https://saveclip.app/api/ajaxSearch` encounter **Cloudflare Turnstile WAF bot challenges** (`HTTP 403 Forbidden` with `<title>Just a moment...</title>`).
- **Provider Status**: In accordance with the project guidelines ("Do NOT bypass Cloudflare / anti-bot controls"), `SaveClipProvider` automatically detects WAF blocks and marks itself as `unavailable`, passing execution to `InstaSaverProvider`.

### 2. InstaSaver.io
- **Live Test Behavior**: Endpoints like `https://instasaver.io/api/download` require dynamic client-side security signatures and return `HTTP 401 Unauthorized: Missing security headers` or `HTTP 403 Forbidden`.
- **Provider Status**: In accordance with the project guidelines ("Do NOT steal browser cookies or reuse sessions"), `InstaSaverProvider` detects missing security authorization and safely marks itself as `unavailable`.

---

## 🛡️ Security & Privacy Controls
- **SSRF Prevention**: `utils/instagramUrl.js` strictly allowlists official `instagram.com` domains and blocks private subnet / loopback ranges (`127.0.0.1`, `169.254.169.254`, `10.0.0.0/8`, `192.168.0.0/16`, `localhost`, etc.).
- **Rate Limiting**: `middleware/rateLimiter.js` applies IP-based rate limiting via `express-rate-limit`.
- **Sanitized Logging**: `utils/logger.js` automatically strips passwords, cookies, session tokens, and keys from all log entries.
- **Short-Lived Caching**: In-memory LRU cache stores successful public story responses for 5 minutes (configurable).

---

## 🚀 Installation & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```
Starts API server on `http://localhost:4000`.

### 4. Run Automated Test Suite (14 Tests)
```bash
npm test
```

---

## 🧪 Automated Tests Summary (14/14 Passed)
- ✅ Public account with active Story
- ✅ Public account with multiple Stories
- ✅ Public video Story metadata & mimeType
- ✅ Public image Story metadata & mimeType
- ✅ Public account with no active Story
- ✅ Private account rejection (403)
- ✅ Invalid Instagram URL rejection (400)
- ✅ Nonexistent account handling
- ✅ SaveClip failure → InstaSaver fallback
- ✅ Both providers failing (503 PROVIDERS_UNAVAILABLE)
- ✅ Provider timeout graceful fallback
- ✅ Malformed provider response handling
- ✅ Rate limiter & security headers active
- ✅ SSRF attack prevention & domain allowlisting
