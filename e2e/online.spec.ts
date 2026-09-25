import { type Browser, expect, type Page, test } from '@playwright/test';

// Two people play a whole online game against each other, then go back to the lobby.

async function newPlayer(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('mnm.lang', 'en');
    localStorage.setItem('mnm.tutorialSeen', '1');
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`);
  });
  return { page, errors };
}

/** One move (or one tap through an animation). Returns true once the scores are shown. */
async function step(page: Page): Promise<boolean> {
  if (await page.getByRole('button', { name: 'Play again' }).isVisible()) return true;
  const skip = page.getByText('Tap to skip');
  if (await skip.isVisible()) {
    await skip.click({ force: true, timeout: 1_000 }).catch(() => {});
    return false;
  }
  const clickIfVisible = async (name: string | RegExp) => {
    const button = page.getByRole('button', { name }).first();
    if (!(await button.isVisible())) return false;
    await button.click({ timeout: 1_000 }).catch(() => {});
    return true;
  };
  if (await clickIfVisible('See scores')) return false;

  const hint = (await page.locator('p[aria-live="polite"]').first().textContent()) ?? '';
  if (hint.startsWith('Secretly pick')) {
    if (await clickIfVisible(/^Meow \d$/)) await clickIfVisible(/^Bid/);
  } else if (hint.startsWith('Your turn! Tap one food')) {
    // Short timeout like every click here: the stall can empty before the click lands.
    await page
      .getByRole('region', { name: 'Market stall' })
      .getByRole('button')
      .first()
      .click({ timeout: 1_000 })
      .catch(() => {});
  } else if (hint.startsWith('A guard dog')) {
    await clickIfVisible('Run away');
  } else if (hint.startsWith('Keep digging')) {
    await clickIfVisible('Stop');
  } else if (hint.startsWith('Pick a meal')) {
    if (!(await clickIfVisible(/^(Eat|Big) /))) await clickIfVisible('Done eating');
  } else if (hint.startsWith('Too many cards')) {
    const count = Number(/Discard (\d+)/.exec(hint)?.[1] ?? 0);
    const hand = page.locator('section.sticky').getByRole('button');
    for (let i = 0; i < count; i++)
      await hand
        .nth(i)
        .click({ timeout: 1_000 })
        .catch(() => {});
    await clickIfVisible(/^Discard \d/);
  }
  return false;
}

test('two friends play a whole game online', async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);

  // Host creates a room.
  await host.page.goto('/');
  await host.page.getByRole('button', { name: 'Play Online' }).click();
  await host.page.getByLabel('Your nickname').fill('Ann');
  await host.page.getByRole('button', { name: 'Create a room' }).click();
  await host.page.waitForURL(/\/room\/[A-Z]{4}$/);
  const code = /\/room\/([A-Z]{4})$/.exec(host.page.url())![1]!;

  // Guest opens the shared link.
  await guest.page.goto(`/room/${code}`);
  await guest.page.getByLabel('Your nickname').fill('Bo');
  await guest.page.getByRole('button', { name: `Join room ${code}` }).click();
  await expect(host.page.getByText('Bo', { exact: true })).toBeVisible();
  await expect(guest.page.getByText('Waiting for the host to start…')).toBeVisible();

  // No turn timer, so a slow test machine never hands a turn to a bot.
  await host.page.getByRole('radio', { name: 'No timer' }).click();
  await host.page.getByRole('button', { name: 'Start game!' }).click();

  const done = { host: false, guest: false };
  const deadline = Date.now() + 200_000;
  while (!(done.host && done.guest)) {
    if (Date.now() > deadline) {
      const hints = await Promise.all(
        [host.page, guest.page].map((p) => p.locator('main').first().innerText()),
      );
      throw new Error(`game did not finish in time:\n${hints.join('\n-----\n')}`);
    }
    done.host ||= await step(host.page);
    done.guest ||= await step(guest.page);
  }

  // Both see the same scores; the host takes everyone back to the lobby.
  const scores = async (page: Page) =>
    (await page.locator('ol li').allTextContents()).map((s) =>
      s.replace(' (You)', '').replace(/\s+/g, ' '),
    );
  expect(await scores(host.page)).toEqual(await scores(guest.page));
  await host.page.getByRole('button', { name: 'Play again' }).click();
  await expect(guest.page.getByText('Waiting for the host to start…')).toBeVisible();
  await expect(host.page.getByRole('button', { name: 'Start game!' })).toBeVisible();

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});
