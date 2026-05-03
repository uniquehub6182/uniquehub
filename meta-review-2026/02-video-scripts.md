# Meta App Review — Video Scripts (English)

> **2 videos total. One per app.**
> **Format:** screen recording at 1920×1080, English language UI, captions in English (overlaid as text or subtitle file), narrated voiceover OR text-only on-screen captions (your choice — captions are mandatory either way).
> **Length:** 5–8 minutes each.

---

## Pre-recording checklist (read before recording)

- [ ] Browser language set to **English** (Chrome → Settings → Languages → English at the top)
- [ ] App URL with `?lang=en` to force English UI (e.g. `https://uniquehub.com.br?lang=en`)
- [ ] Test reviewer account created (`meta-reviewer@uniquemkt.com.br`)
- [ ] Test client created with **a real Facebook Page** and **real Instagram Business account** ready to be re-connected (or with previous connection revoked, so the OAuth flow is shown fresh)
- [ ] Use Chrome in Incognito mode for clean screencast
- [ ] Close all other tabs and notifications
- [ ] Record at 1920×1080 (use QuickTime, OBS or Loom)
- [ ] Use a clean desktop wallpaper
- [ ] Disable Mac dock auto-hide animation
- [ ] After recording, embed captions OR upload an .srt file alongside

---

## VIDEO 1 — App "UniqueHub Ins" (Instagram)

**Permissions covered in this single video:** `instagram_business_basic`, `instagram_business_content_publish`

**Total length target:** 5–6 minutes

### Scene 1 — App Overview (0:00 – 0:30)

**On-screen text (caption):**
> "UniqueHub is a B2B platform used by digital marketing agencies to manage their clients' social media — content production, approval, scheduling and publishing."

**What to film:**
- Open `https://uniquehub.com.br?lang=en`
- Show the landing/login screen (which should be in English)

**Optional voiceover (English):**
> "This is UniqueHub, a software-as-a-service platform used by digital marketing agencies to manage their clients' social media operations. In this video I'll demonstrate how we use the Instagram Business Login permissions."

---

### Scene 2 — Login (0:30 – 1:00)

**Caption:** "Step 1 — Agency staff log in to the platform."

**What to film:**
- Type `meta-reviewer@uniquemkt.com.br` in the email field
- Type the password
- Click "Sign In"
- Wait for the home dashboard to load (in English)

**Voiceover:**
> "An agency staff member logs in with their work email and password. Their access is limited to clients of their agency."

---

### Scene 3 — Open a Client (1:00 – 1:30)

**Caption:** "Step 2 — Open the client whose Instagram needs to be connected."

**What to film:**
- Click on "Clients" in the bottom navigation
- Click on the test client card (e.g. "Demo Brand")
- The client profile screen opens

**Voiceover:**
> "The agency works with multiple clients. Here, the agency staff opens the profile of one specific client whose Instagram account they manage."

---

### Scene 4 — Initiate Instagram OAuth (1:30 – 2:30)

**Caption:** "Step 3 — Initiate Instagram OAuth flow."

**What to film:**
- Inside the client profile, click on the "Social Networks" tab
- Show the section "Instagram" — currently NOT connected
- Click the **"Connect Instagram"** button
- The browser navigates to the Instagram OAuth page

**Voiceover:**
> "Inside the client's profile, under Social Networks, the staff member clicks Connect Instagram. This redirects to Instagram's official OAuth authorization page."

---

### Scene 5 — Instagram Authorization (2:30 – 3:30)

**Caption:** "Step 4 — User reviews and approves permissions on Instagram's official screen."

**What to film:**
- Show the Instagram login page (if not already logged in, sign in with the test Instagram Business account)
- Show the **permissions screen** with the requested scopes clearly visible:
  - "Access profile and account type"
  - "Create and manage content"
- **PAUSE the video here for 2-3 seconds** so the reviewer can read the permissions
- Click "Allow"

**Voiceover:**
> "The user reviews exactly which permissions are being requested — Instagram Business Basic and Content Publish — and grants them by clicking Allow."

---

