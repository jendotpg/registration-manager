/**
 * Horizontal alignment between the header and the rows.
 *
 * Every column has a filter button (two, for events) sitting above a checkbox
 * (two, for events). If those drift apart, the table still renders and every
 * other test still passes - it just becomes hard to read at a glance which
 * checkbox belongs to which column, which is precisely the thing somebody at a
 * registration desk is doing under time pressure. It is also easy to break:
 * changing an icon button's `size`, a checkbox's `size`, the gap between the
 * pair, or the width formula on one side only will do it.
 *
 * HOW THIS WORKS, because it is not obvious:
 *
 * jsdom performs no layout at all - getBoundingClientRect is always zeros - so
 * these tests cannot measure two rendered centres and compare them. What jsdom
 * *does* give us is the real emitted CSS, because emotion injects its
 * stylesheets and MUI's own rules resolve too. So each control's centre is
 * reconstructed from its box model: the container's width and flex alignment,
 * each control's width (explicit, or icon size plus padding), and the margins
 * MUI's Stack uses for spacing. Header and body both go through the same
 * reconstruction, so the comparison is apples to apples.
 *
 * That catches every way the two sides can be made to disagree with each other:
 * a size change on one side, a gap change on one side, a different width
 * formula, a different justification, a different number of controls. It does
 * not catch anything that needs a real layout engine - wrapping, overflow,
 * transforms, subpixel rounding. For those, a real browser is the only answer.
 *
 * @jest-environment jsdom
 */
import { screen } from '@testing-library/react';
import StartggCheckin from '../renderer/StartggCheckin';
import { installElectronMock } from '../__fixtures__/electronApi';
import { stubLayoutMetrics } from '../__fixtures__/layoutMetrics';
import { renderWithTheme } from '../__fixtures__/renderWithTheme';
import { nycMeleeTournament } from '../__fixtures__/tournament';

/** jsdom reports no root font size; every browser defaults to 16px. */
const ROOT_FONT_SIZE_PX = 16;

/** SMALL_CONTROL_PX in StartggCheckin.tsx. */
const SMALL_CONTROL_PX = 38;
/** CONTROL_GAP_PX in StartggCheckin.tsx. */
const CONTROL_GAP_PX = 4;

const OPTION_NAMES = ['Venue Fee', 'Melee Singles', 'Redemption Bracket'];

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

function renderCheckin() {
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
    />,
  );
}

/* ------------------------------------------------------------------ *
 * Reading the box model out of the emitted CSS
 * ------------------------------------------------------------------ */

function pxValue(value: string): number {
  if (!value) {
    return 0;
  }
  if (value.endsWith('rem')) {
    return parseFloat(value) * ROOT_FONT_SIZE_PX;
  }
  if (value.endsWith('px')) {
    return parseFloat(value);
  }
  return 0;
}

function horizontalPaddingPx(style: CSSStyleDeclaration): number {
  // jsdom does not always expand the padding shorthand into longhands.
  const left = style.paddingLeft || style.padding;
  const right = style.paddingRight || style.padding;
  return pxValue(left) + pxValue(right);
}

/**
 * How wide a control renders.
 *
 * The filter buttons in an event column carry an explicit width; everything
 * else shrinks to fit its icon, which MUI sizes as `width: 1em` against the
 * control's own font-size, plus the control's padding.
 */
function controlWidthPx(control: HTMLElement): number {
  const style = getComputedStyle(control);
  if (style.width.endsWith('px')) {
    return parseFloat(style.width);
  }
  const icon = control.querySelector('svg');
  const iconPx = icon ? pxValue(getComputedStyle(icon).fontSize) : 0;
  return iconPx + horizontalPaddingPx(style);
}

const controlIn = (wrapper: HTMLElement): HTMLElement =>
  wrapper.querySelector<HTMLElement>('button, .MuiCheckbox-root') ?? wrapper;

/**
 * The horizontal centre of each control in a container, in pixels from the
 * container's left edge.
 *
 * Reads the container's own flex alignment rather than assuming it is centred,
 * so that flipping either side to flex-start shows up as a real difference.
 */
