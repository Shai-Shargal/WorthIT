# Phase 2 Strategic Decisions

**Locked:** 2026-06-23  
**Review Cadence:** Weekly (Fridays) — decisions can be re-opened if new info surfaces

---

## Decision 1: Yad2 Integration Method

**Question:** API integration vs. DOM scraping?

**Decision:** **DOM Scraping**

**Owner:** Backend Agent

**Reasoning:**
- Yad2 likely has no public API (Israeli classifieds sites rarely do)
- Scraping is lower friction than reaching out, waiting for approval
- Yad2's site structure is simpler than Facebook (less React) → more stable selectors
- Aligns with existing Facebook scraper pattern in your codebase

**Trade-offs Accepted:**
- ⚠️ Maintenance risk: if Yad2 redesigns their DOM, selectors break
- ⚠️ ToS/legal: scraping ToS compliance is user's responsibility
- ✅ Benefit: ships fast, zero external dependencies

**Contingency:** If Yad2 redesign breaks scraper, we can pivot to API in Phase 3 if they respond to outreach.

**Fallback:** If scraper becomes unmaintainable, can revert to Tavily-only for Yad2 price data (less rich, but functional).

**Status:** LOCKED ✅

---

## Decision 2: Feature Rollout Approach

**Question:** How to sequence Yad2 scraper + 4 feature types (seller, price, listing, market)?

**Decision:** **Approach C — Staged Feature Rollout**

**Owner:** Assistant (Tech Lead)

**Three Stages:**
1. **Stage 1 (Parallel):** Yad2 scraper (Backend) + All 4 features on Facebook (Product + QA)
2. **Stage 2:** Port 4 features to Yad2 (Backend refactors marketplace abstraction, reuses feature logic)
3. **Stage 3:** Optimization + Extensions (seller account age detection, negotiation suggestions, etc.)

