# UniqueHub — Meta App Review Screencast Scripts

> Two videos to be recorded — one per app. **Recording in Portuguese (pt-BR) UI, with English captions added afterwards via Loom translation feature.** This approach is accepted by Meta and avoids any code changes that could break production. See `04_LOOM_CAPTIONS_GUIDE.md` for the captioning step.

**Format:** MP4, 1080p, max 100MB. **App language:** Portuguese (no `?lang=en`). **Captions:** English (added in Loom after recording).

---

## 📹 Video 1 — App "UniqueHub Ins" (Instagram)

**Covers:** `instagram_business_basic` + `instagram_business_content_publish`
**Estimated duration:** 4–5 minutes
**Browser language:** Portuguese (default Brazilian Portuguese)
**App language:** Portuguese (default — no URL params)

### Pre-recording checklist

- [ ] Sign out of all Meta accounts in the recording browser
- [ ] Have a test Instagram Business account ready (username + password, with at least 1 Page already linked via Meta Business)
- [ ] Have a test image saved on desktop (a sample post image, JPG/PNG)
- [ ] Open Chrome in default Portuguese (no language change needed)
- [ ] Open UniqueHub at `https://uniquehub.com.br/` (default Portuguese)
- [ ] Have a clean test client created in UniqueHub named "Demo Client"

### Script

**[0:00 — 0:10] — Intro caption**

On-screen text: *"UniqueHub — Demo of Instagram Business integration for Meta App Review"*

(Show the homepage briefly with logo and English nav)

---

**[0:10 — 0:30] — Login to UniqueHub**

Caption: *"Step 1: Agency owner logs into UniqueHub with email and password."*

Actions:
- Click "Login" button
- Type `demo@uniquemkt.com.br` and password
- Click "Sign In"
- Land on Home dashboard

---

**[0:30 — 0:50] — Open client profile**

Caption: *"Step 2: Agency selects a client from the client list."*

Actions:
- Click "Clients" in the navigation
- Click on "Demo Client" card
- Land on the client profile page

---

**[0:50 — 1:30] — Connect Instagram (OAuth flow)**

Caption: *"Step 3: Agency connects the client's Instagram Business account through Instagram Business Login."*

Actions:
- Click the "Social Networks" tab
- Click the "Instagram" card → it expands
- Click the **"Connect Instagram"** button
- Browser redirects to `instagram.com/oauth/authorize`
- The Instagram login page appears — sign in with the test Instagram Business account
- The permissions consent screen appears — **PAUSE HERE for 3 seconds with caption**: *"Instagram requesting `instagram_business_basic` and `instagram_business_content_publish` permissions"*
- Click "Allow" / "Authorize"
- Redirected back to UniqueHub

---

**[1:30 — 2:15] — `instagram_business_basic` in action**

Caption: *"Step 4: After connection, UniqueHub displays the Instagram account profile data — username, name, follower count, profile picture — fetched in real time using the `instagram_business_basic` permission."*

Actions:
- Show the "Social Networks" tab now displaying the connected Instagram profile card
- Zoom in / highlight the username, profile picture, follower count
- Click on the profile to expand details if available
- Show the recent media list pulled from this permission (caption thumbnails)

---

**[2:15 — 3:30] — Create content + send for client approval**

Caption: *"Step 5: Agency creates a new post and sends it for client approval."*

Actions:
- Click "Create new content" / "+ New" button
- Select content type: "Single Image"
- Upload the test image
- Type a sample caption: `"Test post for App Review"`
- Set publish date: today, in 5 minutes (or any time soon)
- Select Instagram as the target platform
- Click "Send to client for approval"
- Caption: *"Content moves to the approval pipeline"*

---

**[3:30 — 4:00] — Client approves**

Caption: *"Step 6: The client opens the client portal and approves the content."*

Actions:
- Open a new browser tab → log into the client portal as the Demo Client
- See the pending content
- Click "Approve"
- Caption: *"Content is now scheduled for publishing"*

---

**[4:00 — 4:45] — `instagram_business_content_publish` in action**

Caption: *"Step 7: UniqueHub publishes the approved content to Instagram using `instagram_business_content_publish`."*

Actions:
- Switch back to the agency view
- Show the content now in "Scheduled" status
- (If immediate publish is supported) Click "Publish now" → otherwise wait for the scheduled time
- Show a success toast: "Published to Instagram"
- Click the saved permalink → opens the actual published post on Instagram in a new tab
- Caption: *"Successfully published — verifying live on Instagram"*

---

**[4:45 — 5:00] — Outro**

Caption: *"This concludes the demo of `instagram_business_basic` and `instagram_business_content_publish`. Both permissions are used strictly within the agency's authenticated dashboard, with explicit client approval before any publishing."*

---

## 📹 Video 2 — App "UniqueHub" (Facebook)

**Covers:** `pages_show_list`, `pages_read_user_content`, `pages_read_engagement`, `read_insights`, `business_management`
**Estimated duration:** 6–8 minutes
**Browser language:** Portuguese (default)
**App language:** Portuguese (default)

### Pre-recording checklist

