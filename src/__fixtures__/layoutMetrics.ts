/**
 * Geometry stubs for jsdom.
 *
 * jsdom does no layout: getBoundingClientRect() is all zeros and scrollWidth /
 * clientWidth are 0 on every element. StartggCheckin measures its column labels
 * with exactly those APIs, so without a stub its widths collapse to the minimum
 * arm of every clamp and EllipsisTooltip's `overflowed` can never become true -
 * several real branches would be permanently unreachable.
 *
 * The overrides go on HTMLElement.prototype rather than on individual nodes
 * because the measurement happens in a useLayoutEffect against elements captured
 * by ref callbacks during that same commit. There is no moment at which a test
 * holds those nodes and could stub them one by one.
 */

type Metrics = {
  /** Width reported by getBoundingClientRect(). */
  boundingWidth?: number;
  scrollWidth?: number;
  clientWidth?: number;
  /**
   * Per-element override, consulted first. Return undefined to fall back to the
   * flat values above - handy for giving one long label a big width while the
   * rest stay small.
   */
  perElement?: (element: HTMLElement) => Partial<Metrics> | undefined;
};

// eslint-disable-next-line import/prefer-default-export
export function stubLayoutMetrics(metrics: Metrics) {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const scrollDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollWidth',
  );
  const clientDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth',
  );

  const resolve = (element: HTMLElement): Metrics => ({
    ...metrics,
    ...(metrics.perElement?.(element) ?? {}),
  });

  HTMLElement.prototype.getBoundingClientRect =
    function getBoundingClientRect() {
      const width = resolve(this).boundingWidth ?? 0;
      return {
        width,
        height: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };

  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return resolve(this).scrollWidth ?? 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return resolve(this).clientWidth ?? 0;
    },
  });

  return function restore() {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    if (scrollDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollWidth',
        scrollDescriptor,
      );
    } else {
      delete (HTMLElement.prototype as any).scrollWidth;
    }
    if (clientDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'clientWidth',
        clientDescriptor,
      );
    } else {
      delete (HTMLElement.prototype as any).clientWidth;
    }
  };
}
