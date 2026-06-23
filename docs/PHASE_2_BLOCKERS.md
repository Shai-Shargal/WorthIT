# Phase 2 Blockers & Dependencies

**Last Updated:** 2026-06-23  
**Review Cadence:** Daily updates, weekly resolution review

---

## Live Blockers (Updated by Each Agent)

### 🔵 Backend Agent Blockers

| Blocker | Status | Owner | Target Unblock |
|---------|--------|-------|-----------------|
| Marketplace abstraction API contract finalization | ⏳ Waiting on Product | Product | 2026-06-24 |
| Seller intelligence data source decision (FB scrape vs API) | ⏳ Waiting on Product | Product | 2026-06-24 |
| Yad2 DOM selectors validation (live scraping test) | 🟢 In Progress | Backend | 2026-06-25 |
| None currently | - | - | - |

---

### 🟢 Product Agent Blockers

| Blocker | Status | Owner | Target Unblock |
|---------|--------|-------|-----------------|
| Feature prioritization: all 4 types or staged? | ⏳ Waiting on Assistant | Assistant | 2026-06-23 |
| Verdict algorithm design (how to weight 4 features) | 🟡 In Progress | Product | 2026-06-25 |
| Seller intelligence data availability assessment | ⏳ Waiting on Backend | Backend | 2026-06-25 |
| None currently | - | - | - |

---

### 🟡 QA Agent Blockers

| Blocker | Status | Owner | Target Unblock |
|---------|--------|-------|-----------------|
| Feature spec finalization (needed for test plan) | ⏳ Waiting on Product | Product | 2026-06-25 |
| Test data: 50+ real Yad2 listings for E2E tests | ⏳ Depends on Yad2 scraper | Backend | 2026-06-28 |
| Accuracy benchmark targets (how accurate is "good enough"?) | ⏳ Waiting on Product | Product | 2026-06-26 |
| None currently | - | - | - |

---

### 🔴 Assistant (Tech Lead) Blockers

| Blocker | Status | Owner | Target Unblock |
|---------|--------|-------|-----------------|
| Founder sign-off: all 4 features in Phase 2 or defer some? | ⏳ Waiting on You | You | 2026-06-23 |
| Phase 2 timeline expectation (MVP ship date) | ⏳ Waiting on You | You | 2026-06-23 |
| None currently | - | - | - |

---

## Dependency Graph

```
Product Spec (Feature Prioritization)
  ├─ Backend needs this for: API contract
  ├─ QA needs this for: test plan
  └─ Blocks: both until 2026-06-25

Backend Yad2 Scraper (Working Prototype)
  ├─ Product needs this for: data availability assessment
  ├─ QA needs this for: E2E test data generation
  └─ Blocks: both until 2026-06-25

Verdict Algorithm Design (Product)
  ├─ Backend needs this for: implementation
  └─ Blocks: Backend until 2026-06-25
```

---

## Resolution Protocol

1. **Daily (Evening):** Each agent updates their section
2. **Assistant Review (Next Morning):** Review blockers, identify conflicts
3. **Assistant Decision (AM):** Post decision to Slack
4. **Unblock:** Agent proceeds immediately

**Escalation:** If blocker unresolved > 3 days, Assistant schedules 15-min Slack huddle to resolve.

---

## Template for Agent Blockers

```markdown
### [Agent] Blockers

| Blocker | Status | Owner | Target Unblock |
|---------|--------|-------|-----------------|
| [What's blocking?] | ⏳/🟡/🟢 | [Who owns unblocking] | [Date] |
```

**Status Legend:**
- ⏳ Waiting (depends on someone else)
- 🟡 In Progress (we're working on it)
- 🟢 Resolved (cleared, can update to "none")
- 🔴 Critical (escalate immediately)
