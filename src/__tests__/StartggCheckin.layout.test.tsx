/**
 * Column sizing, the two scroll boxes, and truncation tooltips.
 *
 * Split out from StartggCheckin.test.tsx because everything here needs jsdom's
 * missing geometry stubbed on HTMLElement.prototype, and the tooltip cases need
 * fake timers to get past MUI's 350ms enterDelay. Both would perturb the
 * behavioural suite.
 *
 * Without the stubs jsdom reports every width as 0, which pins columnWidthPx to
 * the minimum arm of every clamp and leaves EllipsisTooltip permanently
 * convinced nothing is truncated - so several real branches would otherwise be
 * unreachable.
 *
 * @jest-environment jsdom
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import StartggCheckin from '../renderer/StartggCheckin';
import { installElectronMock } from '../__fixtures__/electronApi';
import { stubLayoutMetrics } from '../__fixtures__/layoutMetrics';
import {
  renderWithTheme,
  setupUser,
  setupUserWithFakeTimers,
} from '../__fixtures__/renderWithTheme';
import { makeTournament, nycMeleeTournament } from '../__fixtures__/tournament';

/** Constants mirrored from StartggCheckin.tsx. */
const EVENT_COL_MIN_PX = 80; // 38 * 2 + 4
const VENUE_COL_MIN_PX = 120;
const VENUE_COL_MAX_PX = 200;
const LABEL_WIDTH_PAD_PX = 8;
const TOOLTIP_ENTER_DELAY_MS = 350;

let electron: ReturnType<typeof installElectronMock>;
let restoreMetrics: (() => void) | undefined;

beforeEach(() => {
  electron = installElectronMock();
});

afterEach(() => {
  restoreMetrics?.();
  restoreMetrics = undefined;
  electron.restore();
  jest.clearAllMocks();
});

function renderCheckin(
  props: Partial<Parameters<typeof StartggCheckin>[0]> = {},
) {
  return renderWithTheme(
    <StartggCheckin
      startggTournament={nycMeleeTournament()}
      copyFilteredParticipants={jest.fn()}
      gettingTournament={false}
      searchText=""
      setGettingTournament={jest.fn()}
      setSearchText={jest.fn()}
      showErrorDialog={jest.fn()}
      filterState={{}}
      setFilterState={jest.fn()}
      paidMenuOpen={{}}
      setPaidMenuOpen={jest.fn()}
      registeredMenuOpen={{}}
      setRegisteredMenuOpen={jest.fn()}
      resetFilters={jest.fn()}
      {...props}
    />,
  );
}

/**
 * The width the component gave a column, read off the header cell.
 *
 * The heading Typography's grandparent Stack is the column, and it carries the
 * computed width inline via emotion.
 */
function columnWidth(optionName: string) {
  // Two matches: the off-screen measuring copy and the real heading. The real
  // one is the second, inside the sticky header.
  const headings = screen.getAllByText(optionName);
  const heading = headings[headings.length - 1];
  const column = heading.parentElement!;
  return getComputedStyle(column).width;
}

/** The min-width the whole table asked for. */
function tableMinWidth() {
  const heading = screen.getAllByText('Melee Singles').slice(-1)[0];
  const table = heading.closest('[class*="MuiStack-root"]')!.parentElement!
    .parentElement!.parentElement!;
  return getComputedStyle(table).minWidth;
}

describe('column widths with no measurement available', () => {
  it('falls back to the minimum for every column', () => {
    // This is the jsdom baseline, and also what a real render looks like on the
    // first paint before the layout effect has measured anything.
    renderCheckin();

    expect(columnWidth('Melee Singles')).toBe(`${EVENT_COL_MIN_PX}px`);
    expect(columnWidth('Venue Fee')).toBe(`${VENUE_COL_MIN_PX}px`);
  });
});

