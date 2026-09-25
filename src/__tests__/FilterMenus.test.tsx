/**
 * The two filter dropdowns above the table.
 *
 * Both are controlled by props, so they render directly with open: true rather
 * than going through StartggCheckin's buttons.
 *
 * @jest-environment jsdom
 */
import { screen, waitFor, within } from '@testing-library/react';
import { NullableBoolean, Pool, UNSEEDED_POOL } from '../common/types';
import { AddedMenu, PaidMenu, PoolMenu } from '../renderer/FilterMenus';
import { renderWithTheme, setupUser } from '../__fixtures__/renderWithTheme';
import { POOL_A, POOL_B } from '../__fixtures__/tournament';

const { Include, Exclude, Indeterminate } = NullableBoolean;

const POOLS: Pool[] = [POOL_A, POOL_B, UNSEEDED_POOL];

const checkboxLabelled = (name: string) =>
  screen.getByRole('checkbox', { name }) as HTMLInputElement;

/** MUI marks the indeterminate state with a data attribute, not a property. */
const isIndeterminate = (checkbox: HTMLInputElement) =>
  checkbox.getAttribute('data-indeterminate') === 'true';

/**
 * Whether the pool list is showing.
 *
 * Not `toBeVisible`: MUI's Collapse keeps its children mounted and hides them
 * with a computed height, and jsdom performs no layout at all - so every
 * element in this tree reports as invisible whether the list is open or not
 * (MUI's checkbox inputs are opacity-0 by design too). The `entered` class is
 * the actual state Collapse toggles, so that is what gets asserted.
 */
const poolListExpanded = () =>
  screen
    .getByText('Pools 1')
    .closest('.MuiCollapse-root')!
    .classList.contains('MuiCollapse-entered');