function controlCentresPx(
  container: HTMLElement,
  containerWidthPx: number,
): number[] {
  const style = getComputedStyle(container);
  const items = (Array.from(container.children) as HTMLElement[]).map(
    (wrapper) => ({
      marginLeftPx: pxValue(getComputedStyle(wrapper).marginLeft),
      widthPx: controlWidthPx(controlIn(wrapper)),
    }),
  );

  if (style.flexDirection === 'column') {
    // Each control gets its own line, so alignItems places it horizontally.
    return items.map(({ widthPx }) => {
      if (style.alignItems === 'center') {
        return containerWidthPx / 2;
      }
      if (style.alignItems === 'flex-end') {
        return containerWidthPx - widthPx / 2;
      }
      return widthPx / 2;
    });
  }

  const totalPx = items.reduce(
    (total, item) => total + item.marginLeftPx + item.widthPx,
    0,
  );
  let cursor = 0;
  if (style.justifyContent === 'center') {
    cursor = (containerWidthPx - totalPx) / 2;
  } else if (style.justifyContent === 'flex-end') {
    cursor = containerWidthPx - totalPx;
  }

  return items.map(({ marginLeftPx, widthPx }) => {
    const centre = cursor + marginLeftPx + widthPx / 2;
    cursor += marginLeftPx + widthPx;
    return centre;
  });
}

/* ------------------------------------------------------------------ *
 * Locating the two halves of a column
 * ------------------------------------------------------------------ */

/** The header cell for one registration option. */
function headerColumn(optionName: string) {
  // Two matches: the off-screen copy the component measures, and the real
  // heading. The real one is last.
  const label = screen.getAllByText(optionName).slice(-1)[0] as HTMLElement;
  const column = label.parentElement as HTMLElement;
  return {
    label,
    column,
    controls: column.children[1] as HTMLElement,
    widthPx: pxValue(getComputedStyle(column).width),
  };
}

/** One participant's cells, in registration option order. */
function bodyCells(participantName: string) {
  const nameCell = screen.getByText(participantName).parentElement!;
  const row = nameCell.parentElement!;
  return Array.from(
    row.children[1].querySelectorAll<HTMLElement>('[data-option-cell]'),
  );
}

function bodyCell(participantName: string, optionIndex: number) {
  const cell = bodyCells(participantName)[optionIndex];
  return { cell, widthPx: pxValue(getComputedStyle(cell).width) };
}

/** Round to a tenth of a pixel; the maths is exact but floats are floats. */
const round = (value: number) => Math.round(value * 10) / 10;

describe('the column widths the two halves share', () => {
  it.each(OPTION_NAMES)(
    'gives the %s header and its checkboxes the same width',
    (optionName) => {
      // Alignment starts here: both sides call columnWidthPx for the same
      // option, so if these ever disagree nothing below can line up.
      renderCheckin();
      const optionIndex = OPTION_NAMES.indexOf(optionName);

      const header = headerColumn(optionName);
      const body = bodyCell('Bob', optionIndex);

      expect(header.widthPx).toBeGreaterThan(0);
      expect(body.widthPx).toBe(header.widthPx);
    },
  );

  it.each(OPTION_NAMES)(
    'still matches for %s once the labels have been measured',
    (optionName) => {
      // The minimum-width fallback is easy to keep in sync by accident. This
      // runs the same check on a column sized from a measured label instead.
      restoreMetrics = stubLayoutMetrics({ boundingWidth: 260 });
      renderCheckin();
      const optionIndex = OPTION_NAMES.indexOf(optionName);

      const header = headerColumn(optionName);
      const body = bodyCell('Bob', optionIndex);

      expect(body.widthPx).toBe(header.widthPx);
    },
  );
});