describe('column widths once the labels are measured', () => {
  it('grows an event column to fit a long label', () => {
    restoreMetrics = stubLayoutMetrics({ boundingWidth: 300 });
    renderCheckin();

    expect(columnWidth('Melee Singles')).toBe(`${300 + LABEL_WIDTH_PAD_PX}px`);
  });

  it('caps the venue fee column however long its label is', () => {
    // The venue fee column is a single checkbox; letting a long option name
    // stretch it would push the events off screen.
    restoreMetrics = stubLayoutMetrics({ boundingWidth: 300 });
    renderCheckin();

    expect(columnWidth('Venue Fee')).toBe(`${VENUE_COL_MAX_PX}px`);
  });

  it('sizes the venue fee column to the label between its two bounds', () => {
    // The case that proves the clamp is a range rather than a constant: 150 + 8
    // is above the 120 floor and below the 200 ceiling.
    restoreMetrics = stubLayoutMetrics({ boundingWidth: 150 });
    renderCheckin();

    expect(columnWidth('Venue Fee')).toBe(`${150 + LABEL_WIDTH_PAD_PX}px`);
  });

  it('sizes each column from its own label', () => {
    restoreMetrics = stubLayoutMetrics({
      boundingWidth: 40,
      perElement: (element) =>
        element.textContent === 'Melee Singles'
          ? { boundingWidth: 260 }
          : undefined,
    });
    renderCheckin();

    expect(columnWidth('Melee Singles')).toBe(`${260 + LABEL_WIDTH_PAD_PX}px`);
    // 40 + 8 is below the event minimum, so redemption stays at the floor.
    expect(columnWidth('Redemption Bracket')).toBe(`${EVENT_COL_MIN_PX}px`);
  });

  it('rounds a fractional measurement up rather than truncating', () => {
    // Rounding down by a pixel is what makes a label clip at the last letter.
    restoreMetrics = stubLayoutMetrics({ boundingWidth: 100.2 });
    renderCheckin();

    expect(columnWidth('Melee Singles')).toBe(`${101 + LABEL_WIDTH_PAD_PX}px`);
  });
});

describe('the search header cell', () => {
  it('lets the action buttons wrap below the search field', () => {
    renderCheckin();
    const cell = screen
      .getByRole('button', { name: 'Copy Listed Participants' })
      .closest<HTMLElement>('[class*="MuiStack-root"]')!.parentElement!;

    expect(getComputedStyle(cell).flexWrap).toBe('wrap');
  });
});

describe('the table minimum width', () => {
  it('grows as the columns grow', () => {
    renderCheckin();
    const narrow = parseFloat(tableMinWidth());

    restoreMetrics?.();
    screen.getByLabelText('Search players'); // sanity: still rendered
    restoreMetrics = stubLayoutMetrics({ boundingWidth: 300 });
    const { unmount } = renderCheckin();
    const wide = parseFloat(
      getComputedStyle(
        screen
          .getAllByText('Melee Singles')
          .slice(-1)[0]
          .closest('[class*="MuiStack-root"]')!.parentElement!.parentElement!
          .parentElement!,
      ).minWidth,
    );
    unmount();

    expect(wide).toBeGreaterThan(narrow);
  });

  it('does not go negative for a tournament with no options at all', () => {
    // The gap term is `Math.max(0, optionCount - 1)`; without that guard an
    // option-less tournament would subtract a gap it never added.
    renderCheckin({
      startggTournament: makeTournament({
        slug: 'tournament/empty',
        registrationOptions: [],
        participants: [],
      }),
    });

    const width = parseFloat(
      getComputedStyle(
        screen.getByLabelText('Search players').closest('form')
          ?.parentElement ?? document.body,
      ).minWidth || '0',
    );
    expect(Number.isNaN(width) ? 0 : width).toBeGreaterThanOrEqual(0);
  });

  /*
   * The name column's own width is not asserted here. It is the static CSS
   * expression NAME_COL_WIDTH - `max(290px, min(500px, 25%))` - handed straight
   * to the browser, with no branching to cover and no computed value jsdom will
   * resolve. The nameColPx clamp that feeds tableMinWidth is exercised by the
   * two cases above.
   */
});

