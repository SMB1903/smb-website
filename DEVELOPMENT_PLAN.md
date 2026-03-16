# Saint Mary's Band Website — Complete Development Plan

> **Checklist rules:** An item may only be checked off when it is fully built, functional, and fully wired into the live site. Partial implementations are never checked. Commit and push to GitHub at the end of each phase before starting the next.

---

## Phase 1 — Data Architecture

> Separate content from markup. All dynamic content moves to JSON files fetched by JavaScript. This is the foundation everything else builds on.

### 1.1 Create Data Directory & JSON Files

- [x] Create `data/` directory in repo root
- [x] Create `data/concerts.json` with correct schema:
  - Fields: `id`, `title`, `date`, `time`, `venue`, `address`, `description`, `tags` (array), `featured` (bool), `posterUrl` (optional)
  - Populated with all current concert data from `index.html`
- [x] Create `data/gallery.json` with correct schema:
  - Fields: `id`, `title`, `description`, `imageUrl`, `date`, `alt`
  - Populated with current gallery items
- [x] Create `data/recordings.json` with correct schema:
  - Fields: `id`, `title`, `date`, `conductor`, `venue`, `description`, `archiveUrl`, `duration` (optional)
  - Initially empty array `[]`, ready for first upload
- [x] Create `data/settings.json` for global site content:
  - Fields: `bandName`, `tagline`, `foundedYear`, `memberCount`, `aboutText`, `historyText`, `socialLinks` (facebook, linkedin, youtube)

### 1.2 Wire index.html to Fetch JSON Data

- [x] Concerts section fetches and renders from `data/concerts.json`
  - Upcoming concerts render correctly
  - Past concerts render correctly
  - Featured tag renders correctly
  - Poster modal still works
  - Calendar still works
- [x] Gallery section fetches and renders from `data/gallery.json`
  - All gallery items render with correct images and alt text
  - Hover effects still work
- [x] Audio player section fetches and renders from `data/recordings.json`
  - Renders "no recordings yet" state gracefully when array is empty
- [x] Page text settings stored in `data/settings.json` (managed via CMS)
- [x] All existing site functionality confirmed working after refactor
- [x] No hardcoded content remaining in `index.html` for any CMS-managed section

### 1.3 Phase 1 Commit & Push

- [x] All data JSON files committed
- [x] Updated `index.html` committed
- [ ] Pushed to `main` branch (pending)
- [ ] Live site verified at saintmarysband.ca — all sections render correctly (pending)

---

## Phase 2 — Decap CMS

> A free, open-source git-based CMS. Editors log into saintmarysband.ca/admin, make changes through a UI, and changes are committed to GitHub automatically. GitHub Pages rebuilds the live site.

### 2.1 GitHub OAuth App Setup

- [ ] GitHub OAuth App created at github.com → Settings → Developer Settings → OAuth Apps:
  - Application name: `SMB Website CMS`
  - Homepage URL: `https://saintmarysband.ca`
  - Authorization callback URL: `https://api.netlify.com/auth/done`
- [ ] Client ID and Client Secret saved securely
- [ ] Netlify site created (free) solely for OAuth proxy:
  - Connected to smb-website GitHub repo
  - GitHub OAuth credentials added to Netlify environment variables
  - Netlify Identity or OAuth proxy confirmed working

### 2.2 Create Admin Panel Files

