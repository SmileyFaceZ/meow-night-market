import { type Browser, expect, type Page, test } from '@playwright/test';

// The online waiting room (DECISIONS 052): cats are picked inside the room, people come
// before bots, and the host's rule switches reach everyone at once. Phone width.

test.use({ viewport: { width: 375, height: 812 } });

async function newPlayer(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('mnm.lang', 'en');
    localStorage.setItem('mnm.tutorialSeen', '1');
    localStorage.setItem('mnm.mayhemIntroSeen', '1');
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`);
  });
  return { page, errors };
}

const picker = (page: Page) => page.getByRole('radiogroup', { name: 'Pick your cat' });
const cat = (page: Page, name: string) =>
  picker(page).getByRole('radio', { name: new RegExp(`^${name}\\b`) });
/** The cat this page's player has now. */
const myCat = async (page: Page) =>
  (await picker(page).getByRole('radio', { checked: true }).getAttribute('aria-label'))!.split(
    ' · ',
  )[0]!;

test('waiting room: pick cats, people before bots, rules update for everyone', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);

  await host.page.goto('/');
  await host.page.getByRole('button', { name: 'Play Online' }).click();
  // No cat to choose before the room any more.
  await expect(host.page.getByRole('radiogroup', { name: 'Pick your cat' })).toHaveCount(0);
  await host.page.getByLabel('Your nickname').fill('Ann');
  await host.page.getByRole('button', { name: 'Create a room' }).click();
  await host.page.waitForURL(/\/room\/[A-Z]{4}$/);
  const code = /\/room\/([A-Z]{4})$/.exec(host.page.url())![1]!;

  await guest.page.goto(`/room/${code}`);
  await guest.page.getByLabel('Your nickname').fill('Bo');
  await guest.page.getByRole('button', { name: `Join room ${code}` }).click();
  await expect(
    host.page.getByRole('region', { name: 'Seats' }).getByText('Bo', { exact: true }),
  ).toBeVisible();

  // 1. Both want the Korat: the host is first, the guest is told it is taken.
  await cat(host.page, 'Korat').click();
  await expect(cat(host.page, 'Korat')).toBeChecked();
  await expect(cat(guest.page, 'Korat')).toHaveAttribute('aria-label', /Ann’s cat/);
  const guestBefore = await myCat(guest.page);
  await cat(guest.page, 'Korat').click({ force: true }); // marked aria-disabled, still tappable
  await expect(guest.page.getByText('Ann already has this cat')).toBeVisible();
  expect(await myCat(guest.page)).toBe(guestBefore);

  // 2. A bot (difficulty only; personality and cat drawn) — and the guest takes its cat.
  await host.page.getByRole('radio', { name: 'Easy' }).click();
  await host.page.getByRole('button', { name: '+ Add a bot' }).click();
  const botCat = guest.page
    .getByRole('radiogroup', { name: 'Pick your cat' })
    .getByRole('radio', { name: /tap to take it/ });
  await expect(botCat).toHaveCount(1);
  const wanted = (await botCat.getAttribute('aria-label'))!.split(' · ')[0]!;
  await botCat.click();
  await expect(cat(guest.page, wanted)).toBeChecked();
  // The bot drew another free cat: still one cat per seat, on both screens.
  await expect(picker(host.page).getByRole('radio', { name: /tap to take it/ })).toHaveCount(1);
  const botNow = (await picker(host.page)
    .getByRole('radio', { name: /tap to take it/ })
    .getAttribute('aria-label'))!.split(' · ')[0]!;
  expect([wanted, 'Korat']).not.toContain(botNow);

  // 3. Market Mayhem on: the guest sees each cat's power right away; off again: gone.
  await host.page.getByRole('radio', { name: 'Market Mayhem' }).click();
  await expect(picker(guest.page).getByText('Keen Nose')).toBeVisible();
  await expect(picker(guest.page).getByText('Big Appetite')).toBeVisible();
  await host.page.getByRole('radio', { name: 'Classic' }).click();
  await expect(picker(guest.page).getByText('Keen Nose')).toHaveCount(0);

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});
