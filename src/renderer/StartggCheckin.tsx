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
  cloneElement,
  Dispatch,
  MouseEvent,
  ReactElement,
  SetStateAction,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Participant,
  RegistrationOption,
  Tournament,
  Id,
  FilterState,
  DEFAULT_FILTER_STATE,
} from '../common/types';
import { PaidMenu, AddedMenu } from './FilterMenus';

const COLUMN_GAP_PX = 8; // between option columns, and name column <-> options
const ROW_PADDING_X_PX = 24;
const CONTROL_GAP_PX = 4; // between the two controls inside an event column
const SMALL_CONTROL_PX = 38; // small Checkbox natural size == forced IconButton size
const EVENT_COL_MIN_PX = SMALL_CONTROL_PX * 2 + CONTROL_GAP_PX;
const TOOLTIP_ENTER_DELAY_MS = 350;
const LABEL_WIDTH_PAD_PX = 8;
const NAME_COL_MAX_PX = 500;
const NAME_COL_MIN_PX = 290;
const VENUE_COL_MAX_PX = 200;
const VENUE_COL_MIN_PX = 120;
const NAME_COL_WIDTH = `max(${NAME_COL_MIN_PX}px, min(${NAME_COL_MAX_PX}px, 25%))`;
const COLUMN_GAP = `${COLUMN_GAP_PX}px`;
const CONTROL_GAP = `${CONTROL_GAP_PX}px`;

const EVENT_STARTED_REASON = 'EVENT STARTED — cannot add';
const FREE_REASON = 'FREE — no payment required';

const ACTIVE_ICON_BUTTON_SX = { backgroundColor: 'action.selected' } as const;
const SMALL_ICON_BUTTON_SX = {
  width: `${SMALL_CONTROL_PX}px`,
  height: `${SMALL_CONTROL_PX}px`,
} as const;

function disabledReason(
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
  if (kind == 'added') {
    return registrationOption.started ? EVENT_STARTED_REASON : '';
  }
  if (registrationOption.free) {
    return FREE_REASON;
  }
  if (
    registrationOption.type == 'event' &&
    registrationOption.started &&
    !tournamentParticipant.registeredStatuses[registrationOption.id]
  ) {
    return EVENT_STARTED_REASON;
  }
  return '';
}

