export type Id = number;

export type Participant = {
  id: Id;
  displayName: string;
  prefix: string;
};

export type RegistrationOption = {
  id: number;
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
  participantPaidStatuses: Record<Id, Record<Id, boolean>>;
  participantRegisteredStatuses: Record<Id, Record<Id, boolean>>;
  updatingCheckboxes: string[];
};

export type AdminedTournament = {
  slug: string;
  name: string;
};

export enum Mode {
  STARTGG = 'start.gg',
}
