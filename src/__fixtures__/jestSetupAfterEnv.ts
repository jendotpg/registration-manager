/**
 * Runs after the test framework is installed, for every suite.
 *
 * Registers jest-dom's matchers (toBeInTheDocument, toBeDisabled, toHaveStyle,
 * ...) once, so individual suites don't each have to remember the import. It is
 * safe in the `@jest-environment node` suites too - the package only extends
 * `expect` and touches no DOM globals at import time.
 */
import '@testing-library/jest-dom';

/**
 * MUI's Tooltip keeps its "another tooltip was open a moment ago, so skip the
 * enter delay on the next one" flag in a module-level variable, guarded by a
 * module-level timer. Closing any tooltip arms that timer for 800ms, and
 * because it belongs to the module rather than to a component, unmounting does
 * not clear it - RTL's cleanup cannot reach it. A suite that so much as focuses
 * a tooltipped button therefore ends holding a live 800ms timer, which keeps
 * its jest worker's event loop open past the point jest wants it gone and
 * produces an intermittent "a worker process has failed to exit gracefully".
 *
 * `testReset` is MUI's own escape hatch for this: it clears the timer and the
 * flag. It is a real export of the implementation module, but not one the
 * package reaches - `@mui/material/Tooltip` re-exports only the component and
 * its classes, and the exports map sends every deep path to an index that does
 * not exist. Hence the moduleNameMapper entry in package.json pointing this
 * specifier at the file itself, and the cast, since the public typings leave
 * `testReset` out. Resolving to that exact path is what matters: it is the same
 * module instance the components load, so this clears the timer they armed.
 *
 * Loading it is skipped outside jsdom so the `@jest-environment node` suites do
 * not pull in MUI at all.
 */
if (typeof window !== 'undefined') {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const { testReset } = require('@mui/material/Tooltip/Tooltip') as {
    testReset: () => void;
  };

  afterEach(() => {
    testReset();
  });
}
