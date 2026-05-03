# UniqueHub — Meta App Review Permission Usage Texts (English)

> Use these texts to replace the current Portuguese descriptions on Meta App Review submissions. Each block goes in the "Tell us how you're using this permission or feature" field.

---

# 🟦 APP 1: UniqueHub Ins (`1253351873442734`) — Instagram Business

## Use case context (paste in "Use case description" if available)

UniqueHub is a SaaS platform used by digital marketing agencies to manage social media content for their clients. Agency staff create content (posts, reels, stories), submit it to clients for approval through a built-in approval workflow, and once approved, schedule and publish the content directly to the client's connected Instagram Business accounts. Agencies also monitor the published content's basic data (caption, media, timestamp, permalink) to verify successful publishing and to display it inside the agency's content calendar.

The user flow is:
1. Agency owner logs into UniqueHub
2. Opens a client profile
3. Goes to "Social Networks" tab and clicks "Connect Instagram"
4. Goes through Instagram Business Login (OAuth) and grants permissions
5. The connected account becomes available for content scheduling
6. Agency creates a post, sends to client for approval, and after approval, schedules publishing
7. UniqueHub publishes to the connected Instagram Business account at the scheduled time

---

## Permission 1.1 — `instagram_business_basic`

**How are you using this permission?**

We use `instagram_business_basic` to retrieve the basic profile information of the Instagram Business or Creator account that the agency's client connects to UniqueHub through the Instagram Business Login flow.

Specifically, after the client (or agency on behalf of the client) authorizes the connection, we read:
- The Instagram account's `id` and `username` to identify which account is connected
- The account's name, profile picture URL, biography, and follower/following counts to display the connected account inside the agency's dashboard, so agency staff can visually confirm they're managing the correct profile
- The list of the account's media (basic post data only — id, caption, media_type, media_url, permalink, timestamp) so agency staff can see in their content calendar what the account has already published

This data is shown only inside the authenticated agency's dashboard. It is not used for any other purpose, not shared with third parties, and is refreshed on demand from the Meta Graph API rather than stored long-term.

**End-to-end demonstration in the screencast:**
1. Agency owner logs into UniqueHub (uniquehub.com.br) with email + password
2. Selects a client profile from the client list
3. Opens the "Social Networks" tab
4. Clicks "Connect Instagram"
5. Goes through Meta's OAuth (logs into a test Instagram Business account, grants permissions)
6. Returns to UniqueHub — the dashboard now shows the connected Instagram account's username, profile picture, name and follower count, fetched in real time using `instagram_business_basic`
7. Agency staff can see the recently published media list pulled from this permission, displayed inside the content calendar

---

## Permission 1.2 — `instagram_business_content_publish`

**How are you using this permission?**

We use `instagram_business_content_publish` to publish content (image posts, carousel posts, reels, and stories) to the agency client's connected Instagram Business account, on behalf of the client and only after the client has explicitly approved the content inside UniqueHub.

The full publishing flow is:
1. Agency staff create a content item (caption + media) inside UniqueHub
2. The content goes through an internal approval pipeline: design → client review → client approval
3. Once the client approves the content (button "Approve" inside the client portal), the content is moved to the "Scheduled" stage with a scheduled publish date and time
4. At the scheduled time, our backend (a Supabase Edge Function triggered by pg_cron every 60 seconds) calls the Instagram Graph API in two phases:
   - Phase 1: `POST /{ig-user-id}/media` to create a media container with the approved media URL and caption
   - Phase 2: `POST /{ig-user-id}/media_publish` with the container ID to publish the post
5. Upon success, we save the returned `id` and `permalink` back to UniqueHub's database, so agency staff can verify publishing and link to the live post on Instagram

This permission is used strictly for first-party publishing to the client's own Instagram account, with explicit client approval per piece of content. It is not used for third-party content, automated posting without approval, or bulk/spam publishing.

