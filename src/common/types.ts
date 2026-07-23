export type Id = string | number;

export type Participant = {
  id: Id;
  displayName: string;
  prefix: string;
};

export type RegistrationOption = {
  id: number;
  name: string;
  type: string;
  options: string[];
};

export type Tournament = {
  slug: string;
  name: string;
  participants: Participant[];
  registrationOptions: RegistrationOption[];
  participantPaidStatuses: Record<Id, Record<number, boolean>>;
  participantRegisteredStatuses: Record<Id, Record<number, boolean>>;
  updatingCheckboxes: string[];
};

export type AdminedTournament = {
  slug: string;
  name: string;
};

export enum Mode {
  STARTGG = 'start.gg',
}
