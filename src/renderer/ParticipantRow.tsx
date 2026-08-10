import { ReactElement } from 'react';
import { Checkbox, Stack, Tooltip, Typography } from '@mui/material';
import type { RowComponentProps } from 'react-window';
import {
  Id,
  Participant,
  RegistrationOption,
  Tournament,
} from '../common/types';
import EllipsisTooltip from './EllipsisTooltip';
import {
  COLUMN_GAP,
  CONTROL_GAP,
  NAME_COL_WIDTH,
  ROW_PADDING_X_PX,
  TOOLTIP_ENTER_DELAY_MS,
} from './checkinMetrics';

const EVENT_STARTED_REASON = 'EVENT STARTED — cannot add';
const FREE_REASON = 'FREE — no payment required';

export function disabledReason(
  startggTournament: Tournament,
  tournamentParticipant: Participant,
  registrationOption: RegistrationOption,
  kind: 'paid' | 'added',
) {
  if (
    startggTournament.updatingCheckboxes.includes(
      `${tournamentParticipant.id};${registrationOption.id}`,
    )
  ) {
    return 'Updating…';
  }
  if (kind === 'added') {
    return registrationOption.started ? EVENT_STARTED_REASON : '';
  }
  if (registrationOption.free) {
    return FREE_REASON;
  }
  if (
    registrationOption.type === 'event' &&
    registrationOption.started &&
    !tournamentParticipant.registeredStatuses[registrationOption.id]
  ) {
    return EVENT_STARTED_REASON;
  }
  return '';
}

const NAME_CELL_SX = {
  width: NAME_COL_WIDTH,
  flexShrink: 0,
  position: 'sticky',
  left: 0,
  zIndex: 1,
  backgroundColor: 'background.paper',
  boxSizing: 'border-box',
  borderRight: '1px solid',
  borderColor: 'divider',
  alignSelf: 'stretch',
  marginTop: '-4px',
  marginBottom: '-4px',
} as const;

const NAME_TEXT_SX = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const CELLS_SX = { flex: 1, justifyContent: 'space-between' } as const;
const ROW_SX = { boxSizing: 'border-box' } as const;

function CheckboxCell({
  reason,
  small,
  checked,
  onToggle,
}: {
  reason: string;
  small: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const control = (
    <span>
      <Checkbox
        disabled={reason !== ''}
        size={small ? 'small' : 'medium'}
        checked={checked}
        onClick={onToggle}
      />
    </span>
  );
  return reason === '' ? (
    control
  ) : (
    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY_MS} title={reason}>
      {control}
    </Tooltip>
  );
}

export type ParticipantRowProps = {
  startggTournament: Tournament;
  participants: Participant[];
  widths: Record<Id, number>;
  minWidth: string;
  onTogglePaid: (attendee: Id, option: Id) => void;
  onToggleAdded: (attendee: Id, option: Id) => void;
};

export default function ParticipantRow({
  index,
  style,
  ariaAttributes,
  startggTournament,
  participants,
  widths,
  minWidth,
  onTogglePaid,
  onToggleAdded,
}: RowComponentProps<ParticipantRowProps>): ReactElement | null {
  const tournamentParticipant = participants[index];
  if (tournamentParticipant === undefined) {
    return null;
  }

  const participantName =
    (tournamentParticipant.prefix ? `${tournamentParticipant.prefix} | ` : '') +
    tournamentParticipant.displayName;

  return (
    <Stack
      role={ariaAttributes.role}
      aria-posinset={ariaAttributes['aria-posinset']}
      aria-setsize={ariaAttributes['aria-setsize']}
      direction="row"
      alignItems="center"
      spacing={COLUMN_GAP}
      useFlexGap
      padding={`4px ${ROW_PADDING_X_PX}px`}
      style={{ ...style, minWidth }}
      sx={ROW_SX}
    >
      <Stack direction="row" alignItems="center" sx={NAME_CELL_SX}>
        <EllipsisTooltip title={participantName}>
          <Typography noWrap sx={NAME_TEXT_SX}>
            {participantName}
          </Typography>
        </EllipsisTooltip>
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        spacing={COLUMN_GAP}
        sx={CELLS_SX}
      >
        {startggTournament.registrationOptions.map((registrationOption) => {
          const { id } = registrationOption;
          const isEvent = registrationOption.type === 'event';
          const cellSx = { width: `${widths[id]}px`, flexShrink: 0 };
          const paidCell = (
            <CheckboxCell
              reason={disabledReason(
                startggTournament,
                tournamentParticipant,
                registrationOption,
                'paid',
              )}
              small={isEvent}
              checked={!!tournamentParticipant.paidStatuses[id]}
              onToggle={() => onTogglePaid(tournamentParticipant.id, id)}
            />
          );

          return isEvent ? (
            <Stack
              key={`${id}-checkboxes`}
              direction="row"
              spacing={CONTROL_GAP}
              justifyContent="center"
              sx={cellSx}
            >
              {paidCell}
              <CheckboxCell
                reason={disabledReason(
                  startggTournament,
                  tournamentParticipant,
                  registrationOption,
                  'added',
                )}
                small
                checked={!!tournamentParticipant.registeredStatuses[id]}
                onToggle={() => onToggleAdded(tournamentParticipant.id, id)}
              />
            </Stack>
          ) : (
            <Stack key={`${id}-checkboxes`} alignItems="center" sx={cellSx}>
              {paidCell}
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