**End-to-end demonstration in the screencast:**
1. Agency owner logs into UniqueHub
2. Opens a client profile that already has Instagram Business connected
3. Creates a new content item — uploads an image, writes a caption, sets a publish date
4. Submits content to client for approval
5. Logs into the client portal (in a separate browser/window) and approves the content
6. Returns to agency view — content moves to "Scheduled" status
7. Either waits for scheduled time OR triggers immediate publish (if a "Publish now" feature is available)
8. Shows the post live on Instagram via the saved permalink, confirming successful publishing through `instagram_business_content_publish`

---

# 🟪 APP 2: UniqueHub (`1557196698688426`) — Facebook Pages

## Use case context

UniqueHub is a SaaS platform used by digital marketing agencies to manage social media content for their clients. For Facebook, agencies connect their clients' Facebook Pages through Meta's Facebook Login flow. Once connected, the agency:
- Lists the Facebook Pages the client manages, so the agency can choose which Page to manage in UniqueHub
- Reads the Page's already-published content to display it in the content calendar alongside Instagram content
- Reads engagement data (comments, reactions) so the agency can respond to followers from a unified inbox
- Reads Page insights (reach, impressions, post performance) to generate performance reports for the client
- Manages the Business Manager assets connected to the client's account, so the agency can identify which ad accounts and pages belong to which Business Manager portfolio

The user flow is:
1. Agency owner logs into UniqueHub
2. Opens a client profile
3. Goes to "Social Networks" tab and clicks "Connect Facebook"
4. Goes through Facebook Login (OAuth) and selects which Pages to grant access to
5. UniqueHub then displays Page data, posts, comments, and insights inside the agency's dashboard

---

## Permission 2.1 — `pages_show_list`

**How are you using this permission?**

