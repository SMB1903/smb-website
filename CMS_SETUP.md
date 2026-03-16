# CMS Setup Instructions

The Decap CMS files are ready. Complete these one-time manual steps to activate the admin panel.

---

## Step 1 — Create a Netlify Site (Free, ~5 minutes)

Netlify is used only as an OAuth proxy — it handles the GitHub login for the CMS.
You don't need to move your hosting away from GitHub Pages.

1. Go to [netlify.com](https://netlify.com) and sign up for a free account
2. Click **Add new site → Import an existing project**
3. Connect to GitHub and select **SMB1903/smb-website**
4. Leave all build settings blank — just click **Deploy site**
5. Note your Netlify site URL (e.g., `https://smb-website-abc123.netlify.app`)

---

## Step 2 — Enable Netlify Identity

1. In your Netlify site dashboard, click **Site configuration → Identity**
2. Click **Enable Identity**
3. Under **Registration**, set to **Invite only**
4. Under **External providers**, click **Add provider → GitHub**
5. Leave the default settings and click **Enable GitHub**

---

## Step 3 — Invite Yourself

1. Still in Identity settings, click **Invite users**
2. Enter your email address
3. Check your email and accept the invitation — this creates your CMS login

---

## Step 4 — Update admin/config.yml

Once you have your Netlify site URL, update the `base_url` in `admin/config.yml`:

```yaml
backend:
  name: github
  repo: SMB1903/smb-website
  branch: main
  base_url: https://YOUR-NETLIFY-SITE.netlify.app  # ← update this
```

Replace `https://sveltia-cms-auth.netlify.app` with your actual Netlify site URL.

---

## Step 5 — Test the CMS

1. Go to **saintmarysband.ca/admin**
2. Click **Login with Netlify Identity**
3. You should be redirected to log in via GitHub
4. After login you should see the CMS dashboard with:
   - Concerts
   - Gallery
   - Recordings
   - Site Settings

---

## Using the CMS

### Adding a Concert
1. Log in at saintmarysband.ca/admin
2. Click **Concerts → All Concerts**
3. Click the **+** icon to add a new concert entry
4. Fill in the fields and optionally upload a poster image
5. Click **Publish** — the live site updates within ~60 seconds

### Adding a Recording
1. Upload your audio file to [archive.org](https://archive.org/upload)
2. After upload, copy the direct `.mp3` file URL
3. Log in at saintmarysband.ca/admin
4. Click **Recordings → All Recordings → +**
5. Paste the archive.org URL in the **Audio URL** field
6. Fill in title, date, conductor, etc.
7. Click **Publish**

### Uploading Gallery Photos
1. Log in at saintmarysband.ca/admin
2. Click **Gallery → Gallery Photos**
3. Click the existing item you want to update, or add a new one
4. Upload a photo and add alt text
5. Click **Publish**

---

*The CMS stores all content in the GitHub repo as JSON files — every save creates a git commit automatically.*