function EllipsisTooltip({
  title,
  children,
}: {
  title: string;
  children: ReactElement;
}) {
  const [overflowed, setOverflowed] = useState(false);
  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY_MS}
      title={overflowed ? title : ''}
    >
      {cloneElement(children, {
        onMouseEnter: (event: MouseEvent<HTMLElement>) => {
          const el = event.currentTarget;
          setOverflowed(el.scrollWidth > el.clientWidth);
        },
      })}
    </Tooltip>
  );
}

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
      <Tooltip arrow enterDelay={TOOLTIP_ENTER_DELAY_MS} title="Apply Filter">
        <IconButton
          size={small ? 'small' : 'medium'}
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
  const registrationOptionsKey = startggTournament.registrationOptions
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
  }, [registrationOptionsKey]);
  const columnWidthPx = (registrationOption: RegistrationOption) => {
    const labelWidth =
      Math.ceil(measuredLabelWidths[registrationOption.id] ?? 0) +
      LABEL_WIDTH_PAD_PX;
    return registrationOption.type == 'event'
      ? Math.max(EVENT_COL_MIN_PX, labelWidth)
      : Math.min(VENUE_COL_MAX_PX, Math.max(VENUE_COL_MIN_PX, labelWidth));
  };

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

  const optionCount = startggTournament.registrationOptions.length;
  const columnWidthTotalPx = startggTournament.registrationOptions.reduce(
    (total, registrationOption) => total + columnWidthPx(registrationOption),
    0,
  );
  const restPx =
    ROW_PADDING_X_PX * 2 +
    COLUMN_GAP_PX +
    columnWidthTotalPx +
    COLUMN_GAP_PX * Math.max(0, optionCount - 1);
  const nameColPx = Math.min(
    NAME_COL_MAX_PX,
    Math.max(NAME_COL_MIN_PX, restPx / 3),
  );
  const tableMinWidth = `${Math.ceil(restPx + nameColPx)}px`;

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
      {/* Invisible copies of each option label, used only to measure their
          natural width for columnWidthPx above - never shown */}
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
        {startggTournament.registrationOptions.map((registrationOption) => (
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
            spacing={COLUMN_GAP}
            useFlexGap
            padding={`0 ${ROW_PADDING_X_PX}px`}
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
                minWidth: NAME_COL_WIDTH,
                backgroundColor: 'background.paper',
                alignSelf: 'stretch',
                marginTop: '-8px',
                marginBottom: '-8px',
                boxSizing: 'border-box',
                padding: '8px 12px',
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
                <Tooltip
                  arrow
                  enterDelay={TOOLTIP_ENTER_DELAY_MS}
                  title="Copy Listed Participants"
                >
                  <IconButton onClick={copyFilteredParticipants}>
                    <ContentCopy />
                  </IconButton>
                </Tooltip>
                <Tooltip
                  arrow
                  enterDelay={TOOLTIP_ENTER_DELAY_MS}
                  title="Refresh"
                >
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
                <Tooltip
                  arrow
                  enterDelay={TOOLTIP_ENTER_DELAY_MS}
                  title="Clear all filters"
                >
                  <IconButton onClick={resetFilters}>
                    <FilterListOff />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              spacing={COLUMN_GAP}
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
                        width: `${columnWidthPx(registrationOption)}px`,
                        zIndex: 3,
                        flexShrink: 0,
                      }}
                    >
                      <EllipsisTooltip title={registrationOption.name}>
                        <Typography
                          key={`${id}-name`}
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
                      </EllipsisTooltip>

                      <Stack
                        direction="row"
                        justifyContent="center"
                        spacing={CONTROL_GAP}
                        sx={{
                          width: '100%',
                          minWidth: '100%',
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
                .map((tournamentParticipant: Participant) => {
                  const participantName =
                    (tournamentParticipant.prefix
                      ? `${tournamentParticipant.prefix} | `
                      : '') + tournamentParticipant.displayName;
                  return (
                    <Stack
                      key={tournamentParticipant.id}
                      direction="row"
                      alignItems="center"
                      spacing={COLUMN_GAP}
                      useFlexGap
                      padding={`4px ${ROW_PADDING_X_PX}px`}
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
                          boxSizing: 'border-box',
                          borderRight: '1px solid',
                          borderColor: 'divider',
                          alignSelf: 'stretch',
                          marginTop: '-4px',
                          marginBottom: '-4px',
                        }}
                      >
                        <EllipsisTooltip title={participantName}>
                          <Typography
                            noWrap
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {participantName}
                          </Typography>
                        </EllipsisTooltip>
                      </Stack>
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={COLUMN_GAP}
                        sx={{
                          flex: 1,
                          justifyContent: 'space-between',
                        }}
                      >
                        {startggTournament.registrationOptions.map(
                          (registrationOption) => {
                            const paidReason = disabledReason(
                              startggTournament,
                              tournamentParticipant,
                              registrationOption,
                              'paid',
                            );
                            const addedReason = disabledReason(
                              startggTournament,
                              tournamentParticipant,
                              registrationOption,
                              'added',
                            );
                            return registrationOption.type == 'tournament' ? (
                              <Stack
                                key={`${registrationOption.id}-checkboxes`}
                                alignItems="center"
                                sx={{
                                  width: `${columnWidthPx(
                                    registrationOption,
                                  )}px`,
                                  flexShrink: 0,
                                }}
                              >
                                <Tooltip
                                  enterDelay={TOOLTIP_ENTER_DELAY_MS}
                                  title={paidReason}
                                >
                                  <span>
                                    <Checkbox
                                      disabled={paidReason != ''}
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
                                spacing={CONTROL_GAP}
                                justifyContent="center"
                                sx={{
                                  width: `${columnWidthPx(
                                    registrationOption,
                                  )}px`,
                                  flexShrink: 0,
                                }}
                              >
                                <Tooltip
                                  enterDelay={TOOLTIP_ENTER_DELAY_MS}
                                  title={paidReason}
                                >
                                  <span>
                                    <Checkbox
                                      disabled={paidReason != ''}
                                      size="small"
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
                                  enterDelay={TOOLTIP_ENTER_DELAY_MS}
                                  title={addedReason}
                                >
                                  <span>
                                    <Checkbox
                                      disabled={addedReason != ''}
                                      size="small"
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
                            );
                          },
                        )}
                      </Stack>
                    </Stack>
                  );
                })
            )}
          </Stack>
        </Stack>
      </Stack>
    </>
  );
}
