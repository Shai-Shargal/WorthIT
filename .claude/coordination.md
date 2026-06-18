# WorthIT — Session Coordination

This file is the shared scratchpad between dev and QA sessions.
Update your section when you start and when you stop. Keep it short.

---

## QA Session

**Last active:** 2026-06-18  
**Status:** Idle

**Completed this session:**
- MongoDB indexes: TTL (1 year expiry) + compound `{ currency, timestamp, productNameLower }`
- `specsExtractor.ts` full review — 2 critical bugs, 4 medium bugs fixed
- 30 new unit tests for specsExtractor (63 total passing)
- QA doc: `docs/qa/2026-06-18-specsextractor-indexes-qa.md`

**Open QA items (carry forward):**
- [ ] Auth stub — Google token not verified; replace before real user traffic
- [ ] Usage counter — in-memory, global, not per-user; resets on restart
- [ ] No rate limiting on `POST /analysis/analyze`
- [ ] Drop old `{ productNameLower: 1, timestamp: -1 }` Atlas index (manual)
- [ ] `productToListing` hardcodes `source: 'facebook'` — blocks Yad2 support
- [ ] `YEAR_PATTERN` can match prices like `2020 ₪` as year (low severity)

---

## Dev Session

**Last active:** —  
**Status:** —

**In progress:** —

**Do not touch (WIP):** —

---

## Notes

- QA doc for each session lives in `docs/qa/YYYY-MM-DD-<scope>.md`
- Dev changelog lives in `docs/changelogs/YYYY-MM-DD.md`
- Check `git log --oneline -10` to see recent commits from the other session
