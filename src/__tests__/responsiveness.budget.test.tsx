/**
 * An absolute latency budget for typing, which is the interaction that has to
 * feel immediate.
 *
 * responsiveness.test.tsx holds the gates that matter - the ones no machine's
 * speed can influence. This is the blunt instrument beside them: a millisecond
 * ceiling, so that a uniform slowdown of everything, which no ratio can see,
 * still shows up.
 *
 * The budget is one 60Hz frame. If the JS answering a keystroke fits inside a
 * frame then the browser has the rest of the frame to lay the character out and
 * paint it, and the keystroke registers immediately - which is the requirement.
 * There is a wide margin: a keystroke measures about 1ms here, against 16.
 *
 * Two honest caveats:
 *
 *   - jsdom does no style recalculation, layout or paint, so this is the React
 *     half of the number a user experiences, not the whole of it.
 *   - it is a wall-clock assertion on a shared CI runner. It is here because a
 *     regression that doubles the fixed cost of everything is worth catching, and
 *     the margin plus the median of nine samples is enough to absorb machine
 *     noise. PERF_BUDGET_MS raises the ceiling without a code change if some
 *     runner turns out to be noisier than that.
 *
 * There is deliberately no equivalent budget for opening a filter menu. MUI's
 * Menu is a Modal with a focus trap and a popper behind it, and mounting one
 * costs about 17ms in jsdom even against a five-entrant tournament - a floor
 * that no amount of work on this app can move, and one a loaded test runner
 * pushes past 70ms on its own. A number that survived that would be too loose to
 * mean anything. What can be asserted about a menu, and is, is that opening one
 * costs no more as the tournament grows: see responsiveness.test.tsx.
 *
 * @jest-environment jsdom
 */
import { bigTournament } from '../__fixtures__/tournament';
import {
  median,
  renderPerfApp,
  sampleKeystrokes,
} from '../__fixtures__/responsiveness';

jest.setTimeout(120_000);

/** One frame at 60Hz. */
const DEFAULT_BUDGET_MS = 16;
const BUDGET_MS = Number(process.env.PERF_BUDGET_MS ?? DEFAULT_BUDGET_MS);

const BIG = { participants: 100, events: 8 };

afterEach(() => {
  jest.clearAllMocks();
});

it('answers a keystroke within a frame', async () => {
  const app = await renderPerfApp(bigTournament(BIG), { echo: false });
  try {
    const samples = sampleKeystrokes(app);

    expect(median(samples.map((sample) => sample.wall))).toBeLessThan(
      BUDGET_MS,
    );
  } finally {
    await app.teardown();
  }
});
