# Meta App Review — Permission Usage Texts (English)

> **How to use:** Copy each block below and paste in the corresponding "How are you using this permission/feature?" field in the Meta App Review submission.

---

## APP 1: UniqueHub Ins (`1253351873442734`) — Instagram

---

### `instagram_business_basic`

**Field: "Tell us how you're using this permission or feature"**

```
UniqueHub is a B2B SaaS platform used by digital marketing agencies to manage their clients' social media operations. Agency staff (admins, social media managers, designers) collaborate inside the platform to plan, design, approve and publish content for the agency's clients.

We use instagram_business_basic to retrieve the basic profile information (username, profile picture URL, account type, and account ID) of the Instagram Business or Creator account that the agency's client connects to UniqueHub. This information is displayed inside the agency dashboard so the agency team can identify which Instagram account they are operating on, prevent posting to the wrong account, and confirm a successful connection.

User flow:
1. Agency admin logs into UniqueHub.
2. Admin opens a client profile and goes to the "Social Networks" tab.
3. Admin clicks "Connect Instagram" and is redirected to Instagram's OAuth authorization screen.
4. The client (or admin acting on the client's behalf with permission) approves access.
5. Upon return, UniqueHub stores the access token server-side and uses instagram_business_basic to fetch the profile data.
6. The connected account name, username, profile picture and account type appear in the client's profile and are visible to the agency team in the kanban, calendar and publishing screens to confirm the correct account is selected.

Data retrieved: account ID, username, profile picture URL, account type. No private user content is read with this permission alone.
```

**Step-by-step video script:** see file `02-video-scripts.md`

---

### `instagram_business_content_publish`

**Field: "Tell us how you're using this permission or feature"**

```
UniqueHub uses instagram_business_content_publish to schedule and publish content (single image posts, carousels, Reels and Stories) on the Instagram Business/Creator account that the agency's client has explicitly connected and authorized.

The complete workflow inside UniqueHub:
1. Agency designer creates a content piece (image or video) inside a "Demand" (a content production task).
2. The agency's social media manager writes the caption, schedules a publishing date/time and submits it for client approval.
3. The agency's client receives a notification and reviews the content in their own client portal. The client either approves or requests changes.
4. After client approval, the content moves to the "Scheduled" stage.
5. At the scheduled time, UniqueHub's backend uses instagram_business_content_publish to:
   a) Create an Instagram media container with the media URL (hosted on our CDN) and caption.
   b) Publish the container to the connected Instagram account.
6. The post status (success, failure, retry) is recorded and displayed to the agency in the calendar and reports screens.

This permission is essential for our core value proposition: enabling marketing agencies to deliver scheduled, client-approved Instagram content for their clients without manually logging into each client's Instagram account.

Posting only occurs after explicit client approval and at user-scheduled times. We do not auto-generate or auto-publish content without human approval.
```

---

## APP 2: UniqueHub (`1557196698688426`) — Facebook

---

### `pages_show_list`

**Field: "Tell us how you're using this permission or feature"**

```
UniqueHub uses pages_show_list to retrieve the list of Facebook Pages that a user (the agency's client, or the agency owner if they manage Pages directly) administers, so the agency staff can select which specific Page to connect to UniqueHub.

When a client connects their Facebook through UniqueHub:
1. Client clicks "Connect Facebook" inside the agency-shared workspace.
2. Facebook OAuth flow runs.
3. After authorization, UniqueHub calls /me/accounts (which requires pages_show_list) to retrieve all Pages the user administers.
4. The list of Pages is displayed in a selection screen so the user can pick which specific Page they want to use with UniqueHub (a marketing agency's client may manage multiple brands/Pages).
5. The selected Page's Page Access Token is stored and used for all subsequent operations on that Page.

Without pages_show_list we cannot offer a Page-selection step, which would force users to use only the default first Page returned by Meta — a poor experience when a client has more than one Page.

Pages are listed in plain text (Page name + profile picture). No content from the Pages is read with this permission alone.
```

---

### `pages_read_user_content`

**Field: "Tell us how you're using this permission or feature"**