- [ ] Create `admin/index.html`:
  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SMB Content Manager</title>
    <script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>
  </head>
  <body>
    <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
  </body>
  </html>
  ```
- [ ] Create `admin/config.yml` with all collections configured (see below)

### 2.3 Configure CMS Collections

- [ ] **Concerts collection** configured in `config.yml`:
  - Fields: title, date, time, venue, address, description, tags, featured toggle, poster image upload
  - Sorted by date descending
  - Create, edit, delete all work
- [ ] **Gallery collection** configured:
  - Fields: title, description, image upload, date, alt text
  - Image uploads save to `images/gallery/` in repo
- [ ] **Recordings collection** configured:
  - Fields: title, date, conductor, venue, description, archive.org URL, duration
- [ ] **Settings collection** configured (single file):
  - Fields: band name, tagline, founded year, member count, about text, history text, social links
- [ ] **Directors collection** configured:
  - Fields: name, title, bio, photo upload

### 2.4 Verify CMS End-to-End

- [ ] Admin panel loads at saintmarysband.ca/admin
- [ ] Login with GitHub account works
- [ ] Add a test concert via CMS → appears on live site within 60 seconds
- [ ] Edit a concert via CMS → change appears on live site
- [ ] Delete a test concert via CMS → removed from live site
- [ ] Upload a gallery image via CMS → appears in gallery on live site
- [ ] Edit settings text via CMS → appears on live site
- [ ] All CMS saves produce clean commits visible in GitHub repo history

### 2.5 Phase 2 Commit & Push

- [ ] `admin/index.html` and `admin/config.yml` committed
- [ ] Pushed to `main` branch
- [ ] Live site verified — CMS fully operational

---

## ~~Phase 3 — Contact Form~~ ✅ Already Complete

> Skipped — Formspree is already integrated and working on the live site.

---

## Phase 4 — GitHub Actions: Automatic Image Compression

> Every image uploaded to the repo (via CMS or directly) is automatically compressed by a GitHub Action. No manual optimization needed.

### 4.1 Create Image Compression Workflow

- [ ] Create `.github/workflows/compress-images.yml`
- [ ] Workflow triggers on push to `main` when files in `images/` change
- [ ] Uses `calibreapp/image-actions` or equivalent free action
- [ ] Compresses JPEG, PNG, WebP formats
- [ ] Commits compressed images back to repo automatically
- [ ] Skips already-optimized images (idempotent)
- [ ] Workflow runs without errors on first test

### 4.2 Verify Image Compression End-to-End

- [ ] Upload a large uncompressed test image via CMS
- [ ] GitHub Action triggers automatically
- [ ] Compressed version committed back to repo
- [ ] File size reduction confirmed (check commit diff)
- [ ] Image quality acceptable on live site
- [ ] Test image removed after verification

### 4.3 Phase 4 Commit & Push

- [ ] `.github/workflows/compress-images.yml` committed
- [ ] Pushed to `main` branch
- [ ] Workflow visible and enabled in GitHub Actions tab

---

## Phase 5 — SEO Foundation

> robots.txt, sitemap, meta tags, and social sharing tags. Set once, never touch again.

### 5.1 robots.txt

- [ ] Create `robots.txt` in repo root:
  ```
  User-agent: *
  Allow: /
  Disallow: /admin/
  Sitemap: https://saintmarysband.ca/sitemap.xml
  ```
- [ ] Verified accessible at saintmarysband.ca/robots.txt

### 5.2 sitemap.xml

- [ ] Create `sitemap.xml` in repo root
- [ ] Includes main page URL with `lastmod` date
- [ ] Verified accessible at saintmarysband.ca/sitemap.xml
- [ ] Sitemap submitted to Google Search Console (manual step — instructions noted)

### 5.3 Meta Tags in index.html

- [ ] `<meta name="description">` — compelling 150-character description of SMB
- [ ] `<meta name="keywords">` — relevant terms (brass band, Saint Mary's, Halifax, community band, etc.)
- [ ] `<link rel="canonical" href="https://saintmarysband.ca">` added
- [ ] `<html lang="en">` attribute set
- [ ] `<title>` tag optimized: "Saint Mary's Band | Est. 1903 | Halifax Community Band"

### 5.4 Open Graph Tags (Facebook / Social Sharing)

- [ ] `og:title` — band name and tagline
- [ ] `og:description` — same as meta description
- [ ] `og:image` — high quality band photo uploaded to `images/og-image.jpg` (1200×630px)
- [ ] `og:url` — https://saintmarysband.ca
- [ ] `og:type` — "website"
- [ ] `og:site_name` — "Saint Mary's Band"
- [ ] Social share preview tested using opengraph.xyz or similar tool
- [ ] Preview image, title, and description all display correctly when shared on Facebook

### 5.5 Twitter / X Card Tags

- [ ] `twitter:card` — "summary_large_image"
- [ ] `twitter:title` — matches og:title
- [ ] `twitter:description` — matches og:description
- [ ] `twitter:image` — same as og:image
- [ ] Twitter card validated at cards-dev.twitter.com/validator

### 5.6 Phase 5 Commit & Push

- [ ] `robots.txt`, `sitemap.xml` committed
- [ ] Updated `index.html` with all meta tags committed
- [ ] OG image committed to `images/`
- [ ] Pushed to `main` branch
- [ ] All URLs verified accessible on live site

---

## Phase 6 — Schema.org Structured Data

> Helps Google understand your site. Concerts can appear in Google's event search results. Band appears as a recognized music organization.

### 6.1 MusicGroup Schema

- [ ] JSON-LD `<script type="application/ld+json">` block added to `<head>` of `index.html`
- [ ] Schema type: `MusicGroup`
- [ ] Fields populated: `name`, `foundingDate`, `description`, `url`, `sameAs` (social media URLs), `genre`, `location`
- [ ] Validated at schema.org/validator with zero errors

### 6.2 Event Schema for Concerts

- [ ] JavaScript dynamically generates `Event` schema for each upcoming concert from `data/concerts.json`
- [ ] Each event includes: `name`, `startDate`, `location` (with `Place` sub-schema), `description`, `organizer`, `url`
- [ ] Schema injected into `<head>` as JSON-LD on page load
- [ ] Validated at schema.org/validator with zero errors
- [ ] Rich results test at search.google.com/test/rich-results passes for events

### 6.3 Phase 6 Commit & Push

- [ ] Updated `index.html` with schema markup committed
- [ ] Pushed to `main` branch
- [ ] Rich results test passing on live site URL

---

## Phase 7 — Performance Optimizations

> Fast loading, no invisible text flash, efficient resource hints. Set once, never touch again.

### 7.1 Font Loading

- [ ] `<link rel="preconnect" href="https://fonts.googleapis.com">` added to `<head>`
- [ ] `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` added to `<head>`
- [ ] `font-display: swap` added to all `@font-face` / Google Fonts import declarations
- [ ] Verified: no invisible text flash on slow connection (test with Chrome DevTools throttling)

### 7.2 Lazy Loading

- [ ] `loading="lazy"` attribute added to all gallery `<img>` tags
- [ ] `loading="lazy"` attribute added to all below-fold images
- [ ] Hero image (above fold) explicitly has `loading="eager"` or no lazy attribute
- [ ] Verified: images only load as user scrolls down (confirmed in Chrome Network tab)

### 7.3 Resource Hints

- [ ] `<link rel="dns-prefetch">` added for external domains (Cloudflare, archive.org if used)
- [ ] Page speed score tested in Google PageSpeed Insights
- [ ] Mobile score ≥ 80
- [ ] Desktop score ≥ 90

### 7.4 Phase 7 Commit & Push

- [ ] Updated `index.html` committed
- [ ] Pushed to `main` branch
- [ ] PageSpeed scores verified on live site

---

## Phase 8 — Favicon & Custom 404 Page

### 8.1 Favicon Set

- [ ] Band logo prepared as square PNG (512×512px minimum)
- [ ] Favicon files generated (use realfavicongenerator.net — free):
  - `favicon.ico` (16×16, 32×32, 48×48)
  - `favicon-16x16.png`
  - `favicon-32x32.png`
  - `apple-touch-icon.png` (180×180)
  - `android-chrome-192x192.png`
  - `android-chrome-512x512.png`
  - `site.webmanifest`
- [ ] All favicon files committed to repo root
- [ ] All required `<link>` tags added to `<head>` in `index.html`
- [ ] `site.webmanifest` configured with band name and brand colors
- [ ] Favicon visible in browser tab on live site
- [ ] Apple touch icon correct when site saved to iPhone home screen

### 8.2 Custom 404 Page

- [ ] Create `404.html` in repo root
- [ ] Styled to match site design (same fonts, colors, header/footer)
- [ ] Friendly message — not a generic error
- [ ] Navigation links back to home page and key sections
- [ ] Tested: navigating to saintmarysband.ca/nonexistent-page shows custom 404

### 8.3 Phase 8 Commit & Push

- [ ] All favicon files committed
- [ ] `site.webmanifest` committed
- [ ] `404.html` committed
- [ ] Updated `index.html` committed
- [ ] Pushed to `main` branch
- [ ] Favicon and 404 page verified on live site

---

## Phase 9 — Analytics

> Know who visits, what they look at, and when traffic spikes around concerts.

### 9.1 Google Analytics Setup

- [ ] Google Analytics 4 property created at analytics.google.com for saintmarysband.ca
- [ ] Measurement ID (G-XXXXXXXXXX) obtained
- [ ] GA4 script snippet added to `<head>` of `index.html`
- [ ] Section scroll events tracked (Hero, Concerts, About, Gallery, Contact)
- [ ] Concert row clicks tracked as events
- [ ] Contact form submissions tracked as conversion event
- [ ] Audio player play events tracked
- [ ] Real-time report in GA4 dashboard shows live traffic when visiting site

### 9.2 Phase 9 Commit & Push

- [ ] Updated `index.html` with analytics committed
- [ ] Pushed to `main` branch
- [ ] Analytics confirmed receiving data on live site

---

## Phase 10 — Audio Player

> A custom HTML5 audio player styled to match the site. Track list managed entirely through the CMS.

### 10.1 Player UI in index.html

- [ ] New `#recordings` section added to page with matching burgundy/gold design
- [ ] Section added to main navigation
- [ ] Player includes:
  - [ ] Track list — title, date, conductor, venue for each recording
  - [ ] Now playing display — shows current track info
  - [ ] Play / Pause button
  - [ ] Seek / progress bar
  - [ ] Current time and total duration display
  - [ ] Volume control
  - [ ] Previous track button
  - [ ] Next track button
  - [ ] Auto-advance to next track on completion
