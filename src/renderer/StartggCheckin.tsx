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
import {
  Dispatch,
  SetStateAction,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Participant,
  Tournament,
  Id,
  FilterState,
  DEFAULT_FILTER_STATE,
} from '../common/types';
import { PaidMenu, AddedMenu } from './FilterMenus';

const EVENT_COL_MIN_PX = 64;
const LABEL_WIDTH_PAD_PX = 8;
const NAME_COL_MAX_PX = 500;
const NAME_COL_MIN_PX = 290;
const VENUE_COL_MAX_PX = 200;
const NAME_COL_WIDTH = `max(${NAME_COL_MIN_PX}px, min(${NAME_COL_MAX_PX}px, 25%))`;
const VENUE_COL_WIDTH = `min(${VENUE_COL_MAX_PX}px, 20%)`;

const ACTIVE_ICON_BUTTON_SX = { backgroundColor: 'action.selected' } as const;
const SMALL_ICON_BUTTON_SX = {
  width: '38px',
  height: '38px',
  marginRight: '-12px',
} as const;

function FilterIconButton({
  small,
  active,
  buttonRef,
  onClick,
}: {
  small: boolean;
  active: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
}) {
  return (
    <span>
      <Tooltip arrow title="Apply Filter">
        <IconButton
          size={small ? 'small' : 'medium'}
          edge="end"
          sx={[small && SMALL_ICON_BUTTON_SX, active && ACTIVE_ICON_BUTTON_SX]}
          ref={buttonRef}
          onClick={onClick}
        >
          <FilterList />
        </IconButton>
      </Tooltip>
    </span>
  );
}

