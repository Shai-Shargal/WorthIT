# Phase 2 Daily Async Standup Format

**Purpose:** Keep team async-coordinated without meetings  
**Cadence:** Daily updates (evening), Assistant reviews next morning  
**Channel:** `#worthit-dev` Slack (threaded under pinned standup message)  
**Audience:** All agents + You

---

## Daily Standup Schedule

**5:00 PM:** Each agent posts their standup  
**9:00 AM (Next Day):** Assistant reviews, posts decisions/unblocks  
**10:00 AM:** Agents proceed with unblocked work

---

## Standup Template for Each Agent

### 🔵 Backend Agent Daily Standup

**Format:** Post this to Slack daily (copy-paste the template, fill in your day)

```
🔵 BACKEND STANDUP - [DATE]

✅ COMPLETED TODAY
- [What did you finish?]
- [Any PRs merged?]
- [Any blockers cleared?]

⏳ TODAY'S FOCUS
- [What are you working on right now?]
- [Est. completion time?]

🚧 BLOCKED BY
- [ ] [Blocker] — waiting on [Owner] for [what]
- [ ] [None] — unblocked and moving fast

❓ QUESTIONS FOR PRODUCT
- [Any clarifications needed on specs?]
- [Any architectural trade-offs to discuss?]

📊 METRICS
- [Lines of code changed?] / [Files touched?]
- [Test coverage impact?]
- [Any performance concerns?]

**Next 24h:** [What's the plan for tomorrow?]
```

**Slack Post Example:**
```
🔵 BACKEND STANDUP - 2026-06-23

✅ COMPLETED TODAY
- Yad2 scraper DOM selectors complete (extracts 80% of data)
- Tested against 10 real Yad2 listings
- Marketplace abstraction interface designed

⏳ TODAY'S FOCUS
- Implementing IMarketplaceExtractor for Facebook refactor
- Building MarketplaceExtractorFactory

🚧 BLOCKED BY
- [ ] Product — seller intelligence API contract (needed by tomorrow 9am)
- [ ] Product — price intelligence algorithm (needed by Wed)

❓ QUESTIONS FOR PRODUCT
- Should seller data come from DB history or live profile scrape? Impacts latency.

📊 METRICS
- +240 lines code (marketplace abstraction + Yad2 extractor start)
- 2 files refactored
- No perf concerns yet

**Next 24h:** Finish IMarketplaceExtractor impl, start feature integration prep
```

---

### 🟢 Product Agent Daily Standup

**Format:** Post this to Slack daily

```
🟢 PRODUCT STANDUP - [DATE]

✅ COMPLETED TODAY
- [What specs did you finalize?]
- [Any feature designs validated?]
- [Feedback from Backend/QA addressed?]

⏳ TODAY'S FOCUS
- [What are you designing/speccing now?]
- [Which feature type?]

🚧 BLOCKED BY
- [ ] [Blocker] — waiting on [Owner] for [what]
- [ ] [None] — moving forward

❓ QUESTIONS FOR BACKEND
- [Any implementation concerns?]
- [Architectural trade-offs?]

❓ QUESTIONS FOR QA
- [How will you test this feature?]
- [Any data/setup needs?]

📊 METRICS
- [Specs completed?] / [Specs in draft?]
- [Feedback incorporated from last review?]

**Next 24h:** [What's the plan for tomorrow?]
```

**Slack Post Example:**
```
🟢 PRODUCT STANDUP - 2026-06-23

✅ COMPLETED TODAY
- Seller intelligence spec v1 done (name + rating + trust score)
- Price intelligence spec v2 (feedback from Backend incorporated)
- Verdict algorithm skeleton (how to weight 4 features)

⏳ TODAY'S FOCUS
- Listing intelligence spec (red flags + age + missing items)
- Market intelligence spec (demand signal + supply saturation)

🚧 BLOCKED BY
- [ ] You (Founder) — confirm all 4 features or prioritize?
- [ ] Backend — seller data feasibility (profile scrape vs history) — WIP, unblocks me Wed

❓ QUESTIONS FOR BACKEND
- Seller data source: can we scrape profile in < 500ms latency? Or use history?

❓ QUESTIONS FOR QA
- How many real Yad2 listings do we need for accuracy testing? 50? 100?

📊 METRICS
- 2/4 feature specs complete
- 1/4 in progress
- 1/4 not started yet

**Next 24h:** Finish all 4 feature specs, get Backend feedback on data feasibility
```

---

### 🟡 QA Agent Daily Standup

**Format:** Post this to Slack daily

```
🟡 QA STANDUP - [DATE]

✅ COMPLETED TODAY
- [What test plans did you draft?]
- [Any test data prepared?]
- [Issues found in Phase 1 regression?]

⏳ TODAY'S FOCUS
- [What test suite are you building now?]
- [Which feature type?]

🚧 BLOCKED BY
- [ ] [Blocker] — waiting on [Owner] for [what]
- [ ] [None] — moving forward

❓ QUESTIONS FOR PRODUCT
- [What's the acceptance criteria for this feature?]
- [How accurate is "accurate enough"?]

❓ QUESTIONS FOR BACKEND
- [When can I get test builds?]
- [Any new test data needs?]

📊 METRICS
- [Test cases written?]
- [Phase 1 regression coverage?]
- [E2E test data ready?]

**Next 24h:** [What's the plan for tomorrow?]
```

