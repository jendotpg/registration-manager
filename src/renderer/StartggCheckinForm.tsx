import {
  RegistrationOption,
  Participant,
  Tournament,
  Id,
} from '../common/types';
import {
  CircularProgress,
  Checkbox,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Refresh } from '@mui/icons-material';

const NAME_COL_WIDTH = '256px';
const VENUE_COL_WIDTH = '96px';
const EVENT_COL_WIDTH = '126px';

export default function StartggCheckinForm({
  gettingTournament,
  startggTournament,
  setGettingTournament,
  close,
}: {
  gettingTournament: boolean;
  startggTournament: Tournament;
  setGettingTournament: (val: boolean) => void;
  close: () => void;
}) {
  const tableMinWidth = `calc(${NAME_COL_WIDTH} + ${VENUE_COL_WIDTH} + ${
    startggTournament.registrationOptions.length
  } * ${EVENT_COL_WIDTH} + ${
    (startggTournament.registrationOptions.length + 1) * 32
  }px)`;
  return startggTournament.slug == '' ? (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      margin="16px"
      padding="8px"
    >
      <DialogTitle sx={{ padding: 0 }}>No tournament selected!</DialogTitle>
    </Stack>
  ) : (
    <>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        margin="16px"
        padding="8px"
      >
        <DialogTitle sx={{ padding: 0 }}>{startggTournament.name}</DialogTitle>
        <Tooltip arrow title="Refresh">
          <IconButton
            onClick={() => {
              window.electron.getStartggTournament(startggTournament.slug);
            }}
          >
            <Refresh />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack
        sx={{
          overflow: 'auto',
          maxHeight: 'calc(80vh - 140px)',
        }}
      >
        <Stack sx={{ minWidth: tableMinWidth }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing="32px"
            padding="0 24px"
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backgroundColor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography
              noWrap
              sx={{
                width: NAME_COL_WIDTH,
                flexShrink: 0,
                fontWeight: 'bold',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                position: 'sticky',
                left: 0,
                zIndex: 3,
                backgroundColor: 'background.paper',
              }}
            >
              Name
            </Typography>

            {startggTournament.registrationOptions.map((registrationOption) => (
              <Typography
                key={`${registrationOption.id}-name`}
                noWrap
                align="center"
                sx={{
                  width:
                    registrationOption.type == 'tournament'
                      ? VENUE_COL_WIDTH
                      : EVENT_COL_WIDTH,
                  flexShrink: 0,
                  fontWeight: 'bold',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {registrationOption.name}
              </Typography>
            ))}
          </Stack>

          <Stack>
            {gettingTournament ? (
              <Stack direction="row" margin="8px 24px" spacing="8px">
                <CircularProgress size="24px" />
                <DialogContentText>
                  Getting tournament attendees ...
                </DialogContentText>
              </Stack>
            ) : (
              startggTournament.participants.map(
                (tournamentParticipant: Participant) => (
                  <Stack
                    key={tournamentParticipant.id}
                    direction="row"
                    alignItems="center"
                    spacing="32px"
                    padding="4px 24px"
                  >
                    <Typography
                      noWrap
                      sx={{
                        width: NAME_COL_WIDTH,
                        flexShrink: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        backgroundColor: 'background.paper',
                      }}
                    >
                      {(tournamentParticipant.prefix
                        ? tournamentParticipant.prefix + '|'
                        : '') + tournamentParticipant.displayName}
                    </Typography>

                    {startggTournament.registrationOptions.map(
                      (registrationOption) =>
                        registrationOption.type == 'tournament' ? (
                          <Stack
                            alignItems="center"
                            sx={{ width: VENUE_COL_WIDTH, flexShrink: 0 }}
                          >
                            <Tooltip
                              title={
                                (tournamentParticipant.prefix
                                  ? tournamentParticipant.prefix + '|'
                                  : '') +
                                tournamentParticipant.displayName +
                                ' — ' +
                                registrationOption.name +
                                ' — Paid'
                              }
                            >
                              <Checkbox
                                disabled={startggTournament.updatingCheckboxes.includes(
                                  tournamentParticipant.id +
                                    ';' +
                                    registrationOption.id,
                                )}
                                edge="end"
                                checked={
                                  !!startggTournament.participantPaidStatuses[
                                    tournamentParticipant.id
                                  ]?.[registrationOption.id]
                                }
                                onClick={() => {
                                  window.electron.toggleParticipantPaid(
                                    tournamentParticipant.id,
                                    registrationOption.id,
                                  );
                                }}
                              />
                            </Tooltip>
                          </Stack>
                        ) : (
                          <Stack
                            key={`${registrationOption.id}-checkboxes`}
                            direction="row"
                            spacing="4px"
                            justifyContent="center"
                            sx={{ width: EVENT_COL_WIDTH, flexShrink: 0 }}
                          >
                            <Tooltip
                              title={
                                (tournamentParticipant.prefix
                                  ? tournamentParticipant.prefix + '|'
                                  : '') +
                                tournamentParticipant.displayName +
                                ' — ' +
                                registrationOption.name +
                                ' — Paid'
                              }
                            >
                              <Checkbox
                                disabled={startggTournament.updatingCheckboxes.includes(
                                  tournamentParticipant.id +
                                    ';' +
                                    registrationOption.id,
                                )}
                                size="small"
                                edge="end"
                                checked={
                                  !!startggTournament.participantPaidStatuses[
                                    tournamentParticipant.id
                                  ]?.[registrationOption.id]
                                }
                                onClick={() => {
                                  window.electron.toggleParticipantPaid(
                                    tournamentParticipant.id,
                                    registrationOption.id,
                                  );
                                }}
                              />
                            </Tooltip>
                            <Tooltip
                              title={
                                (tournamentParticipant.prefix
                                  ? tournamentParticipant.prefix + '|'
                                  : '') +
                                tournamentParticipant.displayName +
                                ' — ' +
                                registrationOption.name +
                                ' — Added'
                              }
                            >
                              <Checkbox
                                disabled={startggTournament.updatingCheckboxes.includes(
                                  tournamentParticipant.id +
                                    ';' +
                                    registrationOption.id,
                                )}
                                size="small"
                                edge="end"
                                checked={
                                  !!startggTournament
                                    .participantRegisteredStatuses[
                                    tournamentParticipant.id
                                  ]?.[registrationOption.id]
                                }
                                onClick={() => {
                                  window.electron.toggleParticipantAdded(
                                    tournamentParticipant.id,
                                    registrationOption.id,
                                  );
                                }}
                              />
                            </Tooltip>
                          </Stack>
                        ),
                    )}
                  </Stack>
                ),
              )
            )}
          </Stack>
        </Stack>
      </Stack>
    </>
  );
}