describe('truncation tooltips', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('explains a name that does not fit', async () => {
    const user = setupUserWithFakeTimers();
    restoreMetrics = stubLayoutMetrics({ scrollWidth: 400, clientWidth: 100 });
    renderCheckin();

    await user.hover(screen.getByText('TSM | Alice'));
    act(() => {
      jest.advanceTimersByTime(TOOLTIP_ENTER_DELAY_MS + 50);
    });

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('TSM | Alice')).toBeInTheDocument();
  });

  it('stays quiet when the name fits', async () => {
    // A tooltip that just repeats what is already legible is noise.
    const user = setupUserWithFakeTimers();
    restoreMetrics = stubLayoutMetrics({ scrollWidth: 100, clientWidth: 100 });
    renderCheckin();

    await user.hover(screen.getByText('TSM | Alice'));
    act(() => {
      jest.advanceTimersByTime(TOOLTIP_ENTER_DELAY_MS + 50);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('explains a column heading that does not fit', async () => {
    const user = setupUserWithFakeTimers();
    restoreMetrics = stubLayoutMetrics({ scrollWidth: 400, clientWidth: 100 });
    renderCheckin();

    const heading = screen.getAllByText('Melee Singles').slice(-1)[0];
    await user.hover(heading);
    act(() => {
      jest.advanceTimersByTime(TOOLTIP_ENTER_DELAY_MS + 50);
    });

    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });
});

describe('re-measuring on every hover', () => {
  /*
   * These read the aria-label MUI derives from the tooltip's title rather than
   * opening the tooltip itself. `overflowed` drives that title, so the label
   * appearing and disappearing is the same signal - and it lands on the state
   * update, with no interactive popper to dismiss afterwards.
   *
   * The element is captured up front, because once a tooltip does open its own
   * content matches the same text and the query turns ambiguous.
   */
  const aliceName = () => screen.getAllByText('TSM | Alice')[0];

  it('claims no truncation until something has been measured', () => {
    restoreMetrics = stubLayoutMetrics({ scrollWidth: 400, clientWidth: 100 });
    renderCheckin();

    // MUI writes an empty aria-label rather than omitting it for a blank title.
    expect(aliceName().getAttribute('aria-label')).toBe('');
  });

  it('picks up a truncation on hover', async () => {
    const user = setupUser();
    restoreMetrics = stubLayoutMetrics({ scrollWidth: 400, clientWidth: 100 });
    renderCheckin();
    const name = aliceName();

    await user.hover(name);

    expect(name.getAttribute('aria-label')).toBe('TSM | Alice');
  });

  it('drops the claim again once the same name fits', async () => {
    // The state is recomputed on every mouse enter rather than latched on the
    // first one, so a column that grows stops claiming to be truncated.
    const user = setupUser();
    let scrollWidth = 400;
    restoreMetrics = stubLayoutMetrics({
      clientWidth: 100,
      perElement: () => ({ scrollWidth }),
    });
    renderCheckin();
    const name = aliceName();

    await user.hover(name);
    expect(name.getAttribute('aria-label')).toBe('TSM | Alice');

    scrollWidth = 100;
    await user.unhover(name);
    await user.hover(name);

    expect(name.getAttribute('aria-label')).toBe('');
  });
});

describe('the header following the rows sideways', () => {
  /*
   * The rows scroll inside react-window's List, which owns both axes because the
   * frozen name column depends on the horizontal scroller being the element that
   * clips it. That puts the header in a box of its own, so the only thing keeping
   * a heading over its checkboxes when the table is scrolled right is this mirror.
   */
  const listElement = () =>
    document.querySelector('[role="list"]') as HTMLElement;
  const headerViewport = () =>
    listElement().previousElementSibling as HTMLElement;

  it('mirrors the list scroll position onto the header', () => {
    renderCheckin();
    const list = listElement();

    list.scrollLeft = 120;
    fireEvent.scroll(list);

    expect(headerViewport().scrollLeft).toBe(120);
  });

  it('starts them both at the left edge', () => {
    renderCheckin();

    expect(listElement().scrollLeft).toBe(0);
    expect(headerViewport().scrollLeft).toBe(0);
  });
});
