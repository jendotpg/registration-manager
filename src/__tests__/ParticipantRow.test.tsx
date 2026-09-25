/**
 * One row, rendered the way react-window renders it.
 *
 * StartggCheckin's suites cover what a row shows and what clicking it does. This
 * one covers the contract with the virtualiser, which is invisible from the
 * table: a row is positioned by arithmetic on a height declared in advance, so it
 * has to be exactly that tall, and it has to survive being asked for an index
 * that is no longer there.
 *
 * Neither is observable in jsdom by looking - there is no layout, so nothing
 * overlaps and nothing drifts - which is precisely why they are asserted on the
 * markup instead.
 *
 * @jest-environment jsdom
 */
import { screen } from '@testing-library/react';
import ParticipantRow from '../renderer/ParticipantRow';
import { ROW_HEIGHT_PX } from '../renderer/checkinMetrics';
import { renderWithTheme } from '../__fixtures__/renderWithTheme';
import { nycMeleeTournament, VENUE_FEE } from '../__fixtures__/tournament';
import { REDEMPTION, SINGLES } from '../__fixtures__/nycMelee';

const TABLE_MIN_WIDTH = '900px';

/** The style react-window hands a row, for the row at `index`. */
const rowStyle = (index: number) => ({
  position: 'absolute' as const,
  left: 0,
  transform: `translateY(${index * ROW_HEIGHT_PX}px)`,
  height: ROW_HEIGHT_PX,
  width: '100%',
});

function renderRow(index: number) {
  const startggTournament = nycMeleeTournament();
  const result = renderWithTheme(
    <ParticipantRow
      index={index}
      style={rowStyle(index)}
      ariaAttributes={{
        'aria-posinset': index + 1,
        'aria-setsize': startggTournament.participants.length,
        role: 'listitem',
      }}
      startggTournament={startggTournament}
      participants={startggTournament.participants}
      widths={{ [VENUE_FEE]: 120, [SINGLES]: 80, [REDEMPTION]: 80 }}
      minWidth={TABLE_MIN_WIDTH}
      onTogglePaid={jest.fn()}
      onToggleAdded={jest.fn()}
    />,
  );
  return { ...result, startggTournament };
}

/** The row element itself: two steps up from the name, as everywhere else. */
const rowElement = (displayedName: string) =>
  screen.getByText(displayedName).parentElement!.parentElement!;

it('is exactly as tall as the height it is positioned by', () => {
  // ROW_HEIGHT_PX is a promise to react-window, not a description of the row: it
  // spaces rows out by that number whatever they actually measure, so a row that
  // came to any other height would drift further down the table with every row.
  renderRow(1);

  expect(rowElement('Bob').style.height).toBe(`${ROW_HEIGHT_PX}px`);
});

it('keeps its padding inside that height', () => {
  // There is no CssBaseline in this app, so box-sizing is content-box by
  // default and the row's 4px of padding either side would be added to the
  // height rather than fitted inside it.
  renderRow(1);

  expect(getComputedStyle(rowElement('Bob')).boxSizing).toBe('border-box');
});

it('is at least as wide as the whole table', () => {
  // react-window sizes a row at 100% of the visible width, which is narrower
  // than the table whenever the columns overflow. Without a minimum the row
  // would clip its own right-hand columns rather than giving the list something
  // to scroll over.
  renderRow(1);

  expect(rowElement('Bob').style.minWidth).toBe(TABLE_MIN_WIDTH);
});

it('is announced as an item of the list it sits in', () => {
  renderRow(1);
  const row = rowElement('Bob');

  expect(row).toHaveAttribute('role', 'listitem');
  expect(row).toHaveAttribute('aria-posinset', '2');
  expect(row).toHaveAttribute('aria-setsize', '5');
});

it('renders nothing for a participant who is no longer there', () => {
  // The row count and the participant list are handed over separately, so a
  // filter that empties the table between them must not take the app down with
  // it.
  const { container } = renderRow(99);

  expect(container).toBeEmptyDOMElement();
});

it('renders the pool identifier for seeded events and dash for unseeded events', () => {
  renderRow(0); // Alice: seeded in Singles (Pool 1), unseeded in Redemption ('—')
  const aliceRow = rowElement('TSM | Alice');
  expect(aliceRow).toHaveTextContent('1');
  expect(aliceRow).toHaveTextContent('—');
});
