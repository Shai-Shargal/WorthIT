# Phase 2 Development Workflow

**Purpose:** Define how code moves from development → testing → production  
**Process:** Agent → Slack → Review → QA → Merge → Deploy

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2 CODE WORKFLOW                                                       │
└─────────────────────────────────────────────────────────────────────────────┘

Agent (Backend/Product/QA)
    ↓ [1. Code Ready]
    ├─ Slack Announcement: "PR ready for review"
    ├─ Add to PR with Checklist: "[Design] [Tests] [Docs] [Perf]"
    │
    ↓ [2. Assistant Review] (within 2 hours)
    ├─ Check: architecture alignment, design doc link, test coverage
    ├─ Approve or Request Changes
    │
    ↓ [3a. If Changes Needed]
    ├─ Agent revises code + pushes new commits
    ├─ Re-request review
    ├─ Back to Step 2
    │
    ↓ [3b. If Approved]
    ├─ Slack: "Architecture review passed ✅"
    │
    ↓ [4. QA Testing] (within 24 hours)
    ├─ QA checks test coverage + runs manual tests
    ├─ Approves or requests test improvements
    │
    ↓ [5a. If Test Gaps]
    ├─ Backend adds tests + QA re-reviews
    │
    ↓ [5b. If QA Approves]
    ├─ Slack: "QA review passed ✅"
    │
    ↓ [6. Merge]
    ├─ Backend merges to main
    ├─ CI/CD runs (tests + build)
    │
    ↓ [7. Deploy]
    ├─ If all tests pass: auto-deploy to staging
    ├─ QA smoke tests staging
    │
    ↓ [8. Ready for Production]
    ├─ When safe, prod deploy (manual approval by Assistant)
    │
```

---

## Step-by-Step Process

### [1] Code Ready: Agent Announces on Slack

**When:** Agent finishes code, pushes to feature branch, opens PR

**Where:** `#worthit-dev` Slack channel

**Message Template:**
```
🔵 [PR Ready] [Component Name]

**What:** [1-line summary of what this PR does]

**Link:** [GitHub PR URL]

**Checklist:**
- [ ] Linked to PHASE_2_DECISIONS.md (or PHASE_2_BLOCKERS.md if relevant)
- [ ] Design doc link in PR description (if architecture change)
- [ ] Tests written (unit + integration)
- [ ] No performance regressions
- [ ] Code comments for complex logic
- [ ] Ready for Assistant review

**Notes:** [Any gotchas, trade-offs, or context for reviewers?]

@assistant ready for architecture review
```

**Example PR Announcement:**
```
🔵 [PR Ready] Marketplace Abstraction Layer

**What:** Refactors Facebook extractor into IMarketplaceExtractor interface, adds Yad2 implementation

**Link:** https://github.com/worthit/worthit/pull/142

**Checklist:**
- [x] Linked to Decision 4 in PHASE_2_DECISIONS.md
- [x] Architecture doc in backend/docs/marketplace-abstraction.md
- [x] 15 new unit tests (extractor pattern + factory)
- [x] Integration test: both extractors work end-to-end
- [x] No latency regression (< 100ms overhead)
- [x] Documented IMarketplaceExtractor interface
- [x] Ready for review

**Notes:** Yad2 scraper is 80% feature-complete but DOM selectors may break if Yad2 redesigns (acceptable per Decision 1 trade-offs).

@assistant @qa ready for review
```

---

### [2] Assistant Architecture Review (within 2 hours)

**Owner:** You (Assistant)

**When:** Morning standup or ASAP if urgent

**Checklist:**
- ✅ Does this align with PHASE_2_DECISIONS.md?
- ✅ Is the architecture clean (SOLID, separation of concerns)?
- ✅ Is the design doc clear?
- ✅ Are tests adequate (not just coverage, but quality)?
- ✅ Any performance concerns?
- ✅ Are dependencies well-managed?
- ✅ Is this ready for QA to test?

