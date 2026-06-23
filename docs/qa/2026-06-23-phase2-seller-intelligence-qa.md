# WorthIT — QA Report
**Date:** 2026-06-23  
**Scope:** Phase 2 — Marketplace Abstraction + Seller Intelligence  
**Commits:** `9d99b8f` · `3387b2e` · `ff930a8` · `9a451ee`  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after fixes:** 210 passing, 0 failing

---

## Marketplace Abstraction Layer — ✅ No Issues

`MarketplaceExtractorFactory` → `IMarketplaceExtractor` → `FacebookExtractor` / `Yad2Extractor` is clean and extensible. `RawListing` type is correctly marketplace-agnostic. Factory tests cover routing, interface conformance, and error on unsupported URLs.

---

## Seller Intelligence — Issues Found & Fixed

### Medium

| # | Issue | Fix |
|---|-------|-----|
| M1 | `scrapeFacebookProfile` fetched Facebook pages from backend server with a spoofed browser `User-Agent` — violates Facebook ToS, backend IPs get blocked in practice, always hits a login wall → effectively dead code with a 5s timeout cost per no-history lookup | Removed entirely: `scrapeFacebookProfile`, `parseFacebookProfileHtml`, `calculateTrustFromProfile`, `buildVerdictFromProfile`, `FacebookProfile` interface, `isFacebookProfileUrl`, `FACEBOOK_PROFILE_HOST_REGEX`, `PROFILE_FETCH_TIMEOUT_MS`. The extension content script is the correct path for future profile signals. |
| M2 | Cache key was `name:${name.toLowerCase()}` without marketplace discriminator — "John Smith" on Facebook and "John Smith" on Yad2 shared one cache entry; one seller's verdict overrode the other's | Cache key changed to `${marketplace}:${name.toLowerCase()}` |

### Minor

| # | Issue | Fix |
|---|-------|-----|
| m1 | `buildReasoning` had a `'none'` source branch that was never called (fallback verdict hardcoded its reasoning string instead) | Removed dead branch; simplified signature to `(trustScore, historyCount, riskFactors)` |
| m2 | RED confidence formula `0.7 + 0.05 * min(obs, 6)` could reach 1.0 with 6+ observations | Capped at 0.95 for both RED and GREEN — no signal source should claim absolute certainty |

---

## Test Changes

| File | Change |
|------|--------|
| `tests/unit/sellerIntelligence.test.ts` | Removed 5 tests for deleted scrape functions (`calculateTrustFromProfile` ×3, `parseFacebookProfileHtml` ×2) |
| | Added `'caps red confidence at 0.95'` test |
| | Added `'does NOT share cache between same seller name on different marketplaces'` test — verifies the M2 fix with two separate DB queries for facebook:john vs yad2:john |
| | Changed `'does not scrape Facebook profile for Yad2 listings'` → `'never calls fetch (no profile scraping from backend)'` — now asserts no fetch regardless of marketplace or profileUrl |
| | Updated `buildReasoning` call sites to match new signature `(trustScore, historyCount, riskFactors)` |

---

## Design Note: Profile Signals Path Forward

The removed scrape was the only way to get profile-based trust signals in Phase 2. The correct path (documented in the module header):

> The Chrome extension content script remains the canonical path for full profile data. Those signals will be passed in via `RawListing.seller` when the extension supplies them.

When the extension extracts seller profile data (join date, ratings, transaction count), those fields can be added to `RawSeller` in `RawListing.ts` and `calculateTrustFromProfile`-style logic can be re-introduced **without any HTTP I/O from the backend**.

---

## Verdict

**✅ Ready for Production** (Phase 2 Seller Intelligence scope)

Facebook scrape removed — no ToS risk, no dead timeout overhead. Cache key collision fixed. 210 tests passing.
