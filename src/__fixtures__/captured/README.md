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
| `tournamentEventsUnstarted.json` | `GQL_GET_EVENTS` |
| `adminedTournaments.json` | `GET_TOURNAMENTS_QUERY` |
| `updateParticipantRegistration.json` | `UPDATE_PARTICIPANT_REGISTRATION_QUERY` |

The first three come from **NYCMelee's Stock Exchange #60**
(`tournament/nycmelee-s-stock-exchange-60`), two events, 61 participants.
`tournamentEventsUnstarted.json` and `updateParticipantRegistration.json` come
from a separate, still-upcoming tournament (events `1672616` Melee Singles,
`1672617` Melee Doubles, `1672618` Redemption).
`adminedTournaments.json` is account-wide, not tied to any one tournament.

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

### 4. Events are `CREATED` before the tournament runs

`tournamentEvents.json` is a finished tournament — both events are `COMPLETED`,
which `ingestEvents` classifies as *started*. That left the opposite state
unproven, even though it is the one the app actually runs in: a registration desk
is busiest before anything has started.

`tournamentEventsUnstarted.json` fills that gap. All three events are `CREATED`,
so `started` is `false` and the `EVENT STARTED — cannot add` path in
`StartggCheckin.disabledReason` correctly stays quiet. It also carries two things
the finished capture doesn't:

- **A doubles event** (`1672617`). Doubles is why `ingestParticipants` builds
  `participantsByEntrant` as a many-to-many — one entrant, two participants — and
  until this capture no fixture had a real instance of it.
- **A non-zero venue fee** (`fee: 15`) alongside a genuinely free event
  (Redemption, `fee: 0`), so `free` is exercised both ways in one tournament.

Note the venue fee's three ids are all different: option `id` `5903305`,
`values[0].id` `6447006`, `values[0].optionTypeId` `935414`. `ingestEvents` reads
`values[0].id` for `tournament`-type options and `values[0].optionTypeId` for
`event`-type ones — a hand-built fixture that sets them equal cannot tell you
whether the code reads the right field.

### 5. The mutation response is authoritative, not a delta

`updateParticipantRegistration.json` is the response to one checkbox toggle for
participant `22153767`. It returns Venue Fee, Doubles and Redemption — and **no
Melee Singles**, even though singles exists in the same tournament.

`updateParticipantRegistration` clears `paidStatuses` and `registeredStatuses`
outright and rebuilds them from this array, so a registration missing from the
response is a registration that no longer exists. That is the correct reading:
start.gg is the source of truth and the response is the participant's complete
new state. Anyone "optimizing" that wipe into a merge would silently resurrect
registrations the server just dropped.

## The pool filter's Unseeded bucket

All 59 singles entrants are seeded, so the singles **Unseeded** bucket holds
exactly the two people who entered Redemption only: `surreal` (`22277113`) and
`SHED|ssjruben` (`22277059`). A test filters singles down to Unseeded and expects
precisely those two, which guards the rule that Unseeded means "has no pool in
this event" — covering both the registered-but-unseeded and the not-in-the-event
cases, so that unticking a pool box can never evict someone who matches none of
the boxes.

## Re-capturing

**The three tournament queries.** Log a `JSON.stringify` of each query response in
`getRegistration` and load a tournament that already has pools. Replace the files
wholesale; the tests assert against ids and gamertags from this specific
tournament, so swapping in a different one means updating
`describe('against captured start.gg responses')` to match.

**Read-only queries** can be taken straight from the DevTools console on any
`https://www.start.gg` page while logged in — same origin, so the session cookie
rides along:

```js
async function gql(query, variables = {}) {
  const r = await fetch('https://www.start.gg/api/-/gql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'client-version': '20' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  console.log(JSON.stringify(j.data));
  return j;
}
```

Paste the query text from `src/main/startgg.ts` as the first argument. This is how
`adminedTournaments.json` and `tournamentEventsUnstarted.json` were taken.

**The mutation** writes real registration data, so don't hand-assemble it in the
console. Temporarily add `console.log(JSON.stringify(queryResponse))` inside
`updateParticipantRegistration`, run the app against a test tournament, toggle one
checkbox, then toggle it straight back. Because the mutation re-sends the
participant's *whole* registration state every time, the second toggle restores the
original state exactly.

These files contain real gamertags and real tournament names from public start.gg
pages. Keep it that way — no scrubbing that would change a shape the tests depend
on, and nothing here that isn't already public.
