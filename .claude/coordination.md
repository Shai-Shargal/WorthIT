# WorthIT — Session Coordination

This file is the shared scratchpad between dev and QA sessions.
Update your section when you start and when you stop. Keep it short.

---

## QA Session

**Last active:** 2026-06-17  
**Status:** Idle

**Completed this session:**
- Full backend review (`/backend/src/**`)
- Fixed 4 critical issues (crash risk, dead code, open routes, wildcard CORS)
- Fixed 4 medium issues (SRP violation, duplicated utility, wrong error code, mislabeled data quality)
- All 34 tests passing

**Open QA items (carry forward):**
- [ ] Auth stub — Google token not verified; replace before real user traffic
- [ ] Usage counter — in-memory, global, not per-user; resets on restart
- [ ] No rate limiting on `POST /analysis/analyze`
- [ ] MongoDB regex search won't scale — needs text index on `productNameLower`
- [ ] No TTL index on `market_observations` — collection grows unbounded
- [ ] `productToListing` hardcodes `source: 'facebook'` — blocks Yad2 support

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
