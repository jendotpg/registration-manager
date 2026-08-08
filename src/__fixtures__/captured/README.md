# Captured start.gg responses

Verbatim responses from the unofficial `https://www.start.gg/api/-/gql`
endpoint, used by `src/__tests__/startgg.test.ts` to exercise the real shape of
the API instead of only hand-built fixtures. Each file is the `data` object
exactly as `fetchUnofficialGql` returns it.

| file | query in `src/main/startgg.ts` |
| --- | --- |
| `tournamentEvents.json` | `GQL_GET_EVENTS` |
| `tournamentParticipants.json` | `GQL_GET_PARTICIPANTS` |
| `tournamentPools.json` | `GQL_GET_POOLS` |

Source tournament: **NYCMelee's Stock Exchange #60**
(`tournament/nycmelee-s-stock-exchange-60`), two events, 61 participants.

## Why these files exist

They pin down three behaviours of the real API that hand-written fixtures got
wrong, and that the code would otherwise silently regress on.

### 1. Later phases are seeded, so "no seeds" doesn't mean "progression pool"

Melee Singles (event `1682236`) has three phase groups:

| group | phase | `phaseOrder` | identifier | seeds |
| --- | --- | --- | --- | --- |
| 3410359 | Bracket | 1 | 1 | 29 |
| 3410360 | Bracket | 1 | 2 | 30 |
| 3410361 | Top 16 (Beast Bracket) | 2 | 1 | 16 |

The beast bracket is a progression target — you reach it by placing out of pools
— but it still carries 16 seeds, one per entrant who advanced. Entrant
`24306599`, for instance, appears in both `Bracket 1` and the beast bracket.

So a phase group cannot be classified by whether it has seeds. `resolvePools`
keeps only the groups whose phase has the lowest `phaseOrder` in the event, which
is where every entrant starts and the only thing that means anything at the
registration desk. Without that, 16 of the 59 singles entrants get shown under
the bracket they advanced to rather than the pool they actually played.

Note both singles pools share one `phase.id` (`2362006`). A phase owns many
groups, which is why the filter is on `phaseOrder` and not on group identity.

### 2. `paginatedPhaseGroups` ignores `sortBy`

An earlier capture requested `sortBy: "id DESC"` and the groups came back
ascending. The argument has since been removed from `GQL_GET_POOLS`. Group order
is whatever start.gg feels like — nothing may depend on it, and `resolvePools`
sorts locally.

### 3. `prefix` can be `null`

Roughly a third of the participant nodes here have `"prefix": null` rather than
`""`. `ingestParticipants` coerces it, because otherwise the search haystack is
built as the literal string `"null|gamerTag"`.

## The pool filter's Unseeded bucket

All 59 singles entrants are seeded, so the singles **Unseeded** bucket holds
exactly the two people who entered Redemption only: `surreal` (`22277113`) and
`SHED|ssjruben` (`22277059`). A test filters singles down to Unseeded and expects
precisely those two, which guards the rule that Unseeded means "has no pool in
this event" — covering both the registered-but-unseeded and the not-in-the-event
cases, so that unticking a pool box can never evict someone who matches none of
the boxes.

## Re-capturing

Log a `JSON.stringify` of each query response in `getRegistration` and load a
tournament that already has pools. Replace the files wholesale; the tests assert
against ids and gamertags from this specific tournament, so swapping in a
different one means updating `describe('against captured start.gg responses')`
to match.
