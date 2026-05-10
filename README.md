# RevealNotes

Transparent community notes on any webpage, written by verified students — for everyone.

Students with a `.edu` email can annotate any URL with context, corrections, or warnings. Anyone can read the notes. Votes surface the most useful ones.

---

## Installing the Extension (Judges)

> No account needed to read notes. You only need an account to post or vote.

### Step 1 — Download

Clone or download this repository:

```bash
git clone https://github.com/yaroslav-06/revealNotes.git
```

Or click **Code → Download ZIP** on GitHub and unzip it.

### Step 2 — Open Chrome Extensions

Go to **chrome://extensions** in your browser.

### Step 3 — Enable Developer Mode

Toggle **Developer mode** on in the top-right corner.

![Developer mode toggle](https://developer.chrome.com/static/docs/extensions/get-started/tutorial/hello-world/image/extensions-page-e0d64d89375b.png)

### Step 4 — Load the Extension

Click **Load unpacked** and select the `community-notes-extension` folder inside this repo.

### Step 5 — Done

The 📝 icon appears in your Chrome toolbar. Navigate to any webpage and click the **purple circle** in the bottom-right corner to open the notes sidebar.

---

## Creating an Account (to post notes or vote)

1. Click the extension icon in the toolbar
2. Go to the **Sign Up** tab
3. Enter a `.edu` university email and a password (min 8 characters)
4. Click **Create Account**

You can now add notes and vote on any page.

---

## How It Works

- Notes are tied to the **exact URL** of the page
- **Anyone** can read notes — no login required
- Only verified **`.edu` students** can post notes or vote
- Each note shows the author's university (extracted from their email domain)
- Vote **▲ up** or **▼ down** — clicking your own vote removes it
- Sort notes by **Recent** or **Top** score

---

## Tech Stack

- **Chrome Extension** — Manifest V3
- **Backend** — Node.js REST API at `http://45.55.80.161:3000`
- **Auth** — JWT tokens, `.edu` email verified client-side