### Scene 6 — Connection Confirmed (3:30 – 4:00)

**Caption:** "Step 5 — Back inside UniqueHub. Account is connected. instagram_business_basic is used here to display the account's profile data."

**What to film:**
- Browser redirects back to UniqueHub
- The "Social Networks" tab now shows the connected Instagram with:
  - Profile picture
  - Username
  - Account type (Business)
- Highlight (mouse hover or red box overlay) the username and profile picture

**Voiceover:**
> "Back in UniqueHub, the connection is confirmed. We use instagram_business_basic to retrieve the username, profile picture and account type so the agency can confirm the correct account is connected."

---

### Scene 7 — Create and Schedule Content (4:00 – 5:00)

**Caption:** "Step 6 — Now we publish content. instagram_business_content_publish is used here."

**What to film:**
- Navigate to "Content" → "+ New Demand"
- Fill in: title ("Test post for Meta review"), type (Single image), upload an image
- Write a caption in English
- Click "Schedule"
- Select date/time
- Click "Submit for client approval"
- Show the demand moving through stages: Brief → Design → Review → Client → Scheduled

**Voiceover:**
> "An agency designer creates a content piece, the social media manager schedules it and submits it for client approval. After the client approves, it moves to Scheduled."

---

### Scene 8 — Publishing Happens (5:00 – 5:30)

**Caption:** "Step 7 — At scheduled time, instagram_business_content_publish creates the media container and publishes."

**What to film:**
- Show the calendar with the scheduled post
- For demonstration, show a previously-scheduled post that has been published (status: "Published" with a green check)
- Click on the published post — show the Instagram permalink, post ID, and a thumbnail of the live post on Instagram (open the permalink in a new tab to confirm)

**Voiceover:**
> "When the scheduled time arrives, our backend uses instagram_business_content_publish to create the Instagram media container and publish it to the connected account. Here you can see a post that was published this way."

---

### Scene 9 — Closing (5:30 – 6:00)

**Caption:** "End of demonstration. UniqueHub uses these two Instagram permissions only on accounts the user has explicitly connected and authorized."

---

## VIDEO 2 — App "UniqueHub" (Facebook)

**Permissions covered in this single video:** `pages_show_list`, `pages_read_user_content`, `pages_read_engagement`, `read_insights`, `business_management`

**Total length target:** 7–8 minutes

### Scene 1 — App Overview (0:00 – 0:30)

Same as Video 1 Scene 1.

---

### Scene 2 — Login (0:30 – 1:00)

Same as Video 1 Scene 2.

---

### Scene 3 — Open a Client (1:00 – 1:30)

Same as Video 1 Scene 3, but emphasize that this client manages a Facebook Page (not Instagram in this demo).

---

### Scene 4 — Initiate Facebook OAuth (1:30 – 2:30)

**Caption:** "Step 3 — Initiate Facebook Login flow."

**What to film:**
- Inside the client profile, click on "Social Networks" tab
- Show the "Facebook" section — currently NOT connected
- Click the **"Connect Facebook"** button
- Browser navigates to Facebook OAuth page

---

### Scene 5 — Facebook Authorization (2:30 – 3:30)

**Caption:** "Step 4 — User reviews and approves permissions on Facebook's official screen."

**What to film:**
- Sign in with the test Facebook account (if needed)
- Show the **permissions screen** with the requested scopes clearly visible:
  - "Show a list of the Pages you manage"
  - "Read content posted on the Pages you manage"
  - "Read engagement data (reactions, comments) on the Pages you manage"
  - "Read insights for the Pages you manage"
  - "Manage your business"
- **PAUSE for 3-4 seconds** so the reviewer can read all permissions
- Click "Continue" / "Allow"

**Voiceover:**
> "The user grants UniqueHub the requested Page permissions including pages_show_list, pages_read_user_content, pages_read_engagement, read_insights and business_management."

---

### Scene 6 — Page Selection (`pages_show_list`) (3:30 – 4:00)

**Caption:** "Step 5 — pages_show_list is used to display the list of Pages the user manages."