describe('each checkbox sits under its filter button', () => {
  it.each(OPTION_NAMES)(
    'lines up every control in the %s column',
    (optionName) => {
      renderCheckin();
      const optionIndex = OPTION_NAMES.indexOf(optionName);
      const header = headerColumn(optionName);
      const body = bodyCell('Bob', optionIndex);

      const headerCentres = controlCentresPx(header.controls, header.widthPx);
      const bodyCentres = controlCentresPx(body.cell, body.widthPx);

      expect(bodyCentres.map(round)).toEqual(headerCentres.map(round));
    },
  );

  it.each(OPTION_NAMES)(
    'has as many checkboxes as filter buttons in the %s column',
    (optionName) => {
      // A count mismatch would make the centre comparison above vacuous for the
      // missing control, so it gets asserted in its own right.
      renderCheckin();
      const optionIndex = OPTION_NAMES.indexOf(optionName);

      const header = headerColumn(optionName);
      const body = bodyCell('Bob', optionIndex);

      expect(body.cell.children.length).toBe(header.controls.children.length);
    },
  );

  it('lines up the paid and added controls separately, not just as a group', () => {
    // The failure worth catching: two controls whose group is still centred but
    // which have drifted apart, so the left one is over the gap and the right
    // one over nothing.
    renderCheckin();
    const header = headerColumn('Melee Singles');
    const body = bodyCell('Bob', 1);

    const headerCentres = controlCentresPx(header.controls, header.widthPx);
    const bodyCentres = controlCentresPx(body.cell, body.widthPx);

    expect(headerCentres).toHaveLength(2);
    expect(round(bodyCentres[0])).toBe(round(headerCentres[0]));
    expect(round(bodyCentres[1])).toBe(round(headerCentres[1]));
    // And they are genuinely two distinct positions, so the assertion above is
    // not passing because everything collapsed to the same number.
    expect(bodyCentres[0]).not.toBe(bodyCentres[1]);
  });

  it.each(['TSM | Alice', 'Carol', 'Erin'])(
    'lines up the same way for %s as for everyone else',
    (participantName) => {
      // Rows are independent renders of the same cell markup; a participant
      // whose checkboxes are disabled or checked must not shift.
      renderCheckin();
      const header = headerColumn('Melee Singles');
      const reference = controlCentresPx(header.controls, header.widthPx);
      const body = bodyCell(participantName, 1);

      expect(controlCentresPx(body.cell, body.widthPx).map(round)).toEqual(
        reference.map(round),
      );
    },
  );

  it('still lines up when a measured label widens the column', () => {
    restoreMetrics = stubLayoutMetrics({ boundingWidth: 260 });
    renderCheckin();
    const header = headerColumn('Melee Singles');
    const body = bodyCell('Bob', 1);

    const headerCentres = controlCentresPx(header.controls, header.widthPx);
    const bodyCentres = controlCentresPx(body.cell, body.widthPx);

    // Sanity: the column really did grow past its minimum, so this is a
    // different arithmetic case from the default.
    expect(header.widthPx).toBeGreaterThan(
      SMALL_CONTROL_PX * 2 + CONTROL_GAP_PX,
    );
    expect(bodyCentres.map(round)).toEqual(headerCentres.map(round));
  });
});

describe('the filter buttons sit under the option label', () => {
  it.each(OPTION_NAMES)(
    'centres the %s label over its controls',
    (optionName) => {
      renderCheckin();
      const header = headerColumn(optionName);

      // MUI v7 routes Typography's align prop through a custom property.
      expect(
        getComputedStyle(header.label)
          .getPropertyValue('--Typography-textAlign')
          .trim(),
      ).toBe('center');

      // A centred label's centre is the middle of the column it fills, so that is
      // what the control group has to match.
      const centres = controlCentresPx(header.controls, header.widthPx);
      const groupCentre = (Math.min(...centres) + Math.max(...centres)) / 2;
      expect(round(groupCentre)).toBe(round(header.widthPx / 2));
    },
  );

  it('puts the single venue fee button dead centre under its label', () => {
    // With one control the group centre and the control centre are the same
    // thing, so this is the strictest version of the check.
    renderCheckin();
    const header = headerColumn('Venue Fee');

    const [centre] = controlCentresPx(header.controls, header.widthPx);

    expect(round(centre)).toBe(round(header.widthPx / 2));
  });

  it('keeps the label centred over the controls on a widened column', () => {
    restoreMetrics = stubLayoutMetrics({ boundingWidth: 260 });
    renderCheckin();
    const header = headerColumn('Melee Singles');

    const centres = controlCentresPx(header.controls, header.widthPx);
    const groupCentre = (Math.min(...centres) + Math.max(...centres)) / 2;

    expect(round(groupCentre)).toBe(round(header.widthPx / 2));
  });
});

