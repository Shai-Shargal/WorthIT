# Phase 2 Team Structure & Quick Reference

**Effective Date:** 2026-06-23  
**Team:** Backend Agent | Product Agent | QA Agent | Assistant (You)  
**Goal:** Ship feature depth (4 intelligence types) + Yad2 marketplace coverage

---

## 📋 Documents You Need

| Document | Purpose | Owner | Frequency |
|----------|---------|-------|-----------|
| **PHASE_2_BLOCKERS.md** | Track what's blocking each agent | All agents daily | Daily updates |
| **PHASE_2_DECISIONS.md** | Lock strategic decisions to avoid re-debating | Assistant | Once, review if needed |
| **PHASE_2_OWNERSHIP.md** | Define who owns what (Product/Backend/QA/Assistant roles) | All agents | Reference as needed |
| **PHASE_2_STANDUPS.md** | Daily standup format + weekly recap template | All agents | Daily + Friday |
| **PHASE_2_WORKFLOW.md** | How code moves Dev → QA → Staging → Production | Backend + QA | Reference on PR |
| **PHASE_2_README.md** | This file — quick reference for everything | You | Bookmark it |

---

## 🚀 Getting Started

### For Each Agent

**Backend Agent:**
1. Read PHASE_2_DECISIONS.md (Decisions 1-4 about architecture)
2. Read PHASE_2_OWNERSHIP.md (your responsibilities)
3. Start with: Yad2 scraper + marketplace abstraction refactoring
4. Daily: Update PHASE_2_BLOCKERS.md, post standup to Slack

**Product Agent:**
1. Read PHASE_2_DECISIONS.md (Decisions 2-3 about scope + features)
2. Read PHASE_2_OWNERSHIP.md (your responsibilities)
3. Start with: Finalize all 4 feature specs
4. Daily: Update PHASE_2_BLOCKERS.md, post standup to Slack

**QA Agent:**
1. Read PHASE_2_DECISIONS.md (Decision 5 about test coverage)
2. Read PHASE_2_OWNERSHIP.md (your responsibilities)
3. Start with: Phase 1 regression testing + feature test planning
4. Daily: Update PHASE_2_BLOCKERS.md, post standup to Slack

**You (Assistant):**
1. Read PHASE_2_OWNERSHIP.md (your role + decision authority)
2. Read PHASE_2_STANDUPS.md (how to run reviews + make decisions)
3. Read PHASE_2_WORKFLOW.md (how to review PRs)
4. Daily: Read standups at 9am, post decisions
5. Weekly: Friday recap + assess Stage 1 progress

---

## 📅 Daily Rhythm

```
┌─────────────────────────────────────────────────────────────────────┐
│ AGENT DAILY WORKFLOW                                                │
└─────────────────────────────────────────────────────────────────────┘

5:00 PM — Each Agent Posts Standup
├─ Backend: what shipped, what's next, what's blocked?
├─ Product: specs done, designs reviewed, blockers?
├─ QA: tests written, issues found, blockers?
└─ (Copy template from PHASE_2_STANDUPS.md)

9:00 AM (Next Day) — Assistant Reviews & Responds
├─ Read all 3 standups
├─ Spot blockers + conflicts
├─ Post decisions + unblocks to Slack
└─ Tag agents if decisions affect them

10:00 AM — Agents Proceed
├─ Backend implements per yesterday's decision
├─ Product designs per yesterday's feedback
├─ QA tests per feature specs
└─ (Loop repeats)

Anytime — Blockers Surface Immediately
├─ If you're blocked and it's > 2 hours, ping @assistant
├─ If you're conflicted with another agent, escalate
├─ If you found a bug/risk, flag it
└─ Don't wait for daily standup if urgent
```

---

## 🎯 Weekly Rhythm

```
┌─────────────────────────────────────────────────────────────────────┐
│ FRIDAY 5 PM — WEEKLY RECAP                                          │
└─────────────────────────────────────────────────────────────────────┘

Each Agent Posts (Template in PHASE_2_STANDUPS.md):
├─ What we shipped this week
├─ Metrics (lines of code, tests, features complete)
├─ What's next week
├─ Surprises / learnings
└─ Status: on track / at risk / blocked?

Assistant Posts:
├─ What we accomplished toward Phase 2 goal
├─ Blockers resolved
├─ Stage progress (Stage 1 completion %)
├─ Risks or changes needed
└─ Priorities for next week
```

---

## 🔓 Unblocking Rules

**If you're blocked:**

1. **Check PHASE_2_BLOCKERS.md:** Is this already tracked?
2. **Wait 24h:** Maybe the owner is busy, will respond tomorrow
3. **Post to Slack:** "I'm blocked on [X], need [Y] from [Owner] — ping @[owner]"
4. **If still blocked > 24h:** "@assistant can you unblock this?"

**If Assistant (you) is needed:**

1. **Priority:** P0 (critical path) vs P1 (important) vs P2 (nice to have)
2. **Response time:**
   - P0 (blocks launch): 2 hours
   - P1 (blocks agent work): next morning
   - P2 (nice to have): next day
3. **Decision:** Post to Slack so all agents know

---

## 🚨 Red Flags (Escalate Immediately)

