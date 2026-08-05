import { Participant, Tournament, Id } from '../common/types';
import {
  CircularProgress,
  Checkbox,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  TextField,
} from '@mui/material';
import {
  Refresh,
  FilterList,
  FilterListOff,
  ContentCopy,
} from '@mui/icons-material';
import { useState } from 'react';

const NAME_COL_WIDTH = '22%';
const VENUE_COL_WIDTH = '12%';
const EVENT_COL_WIDTH_MIN = '12%';

export default function StartggCheckin({
  startggTournament,
  applyFilters,
  copyFilteredParticipants,
  gettingTournament,
  searchText,
  paidFilters,
  addedFilters,
  setGettingTournament,
  setSearchText,
  setPaidFilters,
  setAddedFilters,
  showErrorDialog,
}: {
  startggTournament: Tournament;
  applyFilters: (val: Participant) => boolean;
  copyFilteredParticipants: () => void;
  gettingTournament: boolean;
  searchText: string;
  paidFilters: Record<Id, boolean>;
  addedFilters: Record<Id, boolean>;
  setGettingTournament: (val: boolean) => void;
  setSearchText: (val: string) => void;
  setPaidFilters: (val: Record<Id, boolean>) => void;
  setAddedFilters: (val: Record<Id, boolean>) => void;
  showErrorDialog: (errors: string[]) => void;
}) {
  const tableMinWidth = `calc(${NAME_COL_WIDTH} + ${VENUE_COL_WIDTH} + ${
    startggTournament.registrationOptions.length
  } * ${`max(${EVENT_COL_WIDTH_MIN}, calc(55% / ${startggTournament.registrationOptions.length}))`} + ${
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
        margin="4px"
        padding="4px"
        sx={{
          overflow: 'auto',
          minHeight: '6vh',
          maxHeight: '6vh',
        }}
      >
        <Typography sx={{ padding: 0 }}>{startggTournament.name}</Typography>
        <Tooltip arrow title="Refresh">
          <IconButton
            onClick={async () => {
              setSearchText('');
              setPaidFilters({});
              setAddedFilters({});
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
          maxHeight: '95vh',
        }}
      >
        <Stack sx={{ minWidth: tableMinWidth }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing="8px"
            padding="0 24px"
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backgroundColor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              padding: '8px',
              margin: '4px',
            }}
          >
            <Stack
              direction="row"
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 3,
                width: NAME_COL_WIDTH,
                'min-width': NAME_COL_WIDTH,
                backgroundColor: 'white',
              }}
            >
              <TextField
                label="Search players"
                id="search-bar"
                name="search-bar"
                placeholder="TSM|Leffen"
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                }}
                size="small"
                variant="outlined"
                sx={{
                  width: '85%',
                }}
              />
              <IconButton
                onClick={copyFilteredParticipants}
                sx={{
                  width: '15%',
                }}
              >
                <ContentCopy />
              </IconButton>
            </Stack>

            {startggTournament.registrationOptions.map((registrationOption) => (
              <Stack
                sx={{
                  width:
                    registrationOption.type == 'tournament'
                      ? VENUE_COL_WIDTH
                      : `max(${EVENT_COL_WIDTH_MIN}, calc(55% / ${startggTournament.registrationOptions.length}))`,
                  zIndex: 3,
                  flexShrink: 0,
                }}
              >
                <Tooltip title={registrationOption.name}>
                  <Typography
                    key={`${registrationOption.id}-name`}
                    noWrap
                    align="center"
                    sx={{
                      fontWeight: 'bold',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {registrationOption.name}
                  </Typography>
                </Tooltip>

                {registrationOption.type == 'tournament' ? (
                  <Stack
                    direction="row"
                    justifyContent="center"
                    spacing="4px"
                    sx={{
                      width: '100%',
                      'min-width': '100%',
                    }}
                  >
                    {paidFilters[registrationOption.id] ? (
                      <IconButton
                        onClick={async () => {
                          setPaidFilters({
                            ...paidFilters,
                            [registrationOption.id]: false,
                          });
                        }}
                      >
                        <FilterListOff />
                      </IconButton>
                    ) : (
                      <IconButton
                        onClick={async () => {
                          setPaidFilters({
                            ...paidFilters,
                            [registrationOption.id]: true,
                          });
                        }}
                      >
                        <FilterList />
                      </IconButton>
                    )}
                  </Stack>
                ) : (
                  <Stack
                    direction="row"
                    justifyContent="center"
                    spacing="0px"
                    sx={{
                      width: '100%',
                      'min-width': '100%',
                    }}
                  >
                    {paidFilters[registrationOption.id] ? (
                      <IconButton
                        onClick={async () => {
                          setPaidFilters({
                            ...paidFilters,
                            [registrationOption.id]: false,
                          });
                        }}
                      >
                        <FilterListOff />
                      </IconButton>
                    ) : (
                      <IconButton
                        onClick={async () => {
                          setPaidFilters({
                            ...paidFilters,
                            [registrationOption.id]: true,
                          });
                        }}
                      >
                        <FilterList />
                      </IconButton>
                    )}
                    {addedFilters[registrationOption.id] ? (
                      <IconButton
                        onClick={async () => {
                          setAddedFilters({
                            ...addedFilters,
                            [registrationOption.id]: false,
                          });
                        }}
                      >
                        <FilterListOff />
                      </IconButton>
                    ) : (
                      <IconButton
                        onClick={async () => {
                          setAddedFilters({
                            ...addedFilters,
                            [registrationOption.id]: true,
                          });
                        }}
                      >
                        <FilterList />
                      </IconButton>
                    )}
                  </Stack>
                )}
              </Stack>
            ))}
          </Stack>

          <Stack>
            {gettingTournament ? (
              <Stack direction="row" margin="8px 24px" spacing="8px">
                <CircularProgress size="24px" />
                <Typography>Getting tournament attendees ...</Typography>
              </Stack>
            ) : (
              startggTournament.participants
                .filter(applyFilters)
                .map((tournamentParticipant: Participant) => (
                  <Stack
                    key={tournamentParticipant.id}
                    direction="row"
                    alignItems="center"
                    spacing="8px"
                    padding="4px 24px"
                  >
                    <Tooltip
                      title={
                        (tournamentParticipant.prefix
                          ? tournamentParticipant.prefix + ' | '
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
                          ? tournamentParticipant.prefix + ' | '
                          : '') + tournamentParticipant.displayName}
                      </Typography>
                    </Tooltip>
                    {startggTournament.registrationOptions.map(
                      (registrationOption) =>
                        registrationOption.type == 'tournament' ? (
                          <Stack
                            alignItems="center"
                            sx={{
                              width: VENUE_COL_WIDTH,
                              flexShrink: 0,
                            }}
                          >
                            <Tooltip
                              title={
                                (tournamentParticipant.prefix
                                  ? tournamentParticipant.prefix + ' | '
                                  : '') +
                                tournamentParticipant.displayName +
                                ' — ' +
                                registrationOption.name +
                                (registrationOption.free
                                  ? ' — FREE'
                                  : ' — Paid')
                              }
                            >
                              <span>
                                <Checkbox
                                  disabled={
                                    startggTournament.updatingCheckboxes.includes(
                                      tournamentParticipant.id +
                                        ';' +
                                        registrationOption.id,
                                    ) || registrationOption.free
                                  }
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
                              </span>
                            </Tooltip>
                          </Stack>
                        ) : (
                          <Stack
                            key={`${registrationOption.id}-checkboxes`}
                            direction="row"
                            spacing="4px"
                            justifyContent="center"
                            sx={{
                              width: `max(${EVENT_COL_WIDTH_MIN}, calc(55% / ${startggTournament.registrationOptions.length}))`,
                              flexShrink: 0,
                            }}
                          >
                            <Tooltip
                              title={
                                (tournamentParticipant.prefix
                                  ? tournamentParticipant.prefix + ' | '
                                  : '') +
                                tournamentParticipant.displayName +
                                ' — ' +
                                registrationOption.name +
                                (registrationOption.free
                                  ? ' — FREE'
                                  : ' — Paid')
                              }
                            >
                              <span>
                                <Checkbox
                                  disabled={
                                    startggTournament.updatingCheckboxes.includes(
                                      tournamentParticipant.id +
                                        ';' +
                                        registrationOption.id,
                                    ) || registrationOption.free
                                  }
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
                              </span>
                            </Tooltip>
                            <Tooltip
                              title={
                                registrationOption.started
                                  ? 'EVENT STARTED'
                                  : (tournamentParticipant.prefix
                                      ? tournamentParticipant.prefix + ' | '
                                      : '') +
                                    tournamentParticipant.displayName +
                                    ' — ' +
                                    registrationOption.name +
                                    ' — Added'
                              }
                            >
                              <span>
                                <Checkbox
                                  disabled={
                                    startggTournament.updatingCheckboxes.includes(
                                      tournamentParticipant.id +
                                        ';' +
                                        registrationOption.id,
                                    ) || registrationOption.started
                                  }
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
                              </span>
                            </Tooltip>
                          </Stack>
                        ),
                    )}
                  </Stack>
                ))
            )}
          </Stack>
        </Stack>
      </Stack>
    </>
  );
}