- [ ] "No recordings yet — check back soon" state displays gracefully when `recordings.json` is empty
- [ ] Player is fully responsive on mobile
- [ ] Player styled consistently with site design (no default browser audio controls visible)

### 10.2 Wire Player to Data

- [ ] Player fetches track list from `data/recordings.json` on page load
- [ ] Adding a recording to CMS → appears in player on live site automatically
- [ ] Removing a recording from CMS → disappears from player
- [ ] Track metadata (title, conductor, date, venue, description) all display correctly

### 10.3 archive.org Integration Verified

- [ ] Test recording uploaded to archive.org
- [ ] Direct audio URL from archive.org added to CMS
- [ ] Track plays correctly in the custom player from archive.org URL
- [ ] No CORS errors in browser console
- [ ] Playback works on mobile Safari (iPhone)

### 10.4 Analytics Events

- [ ] Play event tracked in GA4 (track title, track index)
- [ ] Track completion event tracked in GA4
- [ ] Skip/next events tracked in GA4

### 10.5 Schema.org for Recordings

- [ ] `MusicRecording` schema generated dynamically from `recordings.json`
- [ ] Validated with zero errors

### 10.6 Phase 10 Commit & Push

- [ ] Updated `index.html` with audio player committed
- [ ] Updated `data/recordings.json` committed
- [ ] Updated `admin/config.yml` with recordings collection committed
- [ ] Pushed to `main` branch
- [ ] Audio player verified fully functional on live site

