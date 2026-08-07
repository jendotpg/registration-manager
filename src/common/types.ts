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

export type Participant = {
  id: Id;
  displayName: string;
  prefix: string;
  filtered: boolean;
  paidStatuses: Record<Id, boolean>;
  /**
   * Keyed by event option id only. There is no "added to the venue" boolean -
   * every operation here acts on entrants already registered for the tournament,
   * so tournament-type options carry a paid status and nothing else.
   */
  registeredStatuses: Record<Id, boolean>;
};

export type FilterState = {
  paid: NullableBoolean;
  added: NullableBoolean;
  dqd: NullableBoolean;
  pools: Record<string, boolean>;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  paid: NullableBoolean.Indeterminate,
  added: NullableBoolean.Indeterminate,
  dqd: NullableBoolean.Indeterminate,
  pools: {},
};

export type RegistrationOption = {
  id: Id;
  name: string;
  type: string;
  started: boolean;
  free: boolean;
  options: string[];
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