**Reasoning:**
- Parallelizes Backend + Product/QA work (team doesn't block each other)
- Ships both marketplace coverage AND feature depth together
- Forces clean marketplace abstraction (easier to add features later)
- Staged approach allows early feedback on features before scaling to Yad2

**Trade-offs Accepted:**
- ⚠️ Stage 2 requires architectural refactoring (marketplace abstraction)
- ⚠️ Higher complexity than doing one marketplace completely first
- ✅ Benefit: users get features + Yad2 support at same time (better product launch)

**Contingency:** If Stage 2 refactoring becomes too complex, can defer Yad2 feature port to Phase 2B (but this delays Yad2 richness).

**Status:** LOCKED ✅

---

## Decision 3: Feature Priority (All 4 or Staged?)

**Question:** Ship all 4 feature types in Stage 1, or prioritize?

**Decision:** **All 4 Features (Seller, Price, Listing, Market Intelligence)**

**Owner:** You (Founder) — **CONFIRM or ADJUST**

**Reasoning:**
- MVP already proves concept works; Phase 2 should deepen, not expand breadth
- All 4 types provide different value (trust, savings, risk, context)
- Small team (4 agents) can handle 4 features if well-designed
- Feature depth is your stated Phase 2 goal

**Alternative (if team bandwidth tight):** Prioritize as:
1. Price Intelligence (highest user value: "is this deal good?")
2. Seller Intelligence (trust signal)
3. Listing Intelligence (red flags already exist, just expand)
4. Market Intelligence (nice-to-have, can defer to Phase 2B)

**Trade-off if prioritizing:** Launch Phase 2 with 3 features, add market intelligence after feedback.

**Status:** ⏳ **PENDING YOUR CONFIRMATION**

---

## Decision 4: Marketplace Abstraction Pattern

**Question:** How should Backend refactor marketplace code to support multiple sources?

**Decision:** **Factory Pattern + Adapter Model**

**Owner:** Backend Agent

**Pattern:**
```typescript
// Marketplace abstraction
interface IMarketplaceExtractor {
  extractListing(url: string): Promise<RawListing>
  validateUrl(url: string): boolean
  supportedDomains: string[]
}

// Implementations
class FacebookExtractor implements IMarketplaceExtractor { ... }
class Yad2Extractor implements IMarketplaceExtractor { ... }

// Router
class MarketplaceExtractorFactory {
  getExtractor(url: string): IMarketplaceExtractor
}

// Feature engine (works for any extractor)
class FeatureEngine {
  analyzeWithAllFeatures(rawListing: RawListing): Analysis { ... }
}
```

**Reasoning:**
- Clean separation: extractors handle marketplace-specific logic
- Feature engine is marketplace-agnostic (reusable for eBay, Amazon in Phase 3)
- Easy to test each extractor independently
- When adding new marketplace, only implement IMarketplaceExtractor

**Status:** LOCKED ✅ (Backend may adjust implementation details)

---

## Decision 5: Test Coverage Target

**Question:** What's the acceptable test coverage for Phase 2?

**Decision:** **TBD — PENDING QA INPUT**

**Owner:** QA Agent + You

**Options:**
- **Option A:** 85%+ code coverage (strict, thorough)
- **Option B:** 70%+ coverage + 100% feature accuracy spot-checks (pragmatic balance)
- **Option C:** Focus on integration + E2E, skip some unit tests (fast ship)

**Trade-offs:**
- Option A: highest confidence, slower release
- Option B: good confidence, reasonable speed (recommended)
- Option C: faster ship, lower confidence (riskier)

**Status:** ⏳ **PENDING QA INPUT + YOUR DECISION**

---

## Decision 6: Seller Data Source (Facebook)

**Question:** How to get seller trust data? Profile scrape or existing observation data?

**Decision:** **TBD — PENDING PRODUCT + BACKEND DISCUSSION**

**Owner:** Product Agent (spec) + Backend Agent (feasibility)

**Options:**
1. **Scrape seller profile page:** Real-time data, but requires extra HTTP request per analysis
2. **Use observation history:** Aggregate past listings by seller name, build trust score from history
3. **Hybrid:** Start with history, add profile scrape if history insufficient

**Trade-offs:**
- Option 1: fresh data, +latency, +requests
- Option 2: zero latency, lower accuracy initially (improves over time)
- Option 3: balanced, more complex code

**Status:** ⏳ **BLOCKED on Product + Backend assessment**

---

## Decision 7: eBay / Amazon Timing

**Question:** When to add eBay + Amazon support?

**Decision:** **Phase 3 (Post-Phase 2 completion)**

**Owner:** You (Founder)

**Reasoning:**
- Phase 2 focus is depth (4 features) + breadth (Yad2)
- Adding 2 more marketplaces in Phase 2 = scope creep
- Better to prove features + Yad2 integration solid, THEN expand

**Contingency:** If Phase 2 ships early + team capacity, can start Phase 3 in parallel.

**Status:** LOCKED ✅

---

## Template for New Decisions

```markdown
## Decision [#]: [What's the decision about?]

**Decision:** [Your choice]

**Owner:** [Who made/owns it]

**Reasoning:** [Why this choice over alternatives]

**Trade-offs Accepted:**
- ⚠️ Risk/cost
- ✅ Benefit

**Contingency:** [What if this goes wrong?]

**Status:** LOCKED ✅ / ⏳ PENDING [WHAT]
```

---

## Open Questions (Awaiting Your Answers)

- ❓ **Decision 3:** Confirm all 4 features in Phase 2, or prioritize 3?
- ❓ **Decision 5:** Test coverage target (85%, 70%, or pragmatic)?
- ❓ **Decision 6:** Seller data source (scrape, history, or hybrid)?

**Action:** Reply with your answers, I'll lock these decisions + update PHASE_2_BLOCKERS.md.

---

## Decision Change Protocol

If new info suggests a decision should change:

1. **Raise flag in Slack:** "Decision [#] should be reconsidered because..."
2. **Assess:** Is this a minor adjustment or major pivot?
3. **Re-lock:** Owner decides, documents new reasoning in this file
4. **Notify team:** Post to Slack so everyone knows

**Example:** If Yad2 responds with API access offer → can re-open Decision 1.
