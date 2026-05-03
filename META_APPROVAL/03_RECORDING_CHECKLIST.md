# UniqueHub — Recording Day Checklist

> Step-by-step practical guide for recording the 2 screencasts. Read top to bottom on the day of recording.

---

## 🛠 Setup (do this 1h before recording)

### A. Browser

- [ ] Open **Chrome incognito** (no extensions, no logged-in accounts)
- [ ] Set Chrome language to English: `Settings → Languages → Add language: English (US) → Move to top → Display Google Chrome in this language → Restart`
- [ ] Set screen resolution to **1920x1080** or **1440x900** for clean recording

### B. Test accounts (prepare in advance)

For Video 1 (Instagram):
- [ ] Test Instagram Business account (e.g., `@unique_demo`) with at least 1 post already published
- [ ] Username + password written down somewhere accessible
- [ ] Account must already be connected to a Facebook Page (Instagram Business requires this)

For Video 2 (Facebook):
- [ ] Test Facebook account that admins at least 1 Facebook Page
- [ ] Page should have:
  - At least 3 published posts (with images)
  - At least 1 comment on any post
  - At least 1 reaction on any post
- [ ] Account should be inside a Meta Business Manager portfolio

### C. UniqueHub setup

- [ ] Create a clean test client called **"Demo Client"** in UniqueHub
- [ ] Make sure your UniqueHub account is `admin` (CEO role) — `contato@uniquemkt.com.br`
- [ ] Have 1 sample image saved on desktop (640x640 minimum, JPG)
- [ ] Have 1 sample caption text ready in a notes app to paste later

### D. Recording software

Recommended:
- **Mac:** QuickTime (built-in) or **Loom** (free tier)
- **Windows:** OBS Studio (free)

Settings:
- [ ] Resolution: 1920x1080 or 1440x900
- [ ] Frame rate: 30fps
- [ ] Format: MP4 (H.264)
- [ ] **Record cursor visible**
- [ ] **Record audio: optional** (captions matter more)

---

## 🎬 Recording — Video 1 (Instagram)

### Pre-flight (5 min before)

1. [ ] Sign out of all Meta accounts
2. [ ] Open Chrome incognito
3. [ ] Navigate to `https://uniquehub.com.br/?lang=en` — confirm UI is in English
4. [ ] Open notes app with the captions ready to paste during edit
5. [ ] Start recording software, frame to whole screen or browser window

### Recording (use 02_VIDEO_SCRIPTS.md as guide)

Follow the timeline in `02_VIDEO_SCRIPTS.md → Video 1`. Each step has specific actions and captions.

**Tips while recording:**
- Speak slowly with the mouse, hover briefly on each element before clicking
- When OAuth consent screen appears, **wait 3 full seconds** before clicking Allow — this is critical
- Don't backtrack/redo — if you mess up, stop and restart from the beginning
- Keep the URL bar visible at all times

### Post-recording

1. [ ] Trim start/end of video
2. [ ] Add **captions in English** as text overlays (use Loom captions or DaVinci Resolve free)
3. [ ] Export MP4, target **under 100MB** (compress if needed)
4. [ ] Watch the final video once — does it tell the complete story?

---

## 🎬 Recording — Video 2 (Facebook)

Same setup as Video 1 but using the Facebook test account.

**Important:** Facebook OAuth shows the page-selection screen as a separate step. Make sure to:
1. Select the test Page in the consent flow
2. Show that selection in the video — this is the proof for `pages_show_list`

Follow the timeline in `02_VIDEO_SCRIPTS.md → Video 2`.

---

## 📤 Submission process

### A. App "UniqueHub Ins" (Instagram) — `1253351873442734`

1. Go to https://developers.facebook.com/apps/1253351873442734/app-review/permissions/
2. For each permission (`instagram_business_basic`, `instagram_business_content_publish`):
   - [ ] Click "Edit Request"
   - [ ] Replace the "How are you using this permission?" text with the English version from `01_PERMISSION_USAGE_TEXTS.md → App 1`
   - [ ] Upload the new screencast (Video 1)
   - [ ] Save
3. Click "Submit for Review"
4. Confirm submission

### B. App "UniqueHub" (Facebook) — `1557196698688426`

1. Go to https://developers.facebook.com/apps/1557196698688426/app-review/permissions/
2. For each permission (`pages_show_list`, `pages_read_user_content`, `pages_read_engagement`, `read_insights`, `business_management`):
   - [ ] Click "Edit Request"
   - [ ] Replace the "How are you using this permission?" text with the English version from `01_PERMISSION_USAGE_TEXTS.md → App 2`
   - [ ] Upload the new screencast (Video 2) — same video for all 5 permissions
   - [ ] Save
3. Click "Submit for Review"
4. Confirm submission

### C. Test credentials

Both apps will ask for **test credentials**. Provide:
- UniqueHub login: `demo@uniquemkt.com.br` / `[generate strong password]`
- Test Instagram: `@unique_demo` / `[same password ok]`
- Test Facebook account: `[test account email]` / `[password]`
- Note for reviewer: **"Add `?lang=en` to the URL to view the app in English"**

---

## ⏰ What happens next

- **3–7 business days:** Meta reviewer watches the video, tests with the credentials, decides
- **Outcome:**
  - ✅ Approved → app goes live for production use, all clients can connect
  - ❌ Rejected → read the new feedback, identify what specific point of the script wasn't shown clearly, re-record that part
  - ❓ Question from reviewer → answer through Meta's question interface

---

## 🚨 If rejected again

The most common second-rejection reasons:

1. **Too short:** must show the FULL flow, including OAuth consent
2. **Wrong language:** must be 100% English UI
3. **Missing API result:** must SHOW the data on screen after the API call
4. **No client approval shown:** for `instagram_business_content_publish`, the client approval before publishing is mandatory

If rejected again, send Matheus the new feedback text and we'll fix the specific point.

---

## 📞 Emergency contact

If anything goes wrong during recording or submission, ping me with:
- Screenshot of where you got stuck
- The specific error message (if any)
- Which step of the script you were on

I'll fix or guide you through it.

**Good luck. Let's get these approved.** 🍀
