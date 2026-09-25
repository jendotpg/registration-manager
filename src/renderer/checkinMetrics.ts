import { RegistrationOption, Id, hasPoolsConfigured } from '../common/types';

export const COLUMN_GAP_PX = 8; // between option columns, and name column <-> options
export const ROW_PADDING_X_PX = 24;
export const CONTROL_GAP_PX = 4; // between the control slots inside a column
export const SMALL_CONTROL_PX = 38; // small Checkbox natural size == forced IconButton size
// Every control (Paid, Added, Pool) gets an equal-width slot, so they sit evenly
// spaced under the option name with room for their labels.
export const CONTROL_SLOT_PX = 60;
export const TOOLTIP_ENTER_DELAY_MS = 350;
export const LABEL_WIDTH_PAD_PX = 8;
export const NAME_COL_MAX_PX = 500;
export const NAME_COL_MIN_PX = 290;
export const VENUE_COL_MAX_PX = 200;
export const VENUE_COL_MIN_PX = 120;
export const NAME_COL_WIDTH = `max(${NAME_COL_MIN_PX}px, min(${NAME_COL_MAX_PX}px, 25%))`;
export const COLUMN_GAP = `${COLUMN_GAP_PX}px`;
export const CONTROL_GAP = `${CONTROL_GAP_PX}px`;
export const ROW_HEIGHT_PX = 50;

export const ACTIVE_ICON_BUTTON_SX = {
  backgroundColor: 'action.selected',
} as const;
export const SMALL_ICON_BUTTON_SX = {
  width: `${SMALL_CONTROL_PX}px`,
  height: `${SMALL_CONTROL_PX}px`,
} as const;

export function slotCount(registrationOption: RegistrationOption) {
  if (registrationOption.type !== 'event') {
    return 1;
  }
  return hasPoolsConfigured(registrationOption) ? 3 : 2;
}

export function columnWidthPx(
  registrationOption: RegistrationOption,
  measuredLabelWidth: number | undefined,
) {
  const labelWidth = Math.ceil(measuredLabelWidth ?? 0) + LABEL_WIDTH_PAD_PX;
  return registrationOption.type === 'event'
    ? Math.max(
        CONTROL_SLOT_PX * slotCount(registrationOption) +
          CONTROL_GAP_PX * (slotCount(registrationOption) - 1),
        labelWidth,
      )
    : Math.min(VENUE_COL_MAX_PX, Math.max(VENUE_COL_MIN_PX, labelWidth));
}

export function columnWidths(
  registrationOptions: RegistrationOption[],
  measuredLabelWidths: Record<Id, number>,
): Record<Id, number> {
  const widths: Record<Id, number> = {};
  registrationOptions.forEach((registrationOption) => {
    widths[registrationOption.id] = columnWidthPx(
      registrationOption,
      measuredLabelWidths[registrationOption.id],
    );
  });
  return widths;
}
