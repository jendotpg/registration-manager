import {
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
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
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { List, useListRef } from 'react-window';
import {
  Tournament,
  Id,
  FilterState,
  DEFAULT_FILTER_STATE,
  hasPoolsConfigured,
} from '../common/types';
import { PaidMenu, AddedMenu } from './FilterMenus';
import SearchField from './SearchField';
import EllipsisTooltip from './EllipsisTooltip';
import ParticipantRow from './ParticipantRow';
import {
  ACTIVE_ICON_BUTTON_SX,
  COLUMN_GAP,
  COLUMN_GAP_PX,
  CONTROL_GAP,
  NAME_COL_MAX_PX,
  NAME_COL_MIN_PX,
  NAME_COL_WIDTH,
  POOL_COL_WIDTH_PX,
  ROW_HEIGHT_PX,
  ROW_PADDING_X_PX,
  SMALL_CONTROL_PX,
  SMALL_ICON_BUTTON_SX,
  TOOLTIP_ENTER_DELAY_MS,
  columnWidths as computeColumnWidths,
} from './checkinMetrics';

const TABLE_HEIGHT_FRACTION = 0.95;

const HEADER_VIEWPORT_SX = { overflow: 'hidden', flexShrink: 0 } as const;

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

  const headerViewportRef = useRef<HTMLDivElement | null>(null);
  const listRef = useListRef(null);

  const showErrorDialogRef = useRef(showErrorDialog);
  useEffect(() => {
    showErrorDialogRef.current = showErrorDialog;
  }, [showErrorDialog]);

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

  const [listHeightPx, setListHeightPx] = useState(() =>
    Math.round(window.innerHeight * TABLE_HEIGHT_FRACTION),
  );
  useLayoutEffect(() => {
    const measure = () => {
      const headerHeight = headerViewportRef.current?.offsetHeight ?? 0;
      setListHeightPx(
        Math.max(
          ROW_HEIGHT_PX,
          Math.round(window.innerHeight * TABLE_HEIGHT_FRACTION) - headerHeight,
        ),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [registrationOptionsKey]);

  useLayoutEffect(() => {
    const header = headerViewportRef.current;
    const list = listRef.current?.element;
    if (header && list) {
      header.style.paddingRight = `${list.offsetWidth - list.clientWidth}px`;
    }
  });

  const widths = useMemo(
    () =>
      computeColumnWidths(
        startggTournament.registrationOptions,
        measuredLabelWidths,
      ),
    [startggTournament.registrationOptions, measuredLabelWidths],
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

  const onTogglePaid = useCallback(async (attendee: Id, option: Id) => {
    try {
      await window.electron.toggleParticipantPaid(attendee, option);
    } catch (e: any) {
      showErrorDialogRef.current([e instanceof Error ? e.message : e]);
    }
  }, []);
  const onToggleAdded = useCallback(async (attendee: Id, option: Id) => {
    try {
      await window.electron.toggleParticipantAdded(attendee, option);
    } catch (e: any) {
      showErrorDialogRef.current([e instanceof Error ? e.message : e]);
    }
  }, []);

  const visibleParticipants = useMemo(
    () =>
      startggTournament.participants.filter(
        (tournamentParticipant) => !tournamentParticipant.filtered,
      ),
    [startggTournament.participants],
  );

  const optionCount = startggTournament.registrationOptions.length;
  const poolColCount =
    startggTournament.registrationOptions.filter(hasPoolsConfigured).length;
  const totalColumnCount = optionCount + poolColCount;
  const columnWidthTotalPx = startggTournament.registrationOptions.reduce(
    (total, registrationOption) => total + widths[registrationOption.id],
    0,
  );
  const poolColWidthTotalPx = poolColCount * POOL_COL_WIDTH_PX;
  const restPx =
    ROW_PADDING_X_PX * 2 +
    COLUMN_GAP_PX +
    columnWidthTotalPx +
    poolColWidthTotalPx +
    COLUMN_GAP_PX * Math.max(0, totalColumnCount - 1);
  const nameColPx = Math.min(
    NAME_COL_MAX_PX,
    Math.max(NAME_COL_MIN_PX, restPx / 3),
  );
  const tableMinWidth = `${Math.ceil(restPx + nameColPx)}px`;

  return startggTournament.slug === '' ? (
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
      <Stack sx={{ maxHeight: '95vh' }}>
        <Stack ref={headerViewportRef} sx={HEADER_VIEWPORT_SX}>
          <Stack sx={{ minWidth: tableMinWidth }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={COLUMN_GAP}
              useFlexGap
              padding={`0 ${ROW_PADDING_X_PX}px`}
              sx={{
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
                <SearchField
                  key={registrationOptionsKey}
                  searchText={searchText}
                  setSearchText={setSearchText}
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
                        } catch (e: any) {
                          showErrorDialog([e instanceof Error ? e.message : e]);
                        } finally {
                          setGettingTournament(false);
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
                {startggTournament.registrationOptions.flatMap(
                  (registrationOption) => {
                    const { id } = registrationOption;
                    const isEvent = registrationOption.type === 'event';
                    const filter = filterFor(id);
                    const showPoolCol = hasPoolsConfigured(registrationOption);

                    const cols = [
                      <Stack
                        key={id}
                        data-option-cell={id}
                        sx={{
                          width: `${widths[id]}px`,
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
                            anchorEl={paidButtonRefs.current[id] ?? null}
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
                                anchorEl={
                                  registeredButtonRefs.current[id] ?? null
                                }
                                open={!!registeredMenuOpen[id]}
                                onClose={() => closeRegisteredMenu(id)}
                                addedState={filter.added}
                                onAddedChange={(added) =>
                                  updateFilter(id, { added })
                                }
                                poolOptions={registrationOption.pools ?? []}
                                pools={filter.pools}
                                onPoolsChange={(pools) =>
                                  updateFilter(id, { pools })
                                }
                              />
                            </>
                          )}
                        </Stack>
                      </Stack>,
                    ];

                    if (showPoolCol) {
                      cols.push(
                        <Stack
                          key={`${id}-pool`}
                          data-pool-header={id}
                          sx={{
                            width: `${POOL_COL_WIDTH_PX}px`,
                            zIndex: 3,
                            flexShrink: 0,
                          }}
                        >
                          <Typography
                            noWrap
                            align="center"
                            sx={{
                              fontWeight: 'bold',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            Pool
                          </Typography>
                          <Stack
                            direction="row"
                            justifyContent="center"
                            sx={{
                              width: '100%',
                              minWidth: '100%',
                              height: `${SMALL_CONTROL_PX}px`,
                            }}
                          />
                        </Stack>,
                      );
                      // Grouped so the space-between spread never pulls the
                      // Pool column away from its event.
                      return [
                        <Stack
                          key={`${id}-group`}
                          direction="row"
                          alignItems="center"
                          spacing={COLUMN_GAP}
                          sx={{ flexShrink: 0 }}
                        >
                          {cols}
                        </Stack>,
                      ];
                    }

                    return cols;
                  },
                )}
              </Stack>
            </Stack>
          </Stack>
        </Stack>

        {gettingTournament ? (
          <Stack direction="row" margin="8px 24px" spacing="8px">
            <CircularProgress size="24px" />
            <Typography>Getting tournament attendees ...</Typography>
          </Stack>
        ) : (
          <List
            listRef={listRef}
            rowComponent={ParticipantRow}
            rowCount={visibleParticipants.length}
            rowHeight={ROW_HEIGHT_PX}
            rowProps={{
              startggTournament,
              participants: visibleParticipants,
              widths,
              minWidth: tableMinWidth,
              onTogglePaid,
              onToggleAdded,
            }}
            onScroll={(event) => {
              const header = headerViewportRef.current;
              if (header) {
                header.scrollLeft = event.currentTarget.scrollLeft;
              }
            }}
            style={{ height: `${listHeightPx}px`, overflowX: 'auto' }}
            defaultHeight={listHeightPx}
          />
        )}
      </Stack>
    </>
  );
}