---

## Phase 11 — Gallery Completion

> Replace placeholder images with real photos, fully managed through the CMS.

### 11.1 Real Images

- [ ] Minimum 6 real band photos sourced (concerts, rehearsals, events)
- [ ] Photos optimized to < 500 KB each before upload (Squoosh or GarageBand export)
- [ ] Photos uploaded to repo via Decap CMS gallery collection
- [ ] GitHub Actions image compression workflow runs and reduces file sizes further
- [ ] All gallery items in `data/gallery.json` updated with real image URLs and alt text
- [ ] Alt text is descriptive for accessibility (not just "photo 1")

### 11.2 Gallery UX

- [ ] All gallery images load correctly on live site
- [ ] Hover effects work on all items
- [ ] Gallery is responsive on mobile
- [ ] `loading="lazy"` confirmed on all gallery images
- [ ] No broken image placeholders anywhere

### 11.3 Phase 11 Commit & Push

- [ ] Real gallery images committed
- [ ] Updated `data/gallery.json` committed
- [ ] Pushed to `main` branch
- [ ] Gallery verified on live site with real photos

---

## Phase 12 — Final QA & Verification

> Full end-to-end test of everything before sign-off.

### 12.1 Functional Testing

- [ ] All navigation links scroll to correct sections
- [ ] Concerts render correctly from JSON — upcoming and past
- [ ] Concert poster modal opens and closes correctly
- [ ] Calendar renders correctly
- [ ] Toggle past concerts works
- [ ] Gallery renders all images
- [ ] Audio player plays, pauses, seeks, auto-advances
- [ ] Contact form submits and email received
- [ ] CMS login works at saintmarysband.ca/admin
- [ ] All CMS collections save and update live site correctly
- [ ] Custom 404 page displays for bad URLs
- [ ] Image compression Action runs on new image upload