export default function StartggCheckin({
  startggTournament,
  copyFilteredParticipants,
  gettingTournament,
  searchText,
  setGettingTournament,
  setSearchText,
  showErrorDialog,
  filterState,
  setFilterState,
  paidMenuOpen,
  setPaidMenuOpen,
  registeredMenuOpen,
  setRegisteredMenuOpen,
  resetFilters,
}: {
  startggTournament: Tournament;
  copyFilteredParticipants: () => void;
  gettingTournament: boolean;
  searchText: string;
  setGettingTournament: (val: boolean) => void;
  setSearchText: (val: string) => void;
  showErrorDialog: (errors: string[]) => void;
  filterState: Record<Id, FilterState>;
  setFilterState: Dispatch<SetStateAction<Record<Id, FilterState>>>;
  paidMenuOpen: Record<Id, boolean>;
  setPaidMenuOpen: Dispatch<SetStateAction<Record<Id, boolean>>>;
  registeredMenuOpen: Record<Id, boolean>;
  setRegisteredMenuOpen: Dispatch<SetStateAction<Record<Id, boolean>>>;
  resetFilters: () => void;
}) {
  const paidButtonRefs = useRef<Record<Id, HTMLButtonElement | null>>({});
  const registeredButtonRefs = useRef<Record<Id, HTMLButtonElement | null>>({});

  const labelMeasureRefs = useRef<Record<Id, HTMLSpanElement | null>>({});
  const [measuredLabelWidths, setMeasuredLabelWidths] = useState<
    Record<Id, number>
  >({});
  const eventRegistrationOptionsKey = startggTournament.registrationOptions
    .filter((registrationOption) => registrationOption.type == 'event')
    .map((registrationOption) => registrationOption.id)
    .join(',');
  useLayoutEffect(() => {
    const next: Record<Id, number> = {};
    Object.entries(labelMeasureRefs.current).forEach(([id, el]) => {
      if (el) {
        next[Number(id)] = el.getBoundingClientRect().width;
      }
    });
    setMeasuredLabelWidths(next);
  }, [eventRegistrationOptionsKey]);
  const eventColumnWidthPx = (id: Id) =>
    Math.max(
      EVENT_COL_MIN_PX,
      Math.ceil(measuredLabelWidths[id] ?? 0) + LABEL_WIDTH_PAD_PX,
    );

  const filterFor = (id: Id) => filterState[id] ?? DEFAULT_FILTER_STATE;

  const updateFilter = (id: Id, update: Partial<FilterState>) => {
    setFilterState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_FILTER_STATE), ...update },
    }));
  };

  const openPaidMenu = (id: Id) =>
    setPaidMenuOpen((prev) => ({ ...prev, [id]: true }));
  const closePaidMenu = (id: Id) =>
    setPaidMenuOpen((prev) => ({ ...prev, [id]: false }));

  const openRegisteredMenu = (id: Id) =>
    setRegisteredMenuOpen((prev) => ({ ...prev, [id]: true }));
  const closeRegisteredMenu = (id: Id) =>
    setRegisteredMenuOpen((prev) => ({ ...prev, [id]: false }));
  const tournamentOptionCount = startggTournament.registrationOptions.filter(
    (registrationOption) => registrationOption.type == 'tournament',
  ).length;
  const eventColumnWidthTotalPx = startggTournament.registrationOptions
    .filter((registrationOption) => registrationOption.type == 'event')
    .reduce(
      (total, registrationOption) =>
        total + eventColumnWidthPx(registrationOption.id),
      0,
    );
  const columnGaps = (startggTournament.registrationOptions.length + 1) * 32;
  const tableMinWidth = `${
    NAME_COL_MAX_PX +
    tournamentOptionCount * VENUE_COL_MAX_PX +
    eventColumnWidthTotalPx +
    columnGaps
  }px`;

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
      {/* Invisible copies of each event label, used only to measure their
          natural width for eventColumnWidthPx above - never shown */}
      <div
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          top: -9999,
          left: -9999,
        }}
      >
        {startggTournament.registrationOptions
          .filter((registrationOption) => registrationOption.type == 'event')
          .map((registrationOption) => (
            <Typography
              key={registrationOption.id}
              component="span"
              sx={{ fontWeight: 'bold' }}
              ref={(el: HTMLSpanElement | null) => {
                labelMeasureRefs.current[registrationOption.id] = el;
              }}
            >
              {registrationOption.name}
            </Typography>
          ))}
      </div>
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
            useFlexGap
            padding="0 24px"
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backgroundColor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              paddingTop: '8px',
              paddingBottom: '8px',
              marginTop: '4px',
              marginBottom: '4px',
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 4,
                width: NAME_COL_WIDTH,
                'min-width': NAME_COL_WIDTH,
                backgroundColor: 'background.paper',
                alignSelf: 'stretch',
                marginTop: '-8px',
                marginBottom: '-8px',
                boxSizing: 'border-box',
                padding: '8px 12px',
                borderBottom: '1px solid',
                borderColor: 'divider',
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
                  flex: 1,
                  minWidth: 0,
                }}
              />
              <Stack
                direction="row"
                spacing="4px"
                sx={{
                  flexShrink: 0,
                }}
              >
                <Tooltip arrow title="Copy Listed Participants">
                  <IconButton onClick={copyFilteredParticipants}>
                    <ContentCopy />
                  </IconButton>
                </Tooltip>
                <Tooltip arrow title="Refresh">
                  <IconButton
                    onClick={async () => {
                      try {
                        setGettingTournament(true);
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
                <Tooltip arrow title="Clear all filters">
                  <IconButton onClick={resetFilters}>
                    <FilterListOff />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              spacing="8px"
              sx={{
                flex: 1,
                justifyContent: 'space-between',
              }}
            >
              {startggTournament.registrationOptions.map(
                (registrationOption) => {
                  const { id } = registrationOption;
                  const isEvent = registrationOption.type == 'event';
                  const filter = filterFor(id);
                  return (
                    <Stack
                      key={id}
                      sx={{
                        width: isEvent
                          ? `${eventColumnWidthPx(id)}px`
                          : VENUE_COL_WIDTH,
                        zIndex: 3,
                        flexShrink: 0,
                      }}
                    >
                      <Tooltip title={registrationOption.name}>
                        <Typography
                          key={`${id}-name`}
                          noWrap
                          align="center"
                          sx={{
                            fontWeight: 'bold',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            transform: 'translateX(6px)',
                          }}
                        >
                          {registrationOption.name}
                        </Typography>
                      </Tooltip>

                      <Stack
                        direction="row"
                        justifyContent="center"
                        spacing="4px"
                        sx={{
                          width: '100%',
                          'min-width': '100%',
                        }}
                      >
                        <FilterIconButton
                          small={isEvent}
                          active={!!paidMenuOpen[id]}
                          buttonRef={(el) => {
                            paidButtonRefs.current[id] = el;
                          }}
                          onClick={() => openPaidMenu(id)}
                        />
                        <PaidMenu
                          anchorEl={paidButtonRefs.current[id]}
                          open={!!paidMenuOpen[id]}
                          onClose={() => closePaidMenu(id)}
                          paidState={filter.paid}
                          onPaidChange={(paid) => updateFilter(id, { paid })}
                        />

                        {isEvent && (
                          <>
                            <FilterIconButton
                              small
                              active={!!registeredMenuOpen[id]}
                              buttonRef={(el) => {
                                registeredButtonRefs.current[id] = el;
                              }}
                              onClick={() => openRegisteredMenu(id)}
                            />
                            <AddedMenu
                              anchorEl={registeredButtonRefs.current[id]}
                              open={!!registeredMenuOpen[id]}
                              onClose={() => closeRegisteredMenu(id)}
                              addedState={filter.added}
                              onAddedChange={(added) =>
                                updateFilter(id, { added })
                              }
                              dqdState={filter.dqd}
                              onDqdChange={(dqd) => updateFilter(id, { dqd })}
                              pools={filter.pools}
                              onPoolsChange={(pools) =>
                                updateFilter(id, { pools })
                              }
                            />
                          </>
                        )}
                      </Stack>
                    </Stack>
                  );
                },
              )}
            </Stack>
          </Stack>

          <Stack>
            {gettingTournament ? (
              <Stack direction="row" margin="8px 24px" spacing="8px">
                <CircularProgress size="24px" />
                <Typography>Getting tournament attendees ...</Typography>
              </Stack>
            ) : (
              startggTournament.participants
                .filter(
                  (tournamentParticipant) => !tournamentParticipant.filtered,
                )
                .map((tournamentParticipant: Participant) => (
                  <Stack
                    key={tournamentParticipant.id}
                    direction="row"
                    alignItems="center"
                    spacing="8px"
                    useFlexGap
                    padding="4px 24px"
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      sx={{
                        width: NAME_COL_WIDTH,
                        flexShrink: 0,
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        backgroundColor: 'background.paper',
                        borderRight: '1px solid',
                        borderColor: 'divider',
                        alignSelf: 'stretch',
                        marginTop: '-4px',
                        marginBottom: '-4px',
                      }}
                    >
                      <Tooltip
                        title={`${
                          (tournamentParticipant.prefix
                            ? `${tournamentParticipant.prefix} | `
                            : '') + tournamentParticipant.displayName
                        } (${tournamentParticipant.id})`}
                      >
                        <Typography
                          noWrap
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {(tournamentParticipant.prefix
                            ? `${tournamentParticipant.prefix} | `
                            : '') + tournamentParticipant.displayName}
                        </Typography>
                      </Tooltip>
                    </Stack>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing="8px"
                      sx={{
                        flex: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      {startggTournament.registrationOptions.map(
                        (registrationOption) =>
                          registrationOption.type == 'tournament' ? (
                            <Stack
                              key={`${registrationOption.id}-checkboxes`}
                              alignItems="center"
                              sx={{
                                width: VENUE_COL_WIDTH,
                                flexShrink: 0,
                              }}
                            >
                              <Tooltip
                                title={`${
                                  (tournamentParticipant.prefix
                                    ? `${tournamentParticipant.prefix} | `
                                    : '') + tournamentParticipant.displayName
                                } — ${registrationOption.name}${
                                  registrationOption.free
                                    ? ' — FREE'
                                    : ' — Paid'
                                }`}
                              >
                                <span>
                                  <Checkbox
                                    disabled={
                                      startggTournament.updatingCheckboxes.includes(
                                        `${tournamentParticipant.id};${registrationOption.id}`,
                                      ) || registrationOption.free
                                    }
                                    edge="end"
                                    checked={
                                      !!tournamentParticipant.paidStatuses[
                                        registrationOption.id
                                      ]
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
                                width: `${eventColumnWidthPx(
                                  registrationOption.id,
                                )}px`,
                                flexShrink: 0,
                              }}
                            >
                              <Tooltip
                                title={`${
                                  (tournamentParticipant.prefix
                                    ? `${tournamentParticipant.prefix} | `
                                    : '') + tournamentParticipant.displayName
                                } — ${registrationOption.name}${
                                  registrationOption.free
                                    ? ' — FREE'
                                    : ' — Paid'
                                }`}
                              >
                                <span>
                                  <Checkbox
                                    disabled={
                                      startggTournament.updatingCheckboxes.includes(
                                        `${tournamentParticipant.id};${registrationOption.id}`,
                                      ) || registrationOption.free
                                    }
                                    size="small"
                                    edge="end"
                                    checked={
                                      !!tournamentParticipant.paidStatuses[
                                        registrationOption.id
                                      ]
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
                                    : `${
                                        (tournamentParticipant.prefix
                                          ? `${tournamentParticipant.prefix} | `
                                          : '') +
                                        tournamentParticipant.displayName
                                      } — ${registrationOption.name} — Added`
                                }
                              >
                                <span>
                                  <Checkbox
                                    disabled={
                                      startggTournament.updatingCheckboxes.includes(
                                        `${tournamentParticipant.id};${registrationOption.id}`,
                                      ) || registrationOption.started
                                    }
                                    size="small"
                                    edge="end"
                                    checked={
                                      !!tournamentParticipant
                                        .registeredStatuses[
                                        registrationOption.id
                                      ]
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
                  </Stack>
                ))
            )}
          </Stack>
        </Stack>
      </Stack>
    </>
  );
}