**Slack Post Example:**
```
🟡 QA STANDUP - 2026-06-23

✅ COMPLETED TODAY
- Phase 1 regression test suite updated (all 183 tests still passing)
- Seller intelligence test plan draft (happy path + edge cases)
- E2E test data: 20 real Facebook listings prepped

⏳ TODAY'S FOCUS
- Price intelligence test plan (accuracy benchmarks)
- Yad2 E2E test data prep (need 50 real listings)

🚧 BLOCKED BY
- [ ] Product — feature acceptance criteria (blocked until specs finalized)
- [ ] Backend — Yad2 scraper stable enough for E2E (Est. unblock Wed)

❓ QUESTIONS FOR PRODUCT
- Is "good enough" for seller trust score 85% accuracy? Or 95%?
- What's the acceptance criteria for price comparison accuracy?

❓ QUESTIONS FOR BACKEND
- Can I get test build tomorrow for manual E2E testing?

📊 METRICS
- 1/4 test plans complete
- 183 Phase 1 tests passing
- 0 P0/P1 bugs found

**Next 24h:** Finish price + listing test plans, begin market intelligence test design
```

---

### 🔴 Assistant (Tech Lead) Daily Review

**Format:** You don't post daily, but review all three standups at 9am and reply with:

```
🔴 ASSISTANT REVIEW - [DATE]

✅ BLOCKERS RESOLVED TODAY
- [What did we unblock?]
- [Who needed to move?]

⏳ ACTIVE BLOCKERS (Still Waiting)
- Backend waiting on: [Product decision by when?]
- Product waiting on: [You confirmation by when?]
- QA waiting on: [Backend delivery by when?]

📋 DECISIONS MADE
- [Decision 1:] [Your call + reasoning]
- [Decision 2:] [Confirmed from above]

🚨 CONFLICTS (If Any)
- [If two agents want something different, flag here]
- [Your decision + why]

🎯 NEXT 24H PRIORITIES
1. [Unblock Backend by doing X]
2. [Confirm with Product on feature Y]
3. [Get Backend build to QA by EOD]

**Slack Note:** [Public message to all agents summarizing key decisions]
```

**Slack Post Example:**
```
🔴 ASSISTANT REVIEW - 2026-06-24

✅ BLOCKERS RESOLVED TODAY
- (none yet — first day)

⏳ ACTIVE BLOCKERS (Still Waiting)
- Backend blocked: Product needs to deliver API contract by EOD today ← CRITICAL PATH
- Product blocked: You (Founder) need to confirm Decision 3 (all 4 features?) by this afternoon
- QA blocked: Backend needs to ship first Yad2 scraper test build by Wed morning

📋 DECISIONS MADE TODAY
- Decision 3 (All 4 Features): PENDING — waiting on your input (see DM)
- Decision 5 (Test Coverage): PENDING — waiting on QA + your input
- Decision 6 (Seller Data): PENDING — Backend to assess by Wed

🚨 CONFLICTS
- (none yet)

🎯 NEXT 24H PRIORITIES
1. **URGENT:** Confirm Decision 3 by 2pm (all 4 features or prioritize?) → unblocks Product
2. Get Backend to share API contract with Product by EOD → unblocks Backend refactoring
3. QA to finalize test plan scope once features confirmed

---

**@backend** Your API contract is critical path — can you share design doc by 5pm today?
**@product** Waiting on Founder decision on feature scope — will confirm AM.
**@qa** Unblocked to start Phase 1 regression expansion once specs finalize.
**@founder** DM sent with Decision 3 options — need your call by 2pm.
```

---

## Weekly Recap (Friday)

**Time:** Every Friday, 5pm  
**Post in Slack:** Thread under "#worthit-dev weekly-recap"  
**Format:** Each agent posts what shipped, what's next, surprises

### Weekly Recap Template

```
📅 PHASE 2 WEEKLY RECAP - Week [#] (Dates)

🎯 WHAT WE SHIPPED THIS WEEK
- [Feature shipped?]
- [Refactor done?]
- [Tests added?]

📊 METRICS
- [Lines of code?]
- [Test coverage?]
- [Features complete?]

🚀 WHAT'S NEXT WEEK
- [Priority 1?]
- [Priority 2?]
- [Timeline?]

⚠️ SURPRISES / LEARNINGS
- [Anything unexpected?]
- [Anything we learned that changes the plan?]

🚧 STILL BLOCKED
- [Any lingering blockers?]
- [When will they unblock?]
```

**Assistant Weekly Recap (You):**

```
📅 PHASE 2 WEEKLY RECAP - Week 1 (Jun 23-28)

🎯 WHAT WE SHIPPED THIS WEEK
- Yad2 scraper 80% working (Backend)
- Seller + Price intelligence specs finalized (Product)
- Phase 1 regression test suite validated (QA)

📊 METRICS
- 240 lines marketplace abstraction code
- 4 feature specs drafted
- 0 P0 bugs introduced

🚀 WHAT'S NEXT WEEK
- Backend: IMarketplaceExtractor refactoring (finish Facebook extract first)
- Product: Finalize verdict algorithm
- QA: Build seller intelligence test suite

⚠️ SURPRISES
- Yad2 DOM much simpler than expected → ahead of schedule
- Seller profile scraping may be slower than history method → trade-off to assess next week

🚧 STILL BLOCKED
- (none) — all cleared this week

**Team Status:** On track for Stage 1 completion by [DATE]
```

---

## Slack Channel Setup

Create or use:
- **#worthit-dev** — all standups + decisions go here
- **Pin the standup template** so agents can copy-paste daily
- **Use threads** to keep conversations organized
- **Tag Assistant** when blocked or need decision

---

## Response SLA

| Situation | Response Time |
|-----------|---------------|
| Agent blocked (🔴) | Within 2 hours |
| Normal standup review | Next morning (9am) |
| Weekly recap | Friday evening |
| Decision needed | Same day or next morning |
| Critical blocker (impacts launch) | ASAP (Slack ping) |