**Slack Reply (Approve):**
```
✅ Architecture Review: APPROVED

**Strengths:** [What's good about this]
**Minor notes:** [Any suggestions, non-blocking]
**For QA:** [Things QA should pay special attention to]

Moving to @qa for testing.
```

**Example Approval:**
```
✅ Architecture Review: APPROVED

**Strengths:** 
- Clean factory pattern, easy to add new marketplaces
- Good separation of concerns (extractors vs. feature engine)
- Backward-compatible with existing code

**Minor notes:** 
- Consider caching extractor instances if many instantiations
- Document fallback if Yad2 selectors break

**For QA:** 
- Test both extractors work correctly
- Check latency didn't regress on Facebook path
- Edge case: what happens if URL matches both Facebook + Yad2? (shouldn't happen but worth testing)

@qa ready for testing.
```

**Slack Reply (Request Changes):**
```
🔄 Architecture Review: CHANGES REQUESTED

**Issues:**
1. [Issue 1 + why it matters]
2. [Issue 2 + severity]

**Suggestions:**
- [Specific suggestion for fix]

**Blocker?** [Yes/No/Depends]

Please revise and re-request review.
```

**Example Change Request:**
```
🔄 Architecture Review: CHANGES REQUESTED

**Issues:**
1. **[Blocker]** Circular dependency: IMarketplaceExtractor imports FeatureEngine, but FeatureEngine imports extractors. Need to break this.
   - Fix: Move FeatureEngine outside extractor imports, inject extractor as parameter

2. **[Non-blocker]** Error handling: what if Yad2 selector fails to extract price? Code doesn't handle it gracefully.
   - Fix: Add fallback to Tavily-only if extraction fails

**Suggestions:**
- Add a "validateExtraction()" method to catch incomplete data before feature engine processes

Please revise and re-request review. Blocker must be fixed before QA can test.
```

---

### [3a] Agent Revises & Re-Requests Review

**When:** Agent gets change requests, revises code, pushes new commits

**Slack Message:**
```
🔵 [PR Updated] [Component Name]

Addressed review feedback:
- Fixed circular dependency ✓
- Added fallback extraction ✓
- Added validateExtraction() ✓

Ready for re-review.

@assistant
```

**Then:** Back to Step 2 (Assistant reviews again)

---

### [3b] Approved → QA Handoff

**When:** Assistant approves the architecture

**Slack Message (from Assistant):**
```
✅ Architecture review passed

@qa ready for testing. Focus on: [specific areas]
```

---

### [4] QA Testing (within 24 hours)

**Owner:** QA Agent

**When:** QA gets approval notification

**What QA Does:**
1. **Code Coverage Check:** Does this PR add tests? Is coverage adequate?
2. **Test Quality Check:** Do the tests actually validate the feature? (Not just "execute code")
3. **Manual Testing:** If applicable, test feature end-to-end with real data
4. **Regression Check:** Phase 1 tests still passing?
5. **Documentation:** Are new features/APIs documented?

**Slack Reply (Approve):**
```
✅ QA Review: APPROVED

**Test Coverage:** [X]% (adequate / excellent / needs work)
**Test Quality:** [Good / needs improvement]
**Manual Testing:** [Passed / issues found]
**Regression:** [All Phase 1 tests still passing ✓]
**Docs:** [Clear / needs improvement]

Ready to merge.

@backend ready for merge
```

**Example QA Approval:**
```
✅ QA Review: APPROVED

**Test Coverage:** 87% (excellent for architecture layer)
**Test Quality:** 
- Unit tests: 15 tests covering happy path + edge cases ✓
- Integration tests: both extractors work end-to-end ✓
- Edge cases: missing data, malformed HTML ✓

**Manual Testing:** 
- Tested Facebook extractor on 10 real listings ✓
- Tested Yad2 scraper on 10 real Yad2 pages ✓
- Both extractions accurate and quick

**Regression:** All 183 Phase 1 tests still passing ✓

**Docs:** IMarketplaceExtractor interface well-documented ✓

Ready to merge!

@backend ready for merge
```

