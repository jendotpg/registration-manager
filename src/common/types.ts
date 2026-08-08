export enum NullableBoolean {
  Indeterminate = 0,
  Include = 1,
  Exclude = -1,
}

export const nextNullableBoolean = (
  state: NullableBoolean,
): NullableBoolean => {
  switch (state) {
    case NullableBoolean.Indeterminate:
      return NullableBoolean.Include;
    case NullableBoolean.Include:
      return NullableBoolean.Exclude;
    default:
      return NullableBoolean.Indeterminate;
  }
};

export const matchesNullableBoolean = (
  state: NullableBoolean,
  value: boolean,
): boolean => {
  switch (state) {
    case NullableBoolean.Include:
      return value;
    case NullableBoolean.Exclude:
      return !value;
    default:
      return true;
  }
};

export type Id = number;

export type Pool = {
  id: Id;
  phase: string;
  name: string;
};

export const UNSEEDED_POOL_ID: Id = -1;

export const UNSEEDED_POOL: Pool = {
  id: UNSEEDED_POOL_ID,
  phase: 'Unseeded',
  name: '',
};

export const poolLabel = (pool: Pool) => `${pool.phase} ${pool.name}`.trim();

export type Participant = {
  id: Id;
  displayName: string;
  prefix: string;
  filtered: boolean;
  paidStatuses: Record<Id, boolean>; // includes "venue fee" category
  registeredStatuses: Record<Id, boolean>;
  // DOESNT include "venue fee" category - obviously youre registered
  // for venue if youre in the event...
  pools: Record<Id, Pool>;
};

export type FilterState = {
  paid: NullableBoolean;
  added: NullableBoolean;
  pools: Record<Id, boolean>;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  paid: NullableBoolean.Indeterminate,
  added: NullableBoolean.Indeterminate,
  pools: {},
};

export type RegistrationOption = {
  id: Id;
  name: string;
  type: string;
  started: boolean;
  free: boolean;
  options: string[];
  pools?: Pool[];
};

export type Tournament = {
  slug: string;
  name: string;
  participants: Participant[];
  registrationOptions: RegistrationOption[];
  updatingCheckboxes: string[];
};

export type AdminedTournament = {
  slug: string;
  name: string;
};

export enum Mode {
  STARTGG = 'start.gg',
}
