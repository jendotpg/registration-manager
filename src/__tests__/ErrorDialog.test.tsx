/**
 * The dialog every failed IPC call funnels into.
 *
 * @jest-environment jsdom
 */
import { screen } from '@testing-library/react';
import ErrorDialog from '../renderer/ErrorDialog';
import { renderWithTheme, setupUser } from '../__fixtures__/renderWithTheme';

const renderDialog = (
  props: Partial<Parameters<typeof ErrorDialog>[0]> = {},
) => {
  const onClose = jest.fn();
  renderWithTheme(
    <ErrorDialog
      open
      messages={['Something broke']}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose };
};

describe('ErrorDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a single message', () => {
    renderDialog({ messages: ['401 - Unauthorized.'] });

    expect(screen.getByText('401 - Unauthorized.')).toBeInTheDocument();
  });

  it('shows several messages in the order they were given', () => {
    renderDialog({ messages: ['First problem', 'Second problem'] });

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('First problem');
    expect(dialog.textContent!.indexOf('First problem')).toBeLessThan(
      dialog.textContent!.indexOf('Second problem'),
    );
  });

  it('still opens with no messages at all', () => {
    // showErrorDialog is called with whatever a catch produced, which can be an
    // empty list. An empty dialog is odd but must not crash.
    renderDialog({ messages: [] });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('closes on the Close button', async () => {
    const user = setupUser();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const user = setupUser();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
