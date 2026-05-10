# Community Notes — Chrome Extension

A browser extension that lets verified students annotate any webpage with transparent community notes, visible to everyone.

## Project Structure

```
community-notes-extension/
├── manifest.json     # Chrome Manifest V3 config
├── config.js         # Firebase API key + project ID (fill this in)
├── background.js     # Service worker (minimal)
├── content.js        # Injected on every page — sidebar UI + Firestore logic
├── content.css       # Sidebar styles (cn- prefix to avoid conflicts)
├── popup.html        # Extension popup — auth UI
├── popup.js          # Sign in / sign up via Firebase Auth REST API
└── icons             # icon16/48/128.png
```

## Setup

### 1. Firebase
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication → Email/Password**
3. Enable **Firestore Database** (start in test mode)
4. Set Firestore security rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{id} {
      allow read: if true;
      allow create: if request.auth != null;
    }
  }
}
```

5. Go to Project Settings → General → copy `apiKey` and `projectId`

### 2. Config

Edit `community-notes-extension/config.js`:

```js
const FB_API_KEY = "YOUR_API_KEY";
const FB_PROJECT_ID = "YOUR_PROJECT_ID";
```

### 3. Load Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `community-notes-extension/` folder

## How It Works

- A floating **📝 button** appears on every webpage (bottom-right)
- Clicking it opens a slide-in sidebar showing all notes for the current URL
- Notes are tied to the **exact URL** (origin + pathname, no hash)
- Anyone can **read** notes — no login required
- Only users with a verified **.edu email** can **post** notes
- University is extracted from the email domain and shown as a badge on each note

## Auth Flow

1. User opens popup → enters `.edu` email + password
2. Client validates the `.edu` domain before calling Firebase
3. Firebase Auth creates the account and returns an `idToken`
4. Token stored in `chrome.storage.local` — content script reads it to authorize Firestore writes
5. Token is passed as `Authorization: Bearer` header on note creation

## Firestore Data Model

Collection: `notes`

| Field | Type | Description |
|---|---|---|
| `url` | string | Exact page URL (origin + pathname) |
| `body` | string | Note content (max 500 chars) |
| `university` | string | Extracted from .edu email domain |
| `email` | string | Author's email |
| `createdAt` | timestamp | ISO timestamp |

## Tech Stack

- **Chrome Extension** — Manifest V3, no bundler needed
- **Firebase Auth** — via REST API (no SDK, avoids bundling issues in MV3)
- **Firestore** — via REST API, direct from content script
- **No backend server** — extension talks to Firebase directly