describe('the control sizes the alignment depends on', () => {
  it('makes a small checkbox exactly as wide as a forced filter button', () => {
    // SMALL_CONTROL_PX is documented in the source as "small Checkbox natural
    // size == forced IconButton size". That is an assumption about MUI's own
    // metrics, not something the code enforces, so it gets its own test - and
    // it doubles as a check that the width reconstruction above is right.
    renderCheckin();
    const header = headerColumn('Melee Singles');
    const body = bodyCell('Bob', 1);

    const buttonWidth = controlWidthPx(
      controlIn(header.controls.children[0] as HTMLElement),
    );
    const checkboxWidth = controlWidthPx(
      controlIn(body.cell.children[0] as HTMLElement),
    );

    expect(buttonWidth).toBe(SMALL_CONTROL_PX);
    expect(checkboxWidth).toBe(SMALL_CONTROL_PX);
  });

  it('separates the two controls by the same gap in both halves', () => {
    renderCheckin();
    const header = headerColumn('Melee Singles');
    const body = bodyCell('Bob', 1);

    const headerGap = pxValue(
      getComputedStyle(header.controls.children[1] as HTMLElement).marginLeft,
    );
    const bodyGap = pxValue(
      getComputedStyle(body.cell.children[1] as HTMLElement).marginLeft,
    );

    expect(headerGap).toBe(CONTROL_GAP_PX);
    expect(bodyGap).toBe(CONTROL_GAP_PX);
  });

  it('centres both halves rather than packing them to one side', () => {
    renderCheckin();
    const header = headerColumn('Melee Singles');
    const body = bodyCell('Bob', 1);

    expect(getComputedStyle(header.controls).justifyContent).toBe('center');
    expect(getComputedStyle(body.cell).justifyContent).toBe('center');
  });

  it('centres the venue fee column, which stacks rather than rows', () => {
    // The tournament column is a column-direction Stack, so its horizontal
    // centring comes from alignItems instead of justifyContent.
    renderCheckin();
    const body = bodyCell('Bob', 0);

    expect(getComputedStyle(body.cell).flexDirection).toBe('column');
    expect(getComputedStyle(body.cell).alignItems).toBe('center');
  });
});

describe('the pool column alignment', () => {
  it('gives each Pool header and its body cell the same width', () => {
    renderCheckin();
    const poolHeaders = screen
      .getAllByText('Pool')
      .filter((el) => el.closest('[data-pool-header]'));
    expect(poolHeaders.length).toBeGreaterThan(0);

    const nameCell = screen.getByText('Bob').parentElement!;
    const row = nameCell.parentElement!;
    const poolCells = Array.from(
      row.children[1].querySelectorAll<HTMLElement>('[data-pool-cell]'),
    );
    expect(poolCells.length).toBe(poolHeaders.length);

    poolHeaders.forEach((headerEl, idx) => {
      const headerStack = headerEl.parentElement as HTMLElement;
      const bodyStack = poolCells[idx];
      expect(pxValue(getComputedStyle(bodyStack).width)).toBe(
        pxValue(getComputedStyle(headerStack).width),
      );
    });
  });

  it('centres the Pool header label and the body pool identifier', () => {
    renderCheckin();
    const poolHeaders = screen
      .getAllByText('Pool')
      .filter((el) => el.closest('[data-pool-header]'));

    poolHeaders.forEach((headerEl) => {
      expect(
        getComputedStyle(headerEl)
          .getPropertyValue('--Typography-textAlign')
          .trim(),
      ).toBe('center');
    });

    const nameCell = screen.getByText('Bob').parentElement!;
    const row = nameCell.parentElement!;
    const poolCells = Array.from(
      row.children[1].querySelectorAll<HTMLElement>('[data-pool-cell]'),
    );

    poolCells.forEach((cell) => {
      const text = cell.querySelector('p, span') as HTMLElement;
      expect(
        getComputedStyle(text)
          .getPropertyValue('--Typography-textAlign')
          .trim(),
      ).toBe('center');
    });
  });
});