We use `pages_show_list` to retrieve the list of Facebook Pages the user (the agency's client, or the agency on behalf of the client) administers. This is shown to the user immediately after they grant Facebook Login access, so they can choose which specific Page they want to connect to UniqueHub.

Without this permission, after the user authorizes Facebook Login, we would not know which Pages they manage, and we would not be able to present them with a list to choose from. The user must select a Page (or multiple Pages) before we can do anything else.

**End-to-end demonstration in the screencast:**
1. Agency owner logs into UniqueHub
2. Opens a client profile
3. Goes to "Social Networks" tab and clicks "Connect Facebook"
4. Goes through Facebook OAuth and grants permissions on the consent screen (which clearly shows "List of Pages you manage" being requested)
5. Returns to UniqueHub — a dropdown / list appears showing the Pages the user manages, populated from `GET /me/accounts`
6. User picks a Page; the chosen Page becomes the active connection inside UniqueHub

---

## Permission 2.2 — `pages_read_user_content`

**How are you using this permission?**

We use `pages_read_user_content` to read the content posted on the agency's client's Facebook Page (posts, photos, videos, status updates) and display it inside the agency's content calendar, so agency staff have a unified view of what has been published on the Page over time.

Specifically, we call `GET /{page-id}/posts` and `GET /{page-id}/feed` to retrieve the Page's published content, including:
- Post message (text)
- Attached media URLs
- Created time
- Permalink

This content is displayed inside the agency's dashboard for organizational purposes only — to show the agency staff what has been published, identify scheduling gaps, and plan future content. It is not republished, redistributed, or shared outside the agency's authenticated dashboard.

**End-to-end demonstration in the screencast:**
1. Agency owner logs into UniqueHub
2. Opens a client profile that already has Facebook connected (or connects it during the video)
3. Opens the "Content Calendar" or "Kanban" view
4. The screen displays a list of recently published posts from the connected Facebook Page — including images, captions, and publish dates — fetched via `pages_read_user_content`

---

## Permission 2.3 — `pages_read_engagement`

**How are you using this permission?**

We use `pages_read_engagement` to read the engagement (comments, reactions, replies) on posts published on the agency's client's Facebook Page. This data is displayed in UniqueHub's "Social Inbox" feature, which gives agency staff a unified view of all comments and reactions across all client Pages, so they can respond to followers from a single interface.

Specifically, we call `GET /{post-id}/comments`, `GET /{post-id}/reactions`, and related endpoints to retrieve:
- Comment text, author name, timestamp
- Reaction count and type (like, love, etc.)
- Comment threads (replies to comments)

This data is shown in the Social Inbox screen inside the agency's authenticated dashboard. It allows agency staff to monitor engagement and respond to followers, on behalf of the client.

**End-to-end demonstration in the screencast:**
1. Agency owner logs into UniqueHub
2. Opens "Social Inbox" from the navigation
3. The Social Inbox displays comments and reactions from the connected Facebook Page's posts, fetched via `pages_read_engagement`
4. Agency staff can click on a comment to view the thread

---

## Permission 2.4 — `read_insights`

**How are you using this permission?**

We use `read_insights` to read aggregated performance metrics for the agency's client's Facebook Page and individual Page posts. This data is used to generate the monthly performance reports the agency delivers to its clients.

Specifically, we call:
- `GET /{page-id}/insights` for Page-level metrics (page_impressions, page_reach, page_engaged_users, page_fan_adds, etc.)
- `GET /{post-id}/insights` for post-level metrics (post_impressions, post_reach, post_engaged_users, etc.)

The metrics are then displayed as charts and tables inside the "Reports" feature of UniqueHub, where the agency builds visual reports to show the client how their Page is performing. The reports are shown only inside the authenticated agency dashboard and exported to PDF for the client when requested.

**End-to-end demonstration in the screencast:**
1. Agency owner logs into UniqueHub
2. Opens "Reports" from the navigation
3. Selects a connected client and a date range
4. The Reports screen displays charts of Page-level reach, impressions, and engagement, plus a table of top-performing posts — all fetched via `read_insights`

---

## Permission 2.5 — `business_management`

**How are you using this permission?**

We use `business_management` to identify which Meta Business Manager portfolio the agency's client's Facebook Page belongs to, and to display the related business assets (Pages, Ad Accounts, Instagram accounts under that Business Manager) inside the agency's dashboard. This gives the agency a unified view of all assets they manage on behalf of each client, which is essential when an agency manages dozens of clients each with multiple Pages, ad accounts, and Instagram accounts under different Business Managers.

Specifically, we call:
- `GET /{business-id}` to retrieve the Business Manager's name and details
- `GET /{business-id}/owned_pages` and `GET /{business-id}/owned_ad_accounts` to list the pages and ad accounts owned by the Business Manager

The data is shown inside the agency's authenticated dashboard, in a "Client Assets" view where the agency can see, per client, which Business Manager their Pages and ad accounts are under. We do not modify Business Manager settings; we only read this data to display.

**End-to-end demonstration in the screencast:**
1. Agency owner logs into UniqueHub
2. Opens a client profile with Facebook connected
3. Opens the "Client Assets" or "Business Manager" tab inside the client profile
4. The screen displays the Business Manager name and the list of Pages and Ad Accounts under it, fetched via `business_management`

---

# 📋 Submission checklist (before submitting either app)

- [ ] App icon uploaded (1024x1024) — both apps
- [ ] Privacy Policy URL set: `https://uniquehub.com.br/privacy`
- [ ] Terms of Service URL set: `https://uniquehub.com.br/terms`
- [ ] App categorized correctly: "Business and Pages"
- [ ] Verified Business in Meta Business (Unique Marketing)
- [ ] App in "Live" mode (not Development)
- [ ] Test user/account credentials provided to reviewer
- [ ] Screencast for each permission (or grouped per app) uploaded in correct format (MP4, < 100MB, English UI)
- [ ] All "Permission usage" texts replaced with the English versions above
