# WorthIT — QA Report
**Date:** 2026-06-18  
**Scope:** `specsExtractor.ts` (missed in prior session) + MongoDB index hardening  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after changes:** 63 passing, 0 failing (+30 new tests for specsExtractor)

---

## Context

`specsExtractor.ts` was added by the dev session (commit `10d8705`) after the prior QA pass had already been written. The bilingual Hebrew/English regex patterns were flagged as high-risk and reviewed as a follow-up. MongoDB indexes were added in the same session as a carry-forward item from the previous QA report.

---

## MongoDB Indexes — Changes Applied

Two indexes added to `MarketObservation`:

| Index | Type | Reason |
|-------|------|--------|
| `{ currency: 1, timestamp: -1, productNameLower: 1 }` | Compound | Every `findSimilarObservations` filters by currency first — replaces weaker `{ productNameLower: 1, timestamp: -1 }` |
| `{ timestamp: 1 }` with `expireAfterSeconds: 31,536,000` | TTL | Auto-deletes observations older than 1 year; prevents unbounded collection growth |

**Note for dev:** The old `{ productNameLower: 1, timestamp: -1 }` index still exists in Atlas. Drop it manually when convenient — it wastes write overhead but causes no functional issues.

---

## specsExtractor.ts — Issues Found & Fixed

### Critical

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| C1 | `"עם אחריות"` (WITH warranty) flagged as "No warranty" — `(?:לא\s*)?` made negation optional | Every listing mentioning warranty triggered a false red flag | Changed to explicit negation: `(?:ללא\|לא\s*כולל\|לא\s*עם)\s*אחריות` |
| C2 | Storage unit inferred from number size: `num >= 2 → 'TB'` — so `512GB → '512TB'`, `256GB → '256TB'` | All storage values above 1 were labeled TB | Added capture group for unit in `STORAGE_PATTERN`; reads actual matched unit |

### Medium

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| M1 | `STORAGE_PATTERN` matched RAM context — `"16GB RAM 512GB SSD"` included `16GB` in storage | RAM size polluted storage array | Added negative lookahead: `(?!\s*(?:ram\|ראם\|זיכרון))` after unit |
| M2 | `CHIP_PATTERN` missed Intel suffixes like `G7` in `i7-1165G7` — `[a-zA-Z]*` consumed `G` but stopped at `7`, leaving `\b` between two word chars | Intel model numbers with alphanumeric suffixes silently undetected | Changed to `\w*` to consume full suffix |
| M3 | Hebrew `"סדק"` (crack) never fired — `\b` before Hebrew is always false in JS (`\w` = ASCII only) | Physical damage in Hebrew listings never detected | Removed `\b` from Hebrew alternatives; kept it only for English: `\b(?:broken\|crack\|shatter)\b\|סדק\|שבור` |
| M4 | Hebrew `"חסר מטען"` never fired — `\w+` after `חסר` matches only ASCII | Hebrew "missing X" pattern silently broken | Changed `\w+` to `\S+` |

### Minor

| # | Bug | Fix |
|---|-----|-----|
| m1 | Duplicate Hebrew alternative `(?:למכור\|למכור)` in urgent sale pattern | Changed second to `למכירה` |

---

## Root Cause: `\b` + Hebrew

A systemic issue worth knowing: JavaScript's `\b` word boundary only recognises `[a-zA-Z0-9_]` as word characters. Hebrew (and all non-ASCII scripts) are treated as non-word characters. This means `\bWord\b` works, but `\bמילה\b` **never** fires — both sides are non-word, so no boundary exists.

**Rule going forward:** Never use `\b` on Hebrew regex alternatives. Use `\S+`, `(?:^|\s)`, or bare pattern matching instead.

---

## New Tests Added

`tests/specsExtractor.test.ts` — 30 test cases covering:
- Storage: GB/TB extraction, Hebrew units, deduplication, no-RAM-contamination
- RAM: English and Hebrew, no storage contamination
- Chip: M1/M2/M2 Pro, Intel with alphanumeric suffix
- Year: detection and no-match
- Red flags: warranty (positive AND negative), untested, damage, urgency
- Missing items: Hebrew and English charger/box/as-is/missing
- `buildEnrichedQuery`: with and without detected specs

---

## Developer Decisions (not QA issues)

| Commit | Decision | QA Status |
|--------|----------|-----------|
| `8411657` | Removed `requireAuth` from `POST /analysis/analyze` — extension has no login flow yet | Accepted for MVP. Auth middleware (`src/auth/middleware.ts`) exists and is ready to re-enable. |
| `8411657` | Restored open CORS — Chrome extension requires it | Accepted for MVP. `CORS_ORIGIN` env var documented for production lockdown. |

---

## Carry-Forward Open Items

- [ ] Auth stub — Google token not verified; replace before real user traffic
- [ ] Usage counter — in-memory, global, not per-user; resets on restart
- [ ] No rate limiting on `POST /analysis/analyze`
- [ ] Drop old `{ productNameLower: 1, timestamp: -1 }` index in Atlas (manual, low urgency)
- [ ] `productToListing` hardcodes `source: 'facebook'` — blocks Yad2 support
- [ ] `YEAR_PATTERN` can match prices like `"2020 ₪"` as year — low severity, defer
