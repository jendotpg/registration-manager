/**
 * The tournament picker: a free-text slug field plus the list of tournaments
 * this account admins.
 *
 * The slug field is uncontrolled - submission reads it back off the form event -
 * so these tests type into it rather than driving a prop.
 *
 * @jest-environment jsdom
 */
import { screen } from '@testing-library/react';
import { AdminedTournament } from '../common/types';
import StartggTournamentSelectorForm from '../renderer/StartggTournamentSelectorForm';
import { installElectronMock } from '../__fixtures__/electronApi';
import { linkNamedFormControls } from '../__fixtures__/namedFormControls';
import { renderWithTheme, setupUser } from '../__fixtures__/renderWithTheme';

const ADMINED: AdminedTournament[] = [
  {
    slug: 'nycmelee-s-stock-exchange-60',
    name: "NYCMelee's Stock Exchange #60",
  },
  { slug: 'garden-brawl-2026', name: 'Garden Brawl 2026' },
];

let electron: ReturnType<typeof installElectronMock>;

beforeEach(() => {
  electron = installElectronMock();
});

afterEach(() => {
  electron.restore();
  jest.clearAllMocks();
});

function renderForm(
  props: Partial<Parameters<typeof StartggTournamentSelectorForm>[0]> = {},
) {
  const getTournament = jest.fn().mockResolvedValue(undefined);
  const setGettingAdminedTournaments = jest.fn();
  const showErrorDialog = jest.fn();
  const close = jest.fn();
  const result = renderWithTheme(
    <StartggTournamentSelectorForm
      gettingAdminedTournaments={false}
      adminedTournaments={[]}
      gettingTournament={false}
      setGettingAdminedTournaments={setGettingAdminedTournaments}
      getTournament={getTournament}
      showErrorDialog={showErrorDialog}
      close={close}
      {...props}
    />,
  );
  // The submit handler reads the slug as `event.target.slug.value`, which needs
  // the named-control getter jsdom omits.
  linkNamedFormControls(result.container);
  return {
    getTournament,
    setGettingAdminedTournaments,
    showErrorDialog,
    close,
  };
}

const slugField = () => screen.getByLabelText('Tournament Slug');
const getButton = () => screen.getByRole('button', { name: /Get!/ });
const refreshButton = () =>
  screen.getByRole('button', { name: 'Get tournaments' });

describe('submitting a slug', () => {
  it('fetches the tournament and closes the dialog', async () => {
    const user = setupUser();
    const { getTournament, close } = renderForm();

    await user.type(slugField(), 'nyc-melee-100');
    await user.click(getButton());

    expect(getTournament).toHaveBeenCalledWith('nyc-melee-100');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('also submits on Enter', async () => {
    const user = setupUser();
    const { getTournament } = renderForm();

    await user.type(slugField(), 'nyc-melee-100{Enter}');

    expect(getTournament).toHaveBeenCalledWith('nyc-melee-100');
  });

  it('does nothing at all when the field is empty', async () => {
    const user = setupUser();
    const { getTournament, close } = renderForm();

    await user.click(getButton());

    expect(getTournament).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('closes only after the fetch resolves', async () => {
    // Closing first would tear the dialog down mid-request and drop the error
    // if it failed.
    const user = setupUser();
    let resolveFetch: () => void = () => {};
    const getTournament = jest.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveFetch = () => resolve(undefined);
        }),
    );
    const { close } = renderForm({ getTournament });

    await user.type(slugField(), 'slow{Enter}');
    expect(close).not.toHaveBeenCalled();

    resolveFetch();
    await Promise.resolve();
    expect(getTournament).toHaveBeenCalled();
  });

  it('disables the button and shows a spinner while fetching', () => {
    renderForm({ gettingTournament: true });

    expect(getButton()).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('leaves the button usable when idle', () => {
    renderForm();

    expect(getButton()).toBeEnabled();
  });
});

describe('the admined tournament list', () => {
  it('shows a loading row while the first fetch is in flight', () => {
    renderForm({ gettingAdminedTournaments: true, adminedTournaments: [] });

    expect(
      screen.getByText('Getting admined tournaments...'),
    ).toBeInTheDocument();
  });

  it('keeps showing the list while refreshing an existing one', () => {
    // The compound condition needs both arms: a refresh with results already on
    // screen should not blank them out.
    renderForm({
      gettingAdminedTournaments: true,
      adminedTournaments: ADMINED,
    });

    expect(
      screen.queryByText('Getting admined tournaments...'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Garden Brawl 2026/)).toBeInTheDocument();
  });

  it('shows neither list nor spinner when idle with nothing to show', () => {
    renderForm({ gettingAdminedTournaments: false, adminedTournaments: [] });

    expect(
      screen.queryByText('Getting admined tournaments...'),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Brawl/ })).toHaveLength(0);
  });

  it('lists each tournament with its slug alongside the name', () => {
    renderForm({ adminedTournaments: ADMINED });

    expect(screen.getByText('(garden-brawl-2026)')).toBeInTheDocument();
    expect(screen.getByText(/Garden Brawl 2026/)).toBeInTheDocument();
  });

  it('renders two tournaments that share a name but not a slug', () => {
    // The captured admined list really does contain two "Stock Exchange #55"
    // entries; keying on the slug is what keeps them distinct.
    renderForm({
      adminedTournaments: [
        { slug: 'stock-exchange-55', name: 'Stock Exchange #55' },
        { slug: 'stock-exchange-55-1', name: 'Stock Exchange #55' },
      ],
    });

    expect(screen.getAllByText(/Stock Exchange #55/)).toHaveLength(2);
  });

  it('loads a tournament when its row is clicked, then closes', async () => {
    const user = setupUser();
    const { getTournament, close } = renderForm({
      adminedTournaments: ADMINED,
    });

    await user.click(screen.getByText(/Garden Brawl 2026/));

    expect(getTournament).toHaveBeenCalledWith('garden-brawl-2026');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('the refresh button', () => {
  it('asks main for the list and clears the spinner afterwards', async () => {
    const user = setupUser();
    const { setGettingAdminedTournaments } = renderForm();

    await user.click(refreshButton());

    expect(electron.api.getAdminedTournaments).toHaveBeenCalledTimes(1);
    expect(setGettingAdminedTournaments).toHaveBeenNthCalledWith(1, true);
    expect(setGettingAdminedTournaments).toHaveBeenNthCalledWith(2, false);
  });

  it('is replaced by a spinner while a fetch is running', () => {
    renderForm({ gettingAdminedTournaments: true });

    expect(
      screen.queryByRole('button', { name: 'Get tournaments' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
  });

  it('reports a failed fetch and clears the spinner', async () => {
    // The spinner replaces this very button, so a rejection that never reaches
    // setGettingAdminedTournaments(false) leaves no way to try again - and with
    // no dialog either, nothing on screen says why the list is empty.
    const user = setupUser();
    electron.api.getAdminedTournaments.mockRejectedValue(new Error('offline'));
    const { setGettingAdminedTournaments, showErrorDialog } = renderForm();

    await user.click(refreshButton());

    expect(showErrorDialog).toHaveBeenCalledWith(['offline']);
    expect(setGettingAdminedTournaments).toHaveBeenLastCalledWith(false);
  });

  it('shows a non-Error rejection as-is', async () => {
    const user = setupUser();
    electron.api.getAdminedTournaments.mockRejectedValue('refresh string');
    const { showErrorDialog } = renderForm();

    await user.click(refreshButton());

    expect(showErrorDialog).toHaveBeenCalledWith(['refresh string']);
  });
});
