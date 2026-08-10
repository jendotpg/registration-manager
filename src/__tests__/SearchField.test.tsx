/**
 * The search box in isolation.
 *
 * StartggCheckin.test.tsx covers it as part of the header; this suite is about
 * the debounce itself - what gets reported, when, and what happens to a search
 * that is still pending when something else changes. Those paths are all timing,
 * so they are easier to pin down here than through the whole table.
 *
 * Fake timers throughout, since the point is which side of a 200ms boundary
 * something lands on. user-event has to be told how to advance them
 * (setupUserWithFakeTimers) or its own inter-keystroke waits never resolve.
 *
 * @jest-environment jsdom
 */
import { act, screen } from '@testing-library/react';
import SearchField, { SEARCH_DEBOUNCE_MS } from '../renderer/SearchField';
import {
  renderWithTheme,
  setupUserWithFakeTimers,
} from '../__fixtures__/renderWithTheme';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

function renderSearchField(searchText = '') {
  const setSearchText = jest.fn();
  const user = setupUserWithFakeTimers();
  const result = renderWithTheme(
    <SearchField searchText={searchText} setSearchText={setSearchText} />,
  );
  return {
    ...result,
    user,
    setSearchText,
    input: screen.getByLabelText('Search players') as HTMLInputElement,
  };
}

/** Let the trailing debounce elapse. */
function settle() {
  act(() => {
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
}

it('starts from the text it was given', () => {
  const { input } = renderSearchField('alice');

  expect(input).toHaveValue('alice');
});

it('keeps the id the find shortcut looks for', () => {
  // App's Cmd/Ctrl-F handler does getElementById('search-bar'), so the id has to
  // survive the box moving into its own component.
  renderSearchField();

  expect(document.getElementById('search-bar')).toBeInTheDocument();
});

it('says nothing until the typing stops', async () => {
  const { user, input, setSearchText } = renderSearchField();

  await user.type(input, 'ali');

  expect(input).toHaveValue('ali');
  expect(setSearchText).not.toHaveBeenCalled();

  settle();

  expect(setSearchText).toHaveBeenCalledTimes(1);
  expect(setSearchText).toHaveBeenCalledWith('ali');
});

it('reports only the last text of a burst', async () => {
  const { user, input, setSearchText } = renderSearchField();

  await user.type(input, 'a');
  act(() => {
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
  });
  await user.type(input, 'b');
  settle();

  expect(setSearchText.mock.calls).toEqual([['ab']]);
});

it('reports an emptied box immediately', async () => {
  // Clearing the search should bring every row back at once rather than leaving
  // the table narrowed for another fifth of a second.
  const { user, input, setSearchText } = renderSearchField('alice');

  await user.clear(input);

  expect(setSearchText).toHaveBeenCalledWith('');
});

it('reports immediately on enter', async () => {
  const { user, input, setSearchText } = renderSearchField();

  await user.type(input, 'ali{Enter}');

  expect(setSearchText).toHaveBeenCalledWith('ali');
});

it('does not report twice when enter beats the debounce', async () => {
  const { user, input, setSearchText } = renderSearchField();

  await user.type(input, 'ali{Enter}');
  settle();

  expect(setSearchText.mock.calls).toEqual([['ali']]);
});

it('drops a pending search when it is unmounted', async () => {
  // A search that landed after the box went away would filter whatever replaced
  // it by the old text, and a timer still armed at teardown is what holds a test
  // worker's event loop open.
  const { user, input, setSearchText, unmount } = renderSearchField();

  await user.type(input, 'ali');
  unmount();
  settle();

  expect(setSearchText).not.toHaveBeenCalled();
});

it('follows the text when the parent changes it', async () => {
  const { user, input, rerenderWithTheme, setSearchText } = renderSearchField();

  await user.type(input, 'ali');
  rerenderWithTheme(
    <SearchField searchText="bob" setSearchText={setSearchText} />,
  );

  expect(screen.getByLabelText('Search players')).toHaveValue('bob');
  settle();
  // The pending 'ali' went with it - the parent has already said what it wants.
  expect(setSearchText).not.toHaveBeenCalled();
});
