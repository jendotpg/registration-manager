/**
 * @jest-environment jsdom
 */
import { act, screen } from '@testing-library/react';
import CopyDialog from '../renderer/CopyDialog';
import { installElectronMock } from '../__fixtures__/electronApi';
import { renderWithTheme, setupUser } from '../__fixtures__/renderWithTheme';

const PARTICIPANTS_TEXT = 'TSM|Alice, Bob, Carol, Dave, Erin';

let electron: ReturnType<typeof installElectronMock>;

beforeEach(() => {
  electron = installElectronMock();
  electron.api.copyToClipboard.mockResolvedValue(PARTICIPANTS_TEXT);
});

afterEach(() => {
  electron.restore();
  jest.clearAllMocks();
});

function dialog({
  open = true,
  text = PARTICIPANTS_TEXT,
  onClose = jest.fn(),
}: {
  open?: boolean;
  text?: string;
  onClose?: () => void;
}) {
  return <CopyDialog open={open} text={text} onClose={onClose} />;
}

const renderDialog = (props: Parameters<typeof dialog>[0] = {}) =>
  renderWithTheme(dialog(props));

const copyButton = () => screen.getByRole('button', { name: /^Cop/ });

describe('CopyDialog', () => {
  it('shows the text in a field the user cannot edit', () => {
    renderDialog();

    const field = screen.getByDisplayValue(PARTICIPANTS_TEXT);
    expect(field).toHaveAttribute('readonly');
  });

  it('copies through the electron bridge when the button is clicked', async () => {
    const user = setupUser();
    renderDialog();

    await user.click(copyButton());

    expect(electron.api.copyToClipboard).toHaveBeenCalledTimes(1);
  });

  it('goes green and says Copied! after a copy', async () => {
    const user = setupUser();
    renderDialog();

    expect(copyButton()).toHaveClass('MuiButton-containedPrimary');

    await user.click(copyButton());

    expect(copyButton()).toHaveTextContent('Copied!');
    expect(copyButton()).toHaveClass('MuiButton-containedSuccess');
  });

  it('is back to blue when the dialog is reopened', async () => {
    const user = setupUser();
    const { rerenderWithTheme } = renderDialog();
    await user.click(copyButton());

    rerenderWithTheme(dialog({ open: false }));
    rerenderWithTheme(dialog({ open: true }));

    expect(copyButton()).toHaveTextContent('Copy');
    expect(copyButton()).toHaveClass('MuiButton-containedPrimary');
  });

  it('closes on Close', async () => {
    const user = setupUser();
    const onClose = jest.fn();
    renderDialog({ onClose });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still offers a copy when there is nothing to copy', async () => {
    const user = setupUser();
    electron.api.copyToClipboard.mockResolvedValue('');
    renderDialog({ text: '' });

    await user.click(copyButton());

    expect(electron.api.copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyButton()).toHaveTextContent('Copied!');
  });

  it('selects the whole text on focus, so a manual copy grabs everything', async () => {
    renderDialog();

    const field = screen.getByDisplayValue(
      PARTICIPANTS_TEXT,
    ) as HTMLInputElement;
    const select = jest.spyOn(field, 'select');

    // MUI's InputBase tracks focus in state, so this is a React update.
    await act(async () => {
      field.focus();
    });

    expect(select).toHaveBeenCalled();
  });
});