```
UniqueHub uses pages_read_user_content to read the content (posts, photos, videos) published on the Facebook Pages that the agency's clients have connected to the platform. This content is displayed inside the agency dashboard for management, approval and content-planning purposes.

Specific use cases inside UniqueHub:
1. Content kanban: agency staff sees recent published posts from a client's Page in the "Published" column of the kanban, alongside in-progress and scheduled content. This gives full context of what has been published.
2. Calendar view: published Facebook posts are placed on the calendar (along with scheduled and draft content), so the agency can see a unified view of past and upcoming content.
3. Reports: published posts feed into engagement and performance reports for the client.
4. Comments and replies (read via pages_read_engagement): staff can open a post and view comments to manage them.

Without pages_read_user_content, the agency would have a blind spot — they would not know what their client's Page has published unless they manually log into Facebook and check, which defeats the whole purpose of a centralized agency platform.
```

---

### `pages_read_engagement`

**Field: "Tell us how you're using this permission or feature"**

```
UniqueHub uses pages_read_engagement to read engagement data (comments, reactions, post impressions, page metadata) on the Facebook Pages the agency's clients have connected.

Where this data is shown inside UniqueHub:
1. Social Inbox: a unified inbox screen aggregates comments and replies received on connected Pages, so the agency social media manager can see and respond to engagement without leaving UniqueHub. This includes the comment text, author name and timestamp.
2. Reports: aggregated engagement metrics (reactions, comments per post, reach) are summarized in monthly reports for each client.
3. Page metadata: the agency views Page name, fan count, Page type and category in the client's "Social Networks" tab to confirm correct configuration.

This permission is essential for the social inbox feature, which is one of the most-used features in UniqueHub. Without it, agencies would have to manually log into each client's Facebook to read comments — defeating the purpose of a unified workflow tool.

We only read engagement data on Pages that the user has explicitly connected and authorized. No engagement data from Pages outside of explicitly-connected Pages is ever read.
```

---

### `read_insights`

**Field: "Tell us how you're using this permission or feature"**

```
UniqueHub uses read_insights to retrieve performance metrics (post reach, impressions, engagement rate, follower growth, page views) of the Facebook Pages that the agency's clients have connected, so the agency can produce monthly performance reports for the client.

Specific reports generated:
1. Monthly performance overview: total reach, total impressions, engagement rate over time.
2. Best-performing posts: posts ranked by engagement so the agency can identify what resonates with the audience.
3. Audience growth: follower count over time.
4. Comparative analysis: month-over-month performance.

Reports are generated automatically inside UniqueHub's "Reports" screen and can be exported as PDF for the client. The agency uses these reports to demonstrate the value of their service to the client and inform content strategy decisions.

Without read_insights, agencies cannot demonstrate ROI to their clients with quantitative data — which is a critical part of our value proposition.

We only read insights for Pages the user has explicitly connected.
```

---

### `business_management`

**Field: "Tell us how you're using this permission or feature"**

```
UniqueHub uses business_management to access the Meta Business Manager assets (Pages, Ad Accounts, Pixels) that the agency's client has explicitly granted access to. This allows the agency to manage their client's Pages and (in the future) ad accounts directly from inside UniqueHub without having to switch contexts to Business Manager.

Specific use cases:
1. Page-level operations: when a client's Page is owned by a Business Manager, business_management is required to obtain the Page Access Token correctly via the Business Manager flow.
2. Multi-Page agencies: a single agency client may have several Pages under one Business Manager. business_management ensures we can list and operate on all of them under one connection.
3. Future: in upcoming versions we plan to integrate Meta Ads management. business_management will allow us to read ad accounts associated with the client's Business Manager.

We only request access to the Business Manager assets the user has explicitly granted access to during the OAuth consent flow. We do not access any Business Manager outside of the explicit grant.
```

---

## ⚠️ Important — Reviewer Test Account

Provide these credentials to Meta in the "Test Account" section of every submission:

```
Test agency login (URL: https://uniquehub.com.br?lang=en)
Email: meta-reviewer@uniquemkt.com.br
Password: [TO BE CREATED — see file 04-reviewer-account-setup.md]

Test client (already inside the agency):
- Connect via "Clients" → "Test Client - Meta Review"
- Has a real Facebook Page and Instagram Business account already linked,
  ready for the reviewer to inspect the connected state.
```

---

## Tips for filling out the Meta form

1. **"Platform of integration"** → choose **Web**.
2. **"Are you using a Facebook SDK?"** → No (we use direct OAuth + REST calls server-side).
3. **"Authentication flow"** → Server-to-server (the access token is exchanged on our backend, not exposed to the browser).
4. **"Privacy Policy URL"** → https://uniquehub.com.br/privacy
5. **"Terms of Service URL"** → https://uniquehub.com.br/terms (create if missing)
6. **"App Icon"** → use the existing UniqueHub logo (1024x1024).
7. **"Business Verification"** → already done, leave as is.
