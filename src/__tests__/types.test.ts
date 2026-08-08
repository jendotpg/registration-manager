/**
 * common/types.ts holds the shared model plus three pure helpers that the filter
 * UI and the filter engine both depend on. They have no dependencies at all, so
 * they get tested directly rather than through anything that uses them.
 *
 * @jest-environment node
 */
import {
  DEFAULT_FILTER_STATE,
  matchesNullableBoolean,
  nextNullableBoolean,
  NullableBoolean,
  poolLabel,
  UNSEEDED_POOL,
  UNSEEDED_POOL_ID,
} from '../common/types';

describe('nextNullableBoolean', () => {
  it('cycles Indeterminate to Include', () => {
    expect(nextNullableBoolean(NullableBoolean.Indeterminate)).toBe(
      NullableBoolean.Include,
    );
  });

  it('cycles Include to Exclude', () => {
    expect(nextNullableBoolean(NullableBoolean.Include)).toBe(
      NullableBoolean.Exclude,
    );
  });

  it('cycles Exclude back to Indeterminate', () => {
    expect(nextNullableBoolean(NullableBoolean.Exclude)).toBe(
      NullableBoolean.Indeterminate,
    );
  });

  it('returns to the start after three clicks', () => {
    const once = nextNullableBoolean(NullableBoolean.Indeterminate);
    const twice = nextNullableBoolean(once);

    expect(nextNullableBoolean(twice)).toBe(NullableBoolean.Indeterminate);
  });

  it('treats an out-of-range value as Exclude, resetting rather than throwing', () => {
    // Exclude and "anything unexpected" share the switch's default arm. A filter
    // state that somehow went out of range should still be clickable back to a
    // clean Indeterminate rather than getting stuck.
    expect(nextNullableBoolean(42 as NullableBoolean)).toBe(
      NullableBoolean.Indeterminate,
    );
  });
});

describe('matchesNullableBoolean', () => {
  it.each([
    [NullableBoolean.Include, true, true],
    [NullableBoolean.Include, false, false],
    [NullableBoolean.Exclude, true, false],
    [NullableBoolean.Exclude, false, true],
    [NullableBoolean.Indeterminate, true, true],
    [NullableBoolean.Indeterminate, false, true],
  ])('state %i against %s is %s', (state, value, expected) => {
    expect(matchesNullableBoolean(state, value)).toBe(expected);
  });

  it('matches everything while Indeterminate, which is what makes a filter inert', () => {
    expect(matchesNullableBoolean(NullableBoolean.Indeterminate, true)).toBe(
      true,
    );
    expect(matchesNullableBoolean(NullableBoolean.Indeterminate, false)).toBe(
      true,
    );
  });
});

describe('poolLabel', () => {
  it('joins the phase and the pool name', () => {
    expect(poolLabel({ id: 1, phase: 'Pools', name: '2' })).toBe('Pools 2');
  });

  it('drops the trailing space for the Unseeded bucket, which has no name', () => {
    // This is the reason for the .trim() - without it the menu would read
    // "Unseeded " with a stray space.
    expect(poolLabel(UNSEEDED_POOL)).toBe('Unseeded');
  });

  it('is empty when the pool has neither phase nor name', () => {
    expect(poolLabel({ id: 1, phase: '', name: '' })).toBe('');
  });
});

describe('the Unseeded sentinel', () => {
  it('is negative, which is what lets ingestPools reject it as a real pool id', () => {
    expect(UNSEEDED_POOL_ID).toBe(-1);
    expect(UNSEEDED_POOL.id).toBe(UNSEEDED_POOL_ID);
    expect(UNSEEDED_POOL_ID).toBeLessThan(0);
  });
});

describe('DEFAULT_FILTER_STATE', () => {
  it('starts with both filters inert and no pool record', () => {
    expect(DEFAULT_FILTER_STATE).toEqual({
      paid: NullableBoolean.Indeterminate,
      added: NullableBoolean.Indeterminate,
      pools: {},
    });
  });

  it('is not corrupted by mutating a shallow copy of it', () => {
    // StartggCheckin.filterFor falls back to this shared literal and spreads it,
    // and `pools` survives that spread by reference. If anything ever writes
    // through that reference, every option without explicit filter state would
    // silently inherit another option's pool checkboxes.
    const copy = { ...DEFAULT_FILTER_STATE };
    copy.paid = NullableBoolean.Include;
    copy.pools = { ...copy.pools, 5001: false };

    expect(DEFAULT_FILTER_STATE.paid).toBe(NullableBoolean.Indeterminate);
    expect(DEFAULT_FILTER_STATE.pools).toEqual({});
  });
});