- [ ] Sign out of all Meta accounts in the recording browser
- [ ] Have a test Facebook account that admins at least 1 Facebook Page (with some recent posts and at least one comment/reaction)
- [ ] Test Page should be inside a Meta Business Manager
- [ ] Same test client setup in UniqueHub

### Script

**[0:00 — 0:10] — Intro**

Caption: *"UniqueHub — Demo of Facebook Pages integration for Meta App Review"*

---

**[0:10 — 0:30] — Login to UniqueHub** (same as video 1)

---

**[0:30 — 0:50] — Open client profile** (same as video 1)

---

**[0:50 — 1:50] — Connect Facebook (OAuth flow)**

Caption: *"Step 3: Agency connects the client's Facebook Page through Facebook Login."*

Actions:
- Click the "Social Networks" tab → "Facebook" card → "Connect Facebook" button
- Browser redirects to Facebook OAuth
- Sign in with the test Facebook account
- The permissions consent screen appears — **PAUSE for 3 seconds with caption**: *"Facebook requesting `pages_show_list`, `pages_read_user_content`, `pages_read_engagement`, `read_insights`, `business_management` permissions"*
- Click "Continue" / "Allow"
- Page selection screen appears (Meta's native one)
- Caption: *"Permission `pages_show_list` is being used to display the list of Pages the user manages."*
- Select 1 Page (the test Page)
- Confirm "Allow"
- Redirected back to UniqueHub

---

**[1:50 — 2:30] — `pages_show_list` in action**

Caption: *"Step 4: UniqueHub displays the list of Pages the user manages — fetched via `pages_show_list`."*

Actions:
- After OAuth callback, UniqueHub shows a dropdown / list with the test Page (from `GET /me/accounts`)
- User selects the Page
- Caption: *"User picks the Page to manage in UniqueHub"*

---

**[2:30 — 3:30] — `pages_read_user_content` in action**

Caption: *"Step 5: UniqueHub reads the Page's published posts and displays them in the content calendar — fetched via `pages_read_user_content`."*

Actions:
- Navigate to "Content Calendar" or "Kanban" view
- Show the list of recent posts from the connected Facebook Page (images, captions, publish dates)
- Click on one post to expand → shows full caption, media, timestamp, permalink

---

**[3:30 — 4:30] — `pages_read_engagement` in action**

Caption: *"Step 6: UniqueHub reads comments and reactions on Page posts and displays them in the Social Inbox — fetched via `pages_read_engagement`."*

Actions:
- Click "Social Inbox" in the navigation
- Show the inbox with comments from the connected Page's posts
- Click on a comment to expand the thread
- Show the comment author, text, timestamp, and reaction counts

---

**[4:30 — 5:30] — `read_insights` in action**

Caption: *"Step 7: UniqueHub reads Page-level and post-level performance metrics, displayed in monthly Reports — fetched via `read_insights`."*

Actions:
- Click "Reports" in the navigation
- Select the connected client and a date range (last 30 days)
- The Reports screen renders charts: page reach, impressions, engagement
- Show a table of top-performing posts with their insights

---

**[5:30 — 6:30] — `business_management` in action**

Caption: *"Step 8: UniqueHub displays the Business Manager and its assets associated with the client — fetched via `business_management`."*

Actions:
- Inside the client profile, open the "Client Assets" or "Business Manager" tab
- Show the Business Manager name + list of Pages and Ad Accounts under it
- Caption: *"This gives the agency a unified view of all client assets across Business Managers"*

---

**[6:30 — 7:00] — Outro**

Caption: *"This concludes the demo of all 5 Facebook Page permissions. All data is read-only and displayed only inside the agency's authenticated dashboard. UniqueHub does not modify Page settings, post on behalf of the user, or share data with third parties."*

---

## 🎬 General recording best practices

**🌐 Language note:** Record in Portuguese (UI), then add **English captions in Loom** after recording. See `04_LOOM_CAPTIONS_GUIDE.md`.

1. **Always show the URL bar** — reviewers need to confirm you're on the actual production URL (`uniquehub.com.br`), not localhost
2. **Pause 2–3 seconds** on the Meta consent screen — this is the most important frame for the reviewer
3. **Add captions** as text overlays (not voice) — reviewers may have audio off
4. **Keep mouse movements smooth** — fast erratic movement is hard to follow
5. **No personal data in the test** — use a fake test account with synthetic data
6. **Show successful results** — every permission must visibly produce a result on screen (not just be requested)
7. **Avoid cuts** — record in one take if possible; cuts make reviewers suspicious
8. **End each section with a brief recap caption** — "this completes permission X"

## ❌ Common mistakes that get rejected

| Mistake | Why it fails |
|---|---|
| App in Portuguese **without English captions** | Meta requires either English UI or English captions |
| Video shorter than full flow | Reviewer can't see the complete use case |
| Skipping the OAuth consent screen | The consent screen is the proof of permission scope |
| Using mock/fake data | Reviewer needs real API responses |
| Voice-only without captions | Reviewer may have audio off |
| File > 100MB | Meta upload fails silently |
| URL not visible | Can't verify you're on the production app |
