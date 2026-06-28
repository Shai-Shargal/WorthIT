# WorthIT — Product Roadmap

**Goal:** Turn WorthIT from a dev tool into a real product that demonstrates AI engineering excellence.  
**North star metric:** Verdict accuracy rate (confirmed by users via thumbs up/down).

---

## Phase 1 — Trust & Accuracy (Month 1)

> Can't improve what you can't measure. Ship the feedback loop first.

### Task 1: Verdict Feedback Button
**Goal:** Know if the algorithm is right.  
**What:** Thumbs up / thumbs down in the popup overlay after verdict is shown.  
**Backend:** `POST /analysis/:id/feedback` → stores `{ helpful: boolean }` on the Analysis doc.  
**Extension:** Add feedback row below confidence bar. Fire-and-forget POST, no loading state.  
**Acceptance criteria:**
- [ ] Feedback stored on Analysis model in MongoDB
- [ ] Thumbs up/down visible in popup after verdict
- [ ] Works anonymously (no auth required)
- [ ] QA: submit feedback, verify in DB

### Task 2: "What we analyzed" Debug Row
**Goal:** Let users verify the AI saw the right data.  
**What:** Collapsible row in popup showing extracted specs, description snippet, market source.  
**Example:** `Specs: 16GB RAM · 512GB SSD · i7 | Desc: "MacBook Pro 13', 2018..." | Market: 17 pts · Tavily`  
**Acceptance criteria:**
- [ ] Shows extracted specs (or "none" for non-tech)
- [ ] Shows first 80 chars of description (or "none")
- [ ] Shows observation count + source (DB / Tavily / web)
- [ ] Collapsible — not visible by default
- [ ] QA: analyze a tech listing and a non-tech listing, verify correct data shown