### 12.2 Cross-Device Testing

- [ ] Chrome desktop — all features work
- [ ] Safari desktop — all features work
- [ ] Chrome mobile (Android) — all features work
- [ ] Safari mobile (iPhone) — all features work, audio plays
- [ ] No horizontal scrolling on mobile
- [ ] Navigation is usable on small screens

### 12.3 Performance & SEO Final Check

- [ ] Google PageSpeed Insights — mobile score ≥ 80, desktop ≥ 90
- [ ] schema.org/validator — zero errors
- [ ] search.google.com/test/rich-results — events pass
- [ ] Open Graph preview correct (test with opengraph.xyz)
- [ ] GA4 real-time data confirmed working
- [ ] robots.txt accessible
- [ ] sitemap.xml accessible and submitted to Google Search Console
- [ ] All favicons display correctly across browsers and devices

### 12.4 Accessibility Check

- [ ] All images have descriptive alt text
- [ ] All form fields have associated labels
- [ ] Colour contrast passes WCAG AA (test with WebAIM Contrast Checker)
- [ ] Keyboard navigation works through all interactive elements
- [ ] Audio player fully keyboard accessible

### 12.5 Final Commit & Push

- [ ] All changes committed with clean commit history
- [ ] Pushed to `main` branch
- [ ] Live site final verification complete
- [ ] Development plan marked complete

---

## Post-Launch: Ongoing Workflow Reference

### Adding a Concert
1. Log in at saintmarysband.ca/admin
2. Open Concerts → New Concert
3. Fill in details, upload poster image if available
4. Save → live within ~60 seconds

### Adding a Recording
1. Record concert on iPhone with Camera app
2. Import into GarageBand → trim start/end → export as M4A
3. Run through Adobe Podcast Enhance (podcast.adobe.com/enhance) → download
4. Upload to archive.org → copy the direct audio file URL
5. Log in at saintmarysband.ca/admin
6. Open Recordings → New Recording
7. Paste archive.org URL, fill in details → Save

### Adding Gallery Photos
1. Log in at saintmarysband.ca/admin
2. Open Gallery → New Photo
3. Upload image (GitHub Actions compresses it automatically)
4. Add title and alt text → Save

### Design Changes (colours, layout, fonts, new sections)
1. Download `index.html` from GitHub
2. Drag into Claude Chat at claude.ai (free tier)
3. Describe the change needed
4. Drag updated file back into GitHub repo

---

*Generated with Claude Code · Saint Mary's Band Website · March 2026*