**What to film:**
- After authorization, UniqueHub shows a list of Pages the user manages
- The list shows Page name + profile picture
- Highlight (red box) the list of Pages
- Click on the Page to use (e.g. "Demo Brand FB Page")

**Voiceover:**
> "Because a single user often manages multiple Pages, we use pages_show_list to retrieve and display the list. The user picks which Page to connect to UniqueHub."

---

### Scene 7 — Connection Confirmed + Business Manager (`business_management`) (4:00 – 4:30)

**Caption:** "Step 6 — Connection confirmed. business_management is used to access Pages owned by Business Manager assets."

**What to film:**
- Show the connected state in the Social Networks tab — Page name, profile picture, link to Page
- If Page is in a Business Manager: show the Business Manager name
- Highlight the Business Manager indicator

**Voiceover:**
> "The Page is connected. When the Page is owned by a Meta Business Manager, business_management is required to retrieve the Page Access Token correctly through the Business Manager flow."

---

### Scene 8 — Read Posts (`pages_read_user_content`) (4:30 – 5:30)

**Caption:** "Step 7 — pages_read_user_content reads posts published on the Page and displays them in the kanban / calendar."

**What to film:**
- Navigate to "Content" → kanban view
- In the "Published" column, show recent posts pulled from the Facebook Page
- Highlight a couple of posts with a red box
- Hover or click on one — show the post text, image, and link to the original on Facebook
- Navigate to "Calendar" — show published posts placed on the dates

**Voiceover:**
> "We use pages_read_user_content to read posts that have been published on the Page, and display them in the kanban Published column and on the calendar — giving the agency a unified view of all client content."

---

### Scene 9 — Read Engagement (`pages_read_engagement`) (5:30 – 6:30)

**Caption:** "Step 8 — pages_read_engagement reads comments and engagement on the Page."

**What to film:**
- Navigate to "Inbox" / "Social Inbox"
- Show the list of recent comments received on the Page
- Click on a comment thread — show the comment text, author name, timestamp
- Show how the agency can reply from inside UniqueHub
- Highlight engagement counts (reactions, comments) on a post in the kanban

**Voiceover:**
> "We use pages_read_engagement to retrieve comments and engagement metrics. Comments appear in the Social Inbox where the agency manages them. Reactions and engagement counts appear next to each post."

---

### Scene 10 — Read Insights (`read_insights`) (6:30 – 7:30)

**Caption:** "Step 9 — read_insights powers the monthly performance reports."

**What to film:**
- Navigate to "Reports"
- Select the connected Page
- Show charts: reach over time, impressions, engagement rate, follower growth, top-performing posts
- Highlight the monthly numbers
- Demonstrate the "Export to PDF" button (don't have to actually export)

**Voiceover:**
> "We use read_insights to retrieve Page performance metrics that power our monthly reports. The agency uses these reports to demonstrate ROI to their clients."

---

### Scene 11 — Closing (7:30 – 8:00)

**Caption:** "End of demonstration. All five Facebook Pages permissions are only used on Pages the user has explicitly connected and authorized."

---

## Recording tips

- **Captions in English are mandatory.** If your narration is Portuguese, the on-screen text and tooltips MUST be in English.
- **Slow down.** Pause 2-3 seconds on the OAuth permissions screen — that's the part Meta reviewers most want to see.
- **Use a red box overlay** to highlight key UI elements when they're being explained (most screen recording tools support this).
- **No personal data visible.** Use the test account only — no real client names, no real payment info, no real personal photos.
- **Show the URL bar.** Whenever you switch screens, the URL should be visible so the reviewer can confirm you're on the official Meta domain (during OAuth) and back on uniquehub.com.br.
- **Demonstrate fresh OAuth every time.** Don't show "already connected" state for the OAuth scene — revoke the previous connection so the OAuth flow is shown end-to-end.

## After recording

1. Export at 1920×1080, MP4 (H.264 + AAC).
2. File size limit per Meta: 1 GB.
3. Upload to the submission and reference each permission's video segment by timestamp in the "Step-by-step instructions" field.
