import {
  RegistrationOption,
  Participant,
  Tournament,
  Id,
} from '../common/types';
import {
  CircularProgress,
  Checkbox,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Refresh } from '@mui/icons-material';

const NAME_COL_WIDTH = '15%';
const VENUE_COL_WIDTH = '10%';
const EVENT_COL_WIDTH = '13%';

export default function StartggCheckin({
  gettingTournament,
  startggTournament,
  setGettingTournament,
  showErrorDialog,
}: {
  gettingTournament: boolean;
  startggTournament: Tournament;
  setGettingTournament: (val: boolean) => void;
  showErrorDialog: (errors: string[]) => void;
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
      <Typography sx={{ padding: 0 }}>No tournament selected!</Typography>
    </Stack>
  ) : (
    <>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        margin="16px"
        padding="8px"
        sx={{
          overflow: 'auto',
          maxHeight: '10vh',
        }}
      >
        <Typography sx={{ padding: 0 }}>{startggTournament.name}</Typography>
        <Tooltip arrow title="Refresh">
          <IconButton
            onClick={async () => {
              try {
                await window.electron.getStartggTournament(
                  startggTournament.slug,
                );
                setGettingTournament(false);
              } catch (e: any) {
                showErrorDialog([e instanceof Error ? e.message : e]);
              }
            }}
          >
            <Refresh />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack
        sx={{
          overflow: 'auto',
          maxHeight: '85vh',
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
              <Tooltip title={registrationOption.name}>
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
              </Tooltip>
            ))}
          </Stack>

          <Stack>
            {gettingTournament ? (
              <Stack direction="row" margin="8px 24px" spacing="8px">
                <CircularProgress size="24px" />
                <Typography>Getting tournament attendees ...</Typography>
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
                    <Tooltip
                      title={
                        (tournamentParticipant.prefix
                          ? tournamentParticipant.prefix + '|'
                          : '') +
                        tournamentParticipant.displayName +
                        ' (' +
                        tournamentParticipant.id +
                        ')'
                      }
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
                    </Tooltip>
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
                                onClick={async () => {
                                  try {
                                    await window.electron.toggleParticipantPaid(
                                      tournamentParticipant.id,
                                      registrationOption.id,
                                    );
                                  } catch (e: any) {
                                    showErrorDialog([
                                      e instanceof Error ? e.message : e,
                                    ]);
                                  }
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
                                onClick={async () => {
                                  try {
                                    await window.electron.toggleParticipantPaid(
                                      tournamentParticipant.id,
                                      registrationOption.id,
                                    );
                                  } catch (e: any) {
                                    showErrorDialog([
                                      e instanceof Error ? e.message : e,
                                    ]);
                                  }
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
                                onClick={async () => {
                                  try {
                                    await window.electron.toggleParticipantAdded(
                                      tournamentParticipant.id,
                                      registrationOption.id,
                                    );
                                  } catch (e: any) {
                                    showErrorDialog([
                                      e instanceof Error ? e.message : e,
                                    ]);
                                  }
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