### Task 3: Chrome Web Store Publish (Unlisted)
**Goal:** Real install URL to share with 10 test users.  
**What:** Prep the extension for store submission.  
**Steps:**
- [ ] Write privacy policy (what data is stored, what isn't)
- [ ] Create store screenshots (5 required)
- [ ] Write store description (Hebrew + English)
- [ ] Bump manifest version to 1.0.0
- [ ] Submit as unlisted
- [ ] QA: fresh install from store link, verify analyze works end-to-end

### Task 4: Share With 10 Real Users
**Goal:** First external feedback before building more features.  
**What:** Send install link to 10 people who buy second-hand in Israel.  
**Steps:**
- [ ] WhatsApp message with install link + 1-line instructions
- [ ] Ask them to report: product they analyzed, verdict, was it right?
- [ ] Collect feedback for 2 weeks
- [ ] No new features until feedback is analyzed

---

## Phase 2 — Scale (Month 2)

> Once the algorithm is trusted, expand where it works.

### Task 5: Yad2 Extractor
**Goal:** Double the addressable market — Yad2 is bigger than FB for serious second-hand in Israel.  
**What:** Extension detects yad2.co.il item pages, extracts title/price/description.  
**Files:**
- `extension/src/marketplace/providers/yad2/Yad2ItemExtractor.ts` (new)
- Update `detectPageType()` to include yad2 item URLs
- Update `extractActiveListing()` to route to Yad2 extractor  
**Acceptance criteria:**
- [ ] Detects `yad2.co.il/item/` pages
- [ ] Extracts correct title, price (ILS), description
- [ ] Analyze button works on Yad2 item pages
- [ ] Unit tests for Yad2 URL detection + extraction
- [ ] QA: analyze 5 Yad2 listings, verify correct data

### Task 6: Analyses History in Popup
**Goal:** Users can see past verdicts without re-analyzing.  
**What:** "History" tab in popup showing last 10 analyses from `chrome.storage.local`.  
**Storage:** Save analysis result to `chrome.storage.local` on each successful analyze.  
**UI:** Simple list: title · verdict badge · price · date. Click to re-open overlay.  
**Acceptance criteria:**
- [ ] Last 10 analyses stored locally (no auth required)
- [ ] History tab visible in popup
- [ ] Click on history item shows verdict overlay
- [ ] Clears after 30 days
- [ ] QA: analyze 3 listings, verify all 3 appear in history

### Task 7: Landing Page
**Goal:** When someone hears about WorthIT and Googles it, something exists.  
**What:** Single-page site with demo video, Chrome install button, tagline.  
**Stack:** Simple HTML/CSS or Next.js on Vercel.  
**Content:**
- Headline: "Is this listing worth it?" 
- 30-second screen recording demo
- Install from Chrome Web Store button
- How it works (3 steps)
- "Made in Israel 🇮🇱"
**Acceptance criteria:**
- [ ] Live at a real domain (worthit.app or similar)
- [ ] Works on mobile (people share links from phone)
- [ ] Chrome install button works
- [ ] QA: open on mobile, verify layout

---

## Phase 3 — Credibility (Month 3)

> Show the system works. Build the portfolio artifact.

### Task 8: Accuracy Dashboard (Internal)
**Goal:** Track verdict accuracy over time. Know when algo improves or regresses.  
**What:** Simple internal page at `/admin/accuracy` (password protected).  
**Metrics:** Total analyses, thumbs up %, by category (tech / non-tech), by source (DB / Tavily).  
**Acceptance criteria:**
- [ ] Accuracy rate visible (% confirmed correct by users)
- [ ] Breakdown by product category
- [ ] Breakdown by data source
- [ ] Password protected (not public)
- [ ] QA: generate 10 analyses + feedback, verify dashboard shows correct %

### Task 9: Technical README + Architecture Writeup
**Goal:** Portfolio artifact. Anyone reading the repo should understand the system in 5 minutes.  
**What:** `README.md` at repo root with:
- What it does (one paragraph)
- System architecture diagram
- AI pipeline explanation (price gathering → specs → verdict)
- Tech stack
- How to run locally
- Challenges solved (Hebrew NLP, Facebook DOM, cold-start MongoDB)  
**Acceptance criteria:**
- [ ] Architecture diagram (can be ASCII or Mermaid)
- [ ] AI pipeline documented
- [ ] Setup instructions work for a fresh clone
- [ ] QA: someone who didn't build it can set it up in < 20 min

### Task 10: Evaluation Dataset
**Goal:** 50 labeled listings for offline testing. Catch regressions without manual testing.  
**What:** JSON file with 50 listings (title, price, description, ground truth verdict).  
**Sources:** Real listings you've analyzed + user feedback.  
**Use:** Run against current prompt, measure accuracy, compare after prompt changes.  
**Acceptance criteria:**
- [ ] 50 labeled examples (min 10 tech, 10 non-tech, 10 bundles, 10 edge cases)
- [ ] Automated test runner compares AI output to ground truth
- [ ] Baseline accuracy recorded
- [ ] QA: run eval, confirm baseline % is documented

---

## Phase 4 — Business (Month 4)

> When the product works and people trust it, add the business layer.

### Task 11: Price Drop Alerts
**Goal:** Passive value — users get notified when a listing they viewed drops in price.  
**What:** Extension saves listing URL on analyze. Backend polls Yad2/FB periodically. Sends push/email on drop.  
**Acceptance criteria:**
- [ ] User can "watch" a listing from the popup
- [ ] Backend checks price every 24h
- [ ] Email notification on price drop > 5%
- [ ] QA: manually update a test listing price, verify notification fires

### Task 12: Free/Pro Quota Enforcement
**Goal:** Monetization layer.  
**What:** Free tier: 15 analyses/month. Pro tier: unlimited + alerts + history.  
**Auth required:** Yes — wire Google sign-in (JWT scaffolding already built).  
**Pricing:** ~₪20/month or $5/month.  
**Acceptance criteria:**
- [ ] Free users hit quota at 15 and see upgrade prompt
- [ ] Pro users have unlimited access
- [ ] Payment via Stripe or Paddle
- [ ] QA: exhaust free quota, verify upgrade flow works

### Task 13: Chrome Web Store Public Listing
**Goal:** Organic discovery.  
**What:** Promote from unlisted to public. Submit for review.  
**Requires:** Task 3 (unlisted) done + privacy policy live + landing page (Task 7) live.  
**Acceptance criteria:**
- [ ] Public listing approved by Chrome Web Store
- [ ] First 50 organic installs within 30 days
- [ ] QA: fresh install from public listing, full flow works

---

## QA Protocol

After every completed task:
1. Run `npm test` — all tests must pass
2. Run `npm run typecheck` — clean
3. Rebuild extension bundle
4. Manual test: analyze 2 real listings
5. Check production `/health` — DB connected
6. Tag task as QA-approved before moving to next

---

## Success Metrics (6-month targets)

| Metric | Target |
|---|---|
| Verdict accuracy (user-confirmed) | ≥ 75% |
| Weekly active users | 100+ |
| Chrome Web Store installs | 500+ |
| Supported marketplaces | Facebook + Yad2 |
| Pro tier subscribers | 20+ |

---

*Last updated: 2026-06-28*
