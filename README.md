# Quest Pact — Deployment Guide

## Architecture
- **Frontend**: `index.html` (login) + `app.html` (main app)
- **Backend**: Cloudflare Pages Functions (`/functions/api/`)
- **State storage**: GitHub-backed JSON (`data/state.json` in repo)
- **Auth storage**: GitHub-backed JSON (`data/auth.json` in repo) — passwords hashed with PBKDF2, never plaintext
- **File storage**: Cloudflare R2 (proof photos, videos, audio)

---

## Step 1 — Create GitHub Repo

1. Create a new **private** repo (e.g. `preritjaiswal/quest-pact`)
2. Push this entire folder to `main` branch:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/quest-pact.git
   git push -u origin main
   ```
3. Create `data/` folder with placeholder files (GitHub won't store empty folders):
   - `data/state.json` → content: `{}`
   - `data/auth.json`  → content: `{}`

---

## Step 2 — Create Cloudflare R2 Bucket

1. Go to Cloudflare Dashboard → R2
2. Create bucket: `quest-pact-proofs`
3. Note the bucket name

---

## Step 3 — Create GitHub Personal Access Token

1. GitHub → Settings → Developer Settings → Fine-grained tokens
2. Create token with:
   - **Repository access**: Only `quest-pact`
   - **Permissions**: Contents → Read and Write
3. Copy the token (you'll need it in Step 4)

---

## Step 4 — Deploy to Cloudflare Pages

1. Cloudflare Dashboard → Pages → Create project
2. Connect your `quest-pact` GitHub repo
3. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `/` (root)
4. Click Deploy

### Environment Variables (Settings → Environment Variables):
| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | Your PAT from Step 3 |
| `GITHUB_REPO` | `yourname/quest-pact` |
| `GITHUB_BRANCH` | `main` |
| `AUTH_SECRET` | Random 32-char string (generate at random.org) |

### R2 Binding (Settings → Functions → R2 bucket bindings):
| Variable name | R2 Bucket |
|---|---|
| `PROOF_BUCKET` | `quest-pact-proofs` |

---

## Step 5 — Add Initial Players

1. Open your deployed URL (e.g. `https://quest-pact.pages.dev`)
2. Login page will appear — click "Enter the Realm" — players list will be empty
3. Open `app.html` directly: `https://quest-pact.pages.dev/app.html`
   - Note: It will redirect to login since no session — temporarily set `SESSION_PLAYER` in browser console or add players via the API directly
   - **Easier**: Use the Roster page to add players once you've set up the first player manually in `data/state.json` on GitHub

### Quick Start — Add players directly to GitHub:
Edit `data/state.json` in GitHub and replace `{}` with:
```json
{
  "players": [
    {
      "id": "p1", "name": "Prerit", "role": "player",
      "country": "Australia", "city": "Melbourne",
      "lat": -37.81, "lng": 144.96,
      "color": "#c9a84c,#7a5010",
      "xp": 0, "coins": 500,
      "questsCompleted": 0, "questsFailed": 0, "questsGiven": 0,
      "trophies": [], "joinedAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "id": "p2", "name": "YourFriend", "role": "player",
      "country": "Canada", "city": "Toronto",
      "lat": 43.65, "lng": -79.38,
      "color": "#60a0ff,#1a3060",
      "xp": 0, "coins": 500,
      "questsCompleted": 0, "questsFailed": 0, "questsGiven": 0,
      "trophies": [], "joinedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "quests": [], "ledger": [],
  "nextQuestId": 1, "nextLedgerId": 1
}
```

---

## Step 6 — Each Player Sets Their Password

1. Open `https://your-site.pages.dev`
2. Click **"Set Password"** tab
3. Select your player name
4. Set a password (min 6 chars)
5. Click "Seal the Password"
6. You can now log in via "Enter the Realm"

**Password security**: Passwords are hashed with PBKDF2-SHA256 (200,000 iterations) + random salt + server-side pepper. The hash is stored in `data/auth.json` on GitHub. No one — including you — can recover a plaintext password.

---

## File Structure
```
quest-pact/
├── index.html              ← Login page
├── app.html                ← Main app (globe, quests, gallery, trophies, ledger, roster)
├── _redirects              ← Cloudflare Pages routing
├── functions/
│   └── api/
│       ├── state.js        ← GET/POST state (GitHub-backed)
│       ├── auth.js         ← Login, register, token verify
│       └── upload.js       ← R2 file upload/serve
└── data/                   ← Created on GitHub (not in this folder)
    ├── state.json          ← App state
    └── auth.json           ← Password hashes
```

---

## Notes
- Session tokens expire after **7 days** — players re-login weekly
- Proof files up to **100MB** supported (photo, video, audio, PDF)
- Quest pins appear on globe for active/in-progress quests, linked to gallery
- 48-hour auto-approve: if quest-giver doesn't review submitted proof in 48h, quest auto-completes
- Dispute flow: giver raises dispute → arbitrator (3rd player) gets notified and decides
