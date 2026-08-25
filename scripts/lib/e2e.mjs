/**
 * Shared browser helpers for the e2e suites.
 *
 * These exist because the same two mistakes were duplicated across five files:
 * clicking a form before React had hydrated it, and asserting on textContent
 * (which includes <script> nodes). Both produced failures that looked like app
 * bugs and were not.
 */

/**
 * innerText, not textContent.
 *
 * textContent walks EVERY node including <script>, and Next inlines its RSC
 * payload as script content -- so a row the page has already removed stays
 * findable long after it stopped rendering, turning every "did this disappear?"
 * assertion into a permanent false negative.
 */
export function visibleText(page) {
  return page.innerText("body");
}

/**
 * Waits for the URL to reach `expected`, swallowing the timeout.
 *
 * Swallowing is deliberate: the check() that follows reports the ACTUAL url,
 * which is a far more useful failure message than a Playwright stack trace.
 */
export async function settle(page, expected, timeout = 30_000) {
  try {
    await page.waitForURL((u) => u.pathname === expected, { timeout });
  } catch {
    /* the caller asserts on page.url() */
  }
  return page.url();
}

/**
 * Signs in, waiting for HYDRATION before touching the form.
 *
 * `waitUntil: "domcontentloaded"` resolves before React has attached its
 * handlers, so filling the fields and clicking submit is a silent no-op -- the
 * page just sits on /login and every later assertion fails as though auth were
 * broken. Waiting for the button to be enabled is the cheap proxy for "this
 * form is live".
 *
 * Retries once, because a cold route compile can still swallow the first
 * attempt on a dev server.
 */
export async function login(page, baseUrl, email, password, expected = "/feed") {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });

    const submit = page.locator('button[type="submit"]');
    await submit.waitFor({ state: "visible", timeout: 60_000 });

    // The credential forms keep this button disabled until React has hydrated
    // (see src/lib/useHydrated.ts), so waiting for it to become enabled is a
    // real hydration check rather than a no-op. An earlier version of this
    // helper made the same check BEFORE the app did that, when the button was
    // enabled from first paint -- so it clicked an inert form, the browser did
    // a native GET, and the password ended up in the URL.
    await page.waitForFunction(
      () => document.querySelector('button[type="submit"]')?.disabled === false,
      { timeout: 60_000 },
    );

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await submit.click();

    await settle(page, expected, 45_000);
    if (!page.url().includes("/login")) return page.url();
  }

  return page.url();
}

/**
 * Raises Playwright's default timeouts for every context this browser makes.
 *
 * Next's dev server compiles each route on FIRST visit, and a cold compile
 * under load comfortably exceeds the 30s default. That is a dev-server
 * characteristic rather than something the app does in production, so the
 * ceiling goes up instead of the failure being treated as real.
 */
export function relaxTimeouts(browser) {
  browser.on("context", (c) => {
    c.setDefaultNavigationTimeout(90_000);
    c.setDefaultTimeout(45_000);
  });
}