**Slack Reply (Request Changes):**
```
🔄 QA Review: CHANGES REQUESTED

**Issues:**
1. [Issue + why it matters]
2. [Issue + severity]

**Blocker?** [Yes/No]

Please add tests / fix issues and re-request review.
```

**Example QA Change Request:**
```
🔄 QA Review: CHANGES REQUESTED

**Issues:**
1. **[Blocker]** Yad2 extraction fails on some listings (missing seller info). No test for this case.
   - Fix: Add test case for incomplete data, ensure graceful fallback

2. **[Medium]** Integration test only checks happy path. Need edge cases.
   - Fix: Add tests for malformed HTML, missing fields, timeout scenarios

3. **[Minor]** Regression: latency on Facebook extraction increased from 150ms to 220ms. Why?
   - Fix: Investigate + either optimize or document the trade-off

**Blocker status:** Fix #1 (incomplete data handling) before merge.

@backend please revise and re-request.
```

---

### [4a] Backend Revises & Re-Requests

**When:** Backend gets QA feedback, adds tests, pushes commits

**Slack Message:**
```
🔵 [PR Updated] [Component Name]

Addressed QA feedback:
- Added edge case tests for incomplete data ✓
- Investigated latency regression: was adding 1 query, optimized ✓
- All tests passing locally ✓

Ready for re-review.

@qa
```

**Then:** Back to Step 4 (QA reviews again)

---

### [5] Merge

**When:** Both Assistant AND QA have approved

**Who:** Backend Agent (or anyone with merge rights, per team policy)

**Slack Message:**
```
📦 [Merged] [Component Name]

✅ Architecture review: passed
✅ QA review: passed
✅ All tests: passing
✅ Merged to main

Auto-deploying to staging...
```

**Git Action:**
- Merge PR to `main`
- Delete feature branch
- CI/CD pipeline triggers automatically

---

### [6] CI/CD Pipeline (automated)

**What Runs:**
1. Run all unit tests (must pass)
2. Run all integration tests (must pass)
3. Build code (must succeed)
4. Deploy to staging environment (automated)

**If Any Step Fails:**
- Slack alert: "@backend build failed in CI — see details [link]"
- Backend must fix and push new commit
- CI re-runs automatically

**If All Pass:**
- Slack: "✅ Build successful, deployed to staging"

---

### [7] Staging Smoke Tests

**Owner:** QA Agent

**When:** Code deployed to staging

**What QA Does:**
1. Test the feature end-to-end in staging environment
2. Verify no data loss or corruption
3. Check logs for errors
4. Verify metrics are being tracked

**Slack Reply (Pass):**
```
✅ Staging Smoke Tests: PASSED

Feature working end-to-end in staging ✓
No errors in logs ✓
Ready for production.
```

**Slack Reply (Fail):**
```
🔴 Staging Smoke Tests: FAILED

Issue: [What broke in staging]
Backend action: [Fix and redeploy / revert]

@backend
```

---

### [8] Production Deployment (Manual Gate)

**When:** Feature is in staging, smoke tests pass, ready for users

**Who:** You (Assistant) — manual approval required

**Prerequisites:**
- ✅ Architecture review approved
- ✅ QA review approved
- ✅ All tests passing
- ✅ Staging smoke tests passing
- ✅ Any data migrations tested in staging

**Slack Request (from Backend or QA):**
```
🚀 [Ready for Production]

**Feature:** [Component Name]
**Staging:** Tested and working ✓
**Risk Level:** [Low / Medium / High]
**Rollback Plan:** [If something breaks, what's the undo?]

@assistant approval needed for production deployment
```

**Example:**
```
🚀 [Ready for Production]

**Feature:** Marketplace Abstraction + Yad2 Scraper
**Staging:** Both Facebook + Yad2 extraction working perfectly ✓
**Risk Level:** Low (backward-compatible, new code is isolated in adapter pattern)
**Rollback Plan:** 
- If Yad2 scraper breaks: revert to Tavily-only for Yad2 data
- If Facebook extractor breaks: revert PR + redeploy previous version
- Time to rollback: < 5 minutes

@assistant ready for production?
```