describe('PaidMenu', () => {
  const renderMenu = (props: Partial<Parameters<typeof PaidMenu>[0]> = {}) => {
    const onPaidChange = jest.fn();
    const onClose = jest.fn();
    renderWithTheme(
      <PaidMenu
        anchorEl={document.body}
        open
        onClose={onClose}
        paidState={Indeterminate}
        onPaidChange={onPaidChange}
        {...props}
      />,
    );
    return { onPaidChange, onClose };
  };

  it('renders nothing while closed', () => {
    renderMenu({ open: false });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows an indeterminate box while the filter is inert', () => {
    renderMenu({ paidState: Indeterminate });

    const paid = checkboxLabelled('Paid');
    expect(paid.checked).toBe(false);
    expect(isIndeterminate(paid)).toBe(true);
  });

  it('shows a ticked box while including', () => {
    renderMenu({ paidState: Include });

    const paid = checkboxLabelled('Paid');
    expect(paid.checked).toBe(true);
    expect(isIndeterminate(paid)).toBe(false);
  });

  it('shows an empty box while excluding', () => {
    // Exclude and Indeterminate must look different, or "unpaid only" and "no
    // filter" would be indistinguishable at a glance.
    renderMenu({ paidState: Exclude });

    const paid = checkboxLabelled('Paid');
    expect(paid.checked).toBe(false);
    expect(isIndeterminate(paid)).toBe(false);
  });

  it.each([
    ['Indeterminate', Indeterminate, Include],
    ['Include', Include, Exclude],
    ['Exclude', Exclude, Indeterminate],
  ])('clicking from %s reports the next state', async (_label, from, to) => {
    const user = setupUser();
    const { onPaidChange } = renderMenu({ paidState: from });

    await user.click(checkboxLabelled('Paid'));

    expect(onPaidChange).toHaveBeenCalledWith(to);
  });

  it('closes on Escape', async () => {
    const user = setupUser();
    const { onClose } = renderMenu();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddedMenu', () => {
  const renderMenu = (props: Partial<Parameters<typeof AddedMenu>[0]> = {}) => {
    const onAddedChange = jest.fn();
    const onClose = jest.fn();
    const result = renderWithTheme(
      <AddedMenu
        anchorEl={document.body}
        open
        onClose={onClose}
        addedState={Indeterminate}
        onAddedChange={onAddedChange}
        {...props}
      />,
    );
    return { onAddedChange, onClose, ...result };
  };

  it('lists only the Added toggle', () => {
    renderMenu();

    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('checkbox')).toHaveLength(1);
    expect(checkboxLabelled('Added')).toBeInTheDocument();
  });

  it('cycles the Added filter like the Paid one', async () => {
    const user = setupUser();
    const { onAddedChange } = renderMenu({ addedState: Include });

    await user.click(checkboxLabelled('Added'));

    expect(onAddedChange).toHaveBeenCalledWith(Exclude);
  });
});

describe('PoolMenu', () => {
  const renderMenu = (props: Partial<Parameters<typeof PoolMenu>[0]> = {}) => {
    const onPoolsChange = jest.fn();
    const onClose = jest.fn();
    const result = renderWithTheme(
      <PoolMenu
        anchorEl={document.body}
        open
        onClose={onClose}
        poolOptions={POOLS}
        pools={{
          [POOL_A.id]: true,
          [POOL_B.id]: true,
          [UNSEEDED_POOL.id]: true,
        }}
        onPoolsChange={onPoolsChange}
        {...props}
      />,
    );
    return { onPoolsChange, onClose, ...result };
  };

  it('lists the Pools master and one row per pool', () => {
    renderMenu();

    expect(checkboxLabelled('Pools')).toBeInTheDocument();
    expect(checkboxLabelled('Pools 1')).toBeInTheDocument();
    expect(checkboxLabelled('Pools 2')).toBeInTheDocument();
  });

  it('labels the Unseeded bucket without a trailing space', () => {
    renderMenu();

    expect(checkboxLabelled('Unseeded')).toBeInTheDocument();
  });

  describe('the Pools master checkbox', () => {
    it('is ticked when every pool is ticked', () => {
      renderMenu();

      const master = checkboxLabelled('Pools');
      expect(master.checked).toBe(true);
      expect(isIndeterminate(master)).toBe(false);
    });

    it('is indeterminate when only some are ticked', () => {
      renderMenu({ pools: { [POOL_A.id]: true } });

      const master = checkboxLabelled('Pools');
      expect(master.checked).toBe(false);
      expect(isIndeterminate(master)).toBe(true);
    });

    it('is empty when none are ticked', () => {
      renderMenu({ pools: {} });

      const master = checkboxLabelled('Pools');
      expect(master.checked).toBe(false);
      expect(isIndeterminate(master)).toBe(false);
    });

    it('is not ticked when there are no pools to tick', () => {
      // Without the length guard, "zero of zero checked" would read as "all
      // checked" and an event with no pools yet would claim a full selection.
      renderMenu({ poolOptions: [], pools: {} });

      const master = checkboxLabelled('Pools');
      expect(master.checked).toBe(false);
      expect(isIndeterminate(master)).toBe(false);
    });

    it('unticks everything when all were ticked', async () => {
      const user = setupUser();
      const { onPoolsChange } = renderMenu();

      await user.click(checkboxLabelled('Pools'));

      expect(onPoolsChange).toHaveBeenCalledWith({
        [POOL_A.id]: false,
        [POOL_B.id]: false,
        [UNSEEDED_POOL.id]: false,
      });
    });

    it('ticks everything when none were ticked', async () => {
      const user = setupUser();
      const { onPoolsChange } = renderMenu({ pools: {} });

      await user.click(checkboxLabelled('Pools'));

      expect(onPoolsChange).toHaveBeenCalledWith({
        [POOL_A.id]: true,
        [POOL_B.id]: true,
        [UNSEEDED_POOL.id]: true,
      });
    });

    it('ticks everything when only some were ticked', async () => {
      // From a partial selection the useful move is "select all", not "clear".
      const user = setupUser();
      const { onPoolsChange } = renderMenu({ pools: { [POOL_A.id]: true } });

      await user.click(checkboxLabelled('Pools'));

      expect(onPoolsChange).toHaveBeenCalledWith({
        [POOL_A.id]: true,
        [POOL_B.id]: true,
        [UNSEEDED_POOL.id]: true,
      });
    });

    it('drops stale pool ids rather than carrying them forward', async () => {
      // The emitted record is rebuilt from poolOptions, so a pool from the
      // previous tournament does not survive a select-all.
      const user = setupUser();
      const { onPoolsChange } = renderMenu({
        pools: { 999999: true },
      });

      await user.click(checkboxLabelled('Pools'));

      expect(onPoolsChange.mock.calls[0][0]).not.toHaveProperty('999999');
    });
  });

  describe('an individual pool', () => {
    it('unticks just that one, leaving the rest alone', async () => {
      const user = setupUser();
      const { onPoolsChange } = renderMenu();

      await user.click(checkboxLabelled('Pools 1'));

      expect(onPoolsChange).toHaveBeenCalledWith({
        [POOL_A.id]: false,
        [POOL_B.id]: true,
        [UNSEEDED_POOL.id]: true,
      });
    });

    it('renders unticked and ticks on when it is missing from the record', async () => {
      const user = setupUser();
      const { onPoolsChange } = renderMenu({ pools: { [POOL_B.id]: true } });

      expect(checkboxLabelled('Pools 1').checked).toBe(false);

      await user.click(checkboxLabelled('Pools 1'));

      expect(onPoolsChange).toHaveBeenCalledWith({
        [POOL_A.id]: true,
        [POOL_B.id]: true,
      });
    });
  });

  describe('the expand toggle', () => {
    it('starts expanded, so the pools are showing without a click', () => {
      renderMenu();

      expect(poolListExpanded()).toBe(true);
    });

    it('hides the pool list when collapsed', async () => {
      const user = setupUser();
      renderMenu();

      await user.click(screen.getByRole('button'));

      expect(poolListExpanded()).toBe(false);
      // Still mounted, just hidden - Collapse never unmounts its children.
      expect(checkboxLabelled('Pools 1')).toBeInTheDocument();
    });

    it('does not also toggle every pool', async () => {
      // The icon sits inside the same MenuItem as the master checkbox, so
      // without stopPropagation collapsing the list would clear the selection.
      const user = setupUser();
      const { onPoolsChange } = renderMenu();

      await user.click(screen.getByRole('button'));

      expect(onPoolsChange).not.toHaveBeenCalled();
    });

    it('expands again on a second click', async () => {
      const user = setupUser();
      renderMenu();

      await user.click(screen.getByRole('button'));
      expect(poolListExpanded()).toBe(false);

      await user.click(screen.getByRole('button'));
      // Re-opening animates, so `entered` only lands once the 300ms transition
      // finishes; collapsing drops the class immediately and needs no wait.
      await waitFor(() => expect(poolListExpanded()).toBe(true));
    });
  });

  it('renders a pool-less event without crashing', () => {
    renderMenu({ poolOptions: [], pools: {} });

    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('checkbox')).toHaveLength(1);
  });
});