If any of these happen, **ping @assistant immediately** (don't wait for daily standup):

- ❌ "This feature is not technically possible" (feasibility blocker)
- ❌ "Quality issue that could break users" (security/data loss risk)
- ❌ "Timeline slipping by > 1 week" (schedule risk)
- ❌ "Two agents fundamentally disagree on approach"
- ❌ "We need to cut scope to hit timeline"
- ❌ "Found a Phase 1 regression" (quality regression)
- ✅ "Can't decide between Option A and B" (normal — post to Slack)
- ✅ "Need clarification on requirement" (normal — ask Product)

---

## 📊 Phase 2 Success Metrics

**Stage 1 (Yad2 Scraper + Features on Facebook):**
- ✅ Yad2 scraper extracts 95%+ of listings
- ✅ All 4 features working on Facebook (seller, price, listing, market)
- ✅ 250+ tests written (unit + integration + E2E)
- ✅ 85%+ code coverage
- ✅ < 5s end-to-end analysis time
- ✅ Zero P0 bugs

**Stage 2 (Features Ported to Yad2):**
- ✅ All 4 features working on Yad2
- ✅ Marketplace abstraction tested with both extractors
- ✅ 300+ tests total
- ✅ Backward-compatible (Facebook still works the same)

**Overall:**
- ✅ All 4 agent standups posted daily
- ✅ Blockers < 24h to unblock
- ✅ Merge within 2 days of PR open
- ✅ Zero rework due to missed requirements

---

## 🔑 Key Decisions (Already Locked)

| Decision | Choice | Owner |
|----------|--------|-------|
| Yad2 Integration | DOM scraping | Backend |
| Feature Rollout | Approach C (Yad2 + Features parallel) | Assistant |
| Marketplace Pattern | Factory + Adapter | Backend |
| eBay/Amazon | Phase 3 | Assistant |

**Open Decisions (Need Your Input):**
- ❓ All 4 features in Phase 2 or prioritize? → Decision 3
- ❓ Test coverage target (85% / 70% / pragmatic)? → Decision 5
- ❓ Seller data source (scrape / history / hybrid)? → Decision 6

**Action:** Reply with answers, I'll lock these.

---

## 📞 How to Reach Each Agent

**Backend Agent (@backend):**
- Architecture questions, implementation details, API contracts
- Slack tag: `@backend`
- Standup time: 5pm daily

**Product Agent (@product):**
- Feature specs, requirements, acceptance criteria
- Slack tag: `@product`
- Standup time: 5pm daily

**QA Agent (@qa):**
- Test strategy, quality gates, accuracy standards
- Slack tag: `@qa`
- Standup time: 5pm daily

**You (Assistant) (@assistant):**
- Strategic decisions, blockers, conflicts, unblocking
- Slack tag: `@assistant` or DM
- Review time: 9am daily

---

## 📚 Document Map

```
docs/
├── PHASE_2_README.md ...................... You are here
├── PHASE_2_BLOCKERS.md .................... Daily blocker tracking
├── PHASE_2_DECISIONS.md ................... Locked strategic decisions
├── PHASE_2_OWNERSHIP.md ................... Roles + accountability
├── PHASE_2_STANDUPS.md .................... Daily standup templates
├── PHASE_2_WORKFLOW.md .................... PR → Merge → Deploy flow
│
├── [Design Docs — created as features designed]
│   ├── seller-intelligence-spec.md
│   ├── price-intelligence-spec.md
│   ├── listing-intelligence-spec.md
│   └── market-intelligence-spec.md
│
└── [Architecture Docs — created as code evolves]
    ├── marketplace-abstraction.md
    ├── yad2-scraper.md
    └── feature-engine.md
```

---

## ✅ Quick Checklist: Ready to Go?

Before you start Phase 2, confirm:

- [ ] All 4 agents have read PHASE_2_OWNERSHIP.md
- [ ] Backend has read PHASE_2_DECISIONS.md (Decisions 1-4)
- [ ] Product has read PHASE_2_DECISIONS.md (Decisions 2-3)
- [ ] QA has read PHASE_2_DECISIONS.md (Decision 5)
- [ ] You (Assistant) have confirmed open decisions (3, 5, 6)
- [ ] Slack channels created + standups pinned
- [ ] PR template added to `.github/pull_request_template.md`
- [ ] All documents committed to git

**Once locked in:** Agents start their work streams simultaneously.

---

## 🎓 Glossary

- **Blocker:** Something preventing an agent from proceeding (waiting on another agent, missing info, infeasible requirement)
- **Decision:** A choice between options, locked once made, re-opened only if new info surfaces
- **PR:** Pull request — proposed code change that goes through review → QA → merge → deploy
- **Standup:** Short daily status update (what shipped, what's next, what's blocked)
- **Unblock:** Remove a blocker so agent can proceed
- **Trade-off:** Accept one negative to gain one positive (e.g., accept 2s latency to ship faster)
- **Architecture Review:** Assistant checks design is clean + tests are good
- **QA Review:** QA Agent checks tests are thorough + feature works correctly
- **Smoke Tests:** Quick sanity checks (does the basic thing work?)

---

## 🚀 Ready?

**Next steps:**

1. ✅ Read this README (you're doing it!)
2. ✅ Confirm open decisions (Decisions 3, 5, 6)
3. ✅ Post Slack message: "Phase 2 team structure locked, agents start tomorrow 9am"
4. ✅ Agents read their ownership docs + start standups
5. ✅ Your morning 9am review of first day standups

**Questions?** Check PHASE_2_OWNERSHIP.md (roles) or PHASE_2_STANDUPS.md (process).

**Let's ship Phase 2! 🚀**
