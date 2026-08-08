/**
 * Restores the HTMLFormElement named-property getter that jsdom leaves out.
 *
 * In a browser, a form exposes each named control as a property, so
 * `form.slug.value` reads the input with name="slug". That is how
 * StartggTournamentSelectorForm reads its uncontrolled slug field out of the
 * submit event. jsdom populates `form.elements` correctly but does not
 * implement the named getter, so the same code throws under test.
 *
 * This is a jsdom gap, not an application bug - the behaviour it restores is
 * standard and works in Electron. Same category as the TextEncoder polyfill in
 * jestSetup.ts.
 */

// eslint-disable-next-line import/prefer-default-export
export function linkNamedFormControls(root: HTMLElement | Document = document) {
  root.querySelectorAll('form').forEach((form) => {
    Array.from(form.elements).forEach((element) => {
      const { name } = element as HTMLInputElement;
      if (name && !(name in form)) {
        Object.defineProperty(form, name, {
          value: element,
          configurable: true,
        });
      }
    });
  });
}
