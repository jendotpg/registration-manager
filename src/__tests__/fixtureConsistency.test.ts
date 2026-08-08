/**
 * Ties the renderer's hand-written tournament fixture to the real pipeline.
 *
 * __fixtures__/tournament.ts describes the NYC Melee tournament as the renderer
 * receives it, written out by hand so that jsdom suites never have to load
 * main/startgg.ts. That hand-copy is the only thing in the fixtures that can
 * silently drift: change how ingestEvents classifies an option, or how
 * resolvePools assigns a bucket, and every renderer test would keep passing
 * against a shape the app no longer produces.
 *
 * So: run the actual wire fixtures through the actual pipeline, and require the
 * result to equal the hand-written one. If this fails, the fixture is stale -
 * fix __fixtures__/tournament.ts, don't relax this assertion.
 *
 * @jest-environment node
 */
import { COOKIES, loadNycMelee } from '../__fixtures__/nycMelee';
import { nycMeleeTournament } from '../__fixtures__/tournament';

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('matches what getTournament actually builds from the wire fixtures', async () => {
  const { tournament } = await loadNycMelee({ cookies: COOKIES });

  expect(tournament).toEqual(nycMeleeTournament());
});
