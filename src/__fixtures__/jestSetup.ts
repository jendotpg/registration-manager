/**
 * Runs before the test framework is installed, for every suite.
 *
 * This replaces ERB's `.erb/scripts/check-build-exists.ts`, which asserted that
 * `npm run build` had already produced release/app/dist before letting any test
 * run. Nothing in this suite touches the webpack bundles - the tests import from
 * src/ directly - so that check only made `npm test` fail confusingly on a clean
 * checkout and in CI.
 *
 * The polyfill below is the one thing that script did which we still need: jsdom
 * ships no TextEncoder/TextDecoder, and @remix-run/router (via react-router-dom
 * in App.tsx) reaches for them at import time.
 */
import { TextDecoder, TextEncoder } from 'util';

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}
if (!global.TextDecoder) {
  // @ts-ignore - node's TextDecoder is structurally compatible with the DOM one
  global.TextDecoder = TextDecoder;
}