**Your Decision (Assistant):**

**Approve:**
```
✅ Approved for Production

Deploying to production. QA monitoring logs for first hour.

@qa watch for errors. If anything looks wrong, we can revert quickly per rollback plan.
```

**Defer:**
```
⏳ Hold for Production

Not deploying yet. Reason: [waiting for more data / risk too high / other blockers]

Can deploy tomorrow once [condition] is met.
```

---

### [9] Post-Deployment Monitoring

**Owner:** QA Agent (with You as escalation)

**First Hour:**
- Watch error rate in Sentry
- Check latency metrics
- Spot-check 3-5 analyses for correctness
- Watch Slack for user reports

**If Issue Found:**
```
🔴 [PROD ISSUE]

Problem: [What broke]
Severity: [P0/P1/P2]
Status: [investigating / rolling back / patching]

@assistant @backend
```

**If Critical:** Rollback to previous version (< 5 min)  
**If Minor:** Patch and redeploy (< 30 min)  
**If No Issues:** All green, monitoring continues

---

## SLA Timeline

| Step | Owner | SLA | Consequence |
|------|-------|-----|-------------|
| 1. Code Ready | Backend/Product/QA | N/A | Post to Slack |
| 2. Architecture Review | Assistant | 2 hours | If > 2h, escalate (unblock) |
| 3. Revisions | Backend | 4 hours per cycle | If > 4h, escalate |
| 4. QA Testing | QA | 24 hours | If > 24h, escalate |
| 5. Merge | Backend | 30 min after approval | N/A |
| 6. CI/CD | Automated | 10 minutes | Slack alert if failed |
| 7. Staging Tests | QA | 2 hours | If > 2h, escalate |
| 8. Prod Approval | Assistant | 24 hours | Defer if risk too high |
| 9. Monitoring | QA | Continuous first hour | Roll back if critical |

---

## PR Template (For GitHub)

Create a `.github/pull_request_template.md` file:

```markdown
## What
[1-line description of the feature/fix]

## Why
[Why are we building this? Link to PHASE_2_DECISIONS.md or requirement]

## How
[How does this work? Any architectural changes?]

## Testing
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Manual testing done (attach screenshots/video if applicable)
- [ ] Phase 1 regression tests still passing

## Checklist
- [ ] Linked to PHASE_2_DECISIONS.md or PHASE_2_BLOCKERS.md
- [ ] Design doc or architecture decision documented
- [ ] Code comments for non-obvious logic
- [ ] No performance regressions
- [ ] Ready for @assistant architecture review

## Risk Level
[ ] Low  [ ] Medium  [ ] High

## Rollback Plan
[If this breaks in production, how do we undo it?]

## Metrics
- [ ] Code coverage: [X]%
- [ ] Tests added: [#]
- [ ] Files changed: [#]
- [ ] Lines of code: [±#]
```

---

## Slack Channels Setup

| Channel | Purpose |
|---------|---------|
| `#worthit-dev` | Daily standups, PR announcements, blockers, decisions |
| `#worthit-prs` (optional) | Auto-posted PR notifications (if you have GitHub-Slack integration) |
| `#worthit-alerts` (optional) | Sentry/monitoring alerts during production |

---

## Conflict Resolution During Review

**Scenario:** Assistant says "needs refactoring," Backend says "works, ship it"

**Resolution:**
1. Assistant explains why refactoring is needed
2. Backend explains effort + timeline impact
3. If still disagreed: escalate to priority
   - **If High Priority:** Do refactoring now
   - **If Medium Priority:** Ship now, refactor in Phase 2B
   - **If Low Priority:** Skip refactoring, accept technical debt

**Logged:** Decision + reasoning in PR comments or PHASE_2_DECISIONS.md

---

## Retrospective

**Weekly (Friday):** After standup, assess:
- Are review SLAs being met?
- Are blockers being unblocked?
- Is the workflow slowing us down or helping?
- Any process changes needed?

**Adjust if needed:** This is a living document; optimize as you learn.
