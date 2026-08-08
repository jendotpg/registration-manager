/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material';
import CopyDialog from '../renderer/CopyDialog';

const PARTICIPANTS_TEXT = 'TSM|Alice, Bob, Carol, Dave, Erin';

/**
 * The ripple settles on its own timer after a click resolves, which React
 * reports as an un-acted update. Nothing here tests the ripple, so turn it off.
 */
const NO_RIPPLE = createTheme({
  components: { MuiButtonBase: { defaultProps: { disableRipple: true } } },
});

const copyToClipboard = jest.fn<Promise<string>, []>();

beforeEach(() => {
  jest.clearAllMocks();
  copyToClipboard.mockResolvedValue(PARTICIPANTS_TEXT);
  // Only the bits CopyDialog reaches for; the real bridge is Electron's.
  (window as any).electron = { copyToClipboard };
});

function themed({
  open = true,
  text = PARTICIPANTS_TEXT,
  onClose = jest.fn(),
}: {
  open?: boolean;
  text?: string;
  onClose?: () => void;
}) {
  return (
    <ThemeProvider theme={NO_RIPPLE}>
      <CopyDialog open={open} text={text} onClose={onClose} />
    </ThemeProvider>
  );
}

const renderDialog = (props: Parameters<typeof themed>[0] = {}) =>
  render(themed(props));

const copyButton = () => screen.getByRole('button', { name: /^Cop/ });
const click = (element: HTMLElement) => userEvent.click(element);

describe('CopyDialog', () => {
  it('shows the text in a field the user cannot edit', () => {
    renderDialog();

    const field = screen.getByDisplayValue(PARTICIPANTS_TEXT);
    expect(field).toHaveAttribute('readonly');
  });

  it('copies through the electron bridge when the button is clicked', async () => {
    renderDialog();

    await click(copyButton());

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
  });

  it('goes green and says Copied! after a copy', async () => {
    renderDialog();

    expect(copyButton()).toHaveClass('MuiButton-containedPrimary');

    await click(copyButton());

    expect(copyButton()).toHaveTextContent('Copied!');
    expect(copyButton()).toHaveClass('MuiButton-containedSuccess');
  });

  it('is back to blue when the dialog is reopened', async () => {
    const { rerender } = renderDialog();
    await click(copyButton());

    rerender(themed({ open: false }));
    rerender(themed({ open: true }));

    expect(copyButton()).toHaveTextContent('Copy');
    expect(copyButton()).toHaveClass('MuiButton-containedPrimary');
  });

  it('closes on Close', async () => {
    const onClose = jest.fn();
    renderDialog({ onClose });

    await click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
