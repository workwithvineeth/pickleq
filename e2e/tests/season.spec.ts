import { expect, test, type Page } from '@playwright/test';
import { runSeason, type SeasonReport } from '../season-sim';

/**
 * Full-scale day: 13 tournaments at once (incl. best runners-up, a round of 16 with per-round formats, and knockout-only singles and doubles with the same people), 300 players, with walkovers, retirements, withdrawals, late entries,
 * a replaced player, a cancelled and a moved match, live scores and a scorer link. The day is run with the app's
 * own club code, then the robot opens every tournament in the app (on a phone screen) to check it all shows.
 */
let season: { state: string; report: SeasonReport } | null = null;
async function getSeason() {
  if (!season) { const { storage, report } = await runSeason(); season = { state: storage.getItem('pq-club-demo-v1') ?? '', report }; }
  return season;
}

async function loadDay(page: Page, state: string) {
  await page.goto('./');
  await page.evaluate((s) => { localStorage.setItem('pq-club-demo-v1', s); localStorage.setItem('pq-club-mode', 'demo'); }, state);
}

test.describe('Full-scale day (13 tournaments, 300 players)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('the day runs to the end and every rule holds', async ({}, info) => {
    const { report } = await getSeason();
    await info.attach('season-report.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    console.log(`Season: ${report.tournaments} tournaments, ${report.divisions} events, ${report.players} players (${report.playersEntered} entered), ${report.matchesPlayed} matches, ${report.walkovers} walkovers, ${report.retirements} retirements, ${report.withdrawals} withdrawals, ${report.lateEntries} late entries, ${report.replacements} replaced, ${report.matchesCancelled} cancelled, ${report.moved} moved, ${report.scorerLinkScores} by scorer link, ${report.livePointUpdates} live updates, ${report.rounds} rounds, ${report.ms} ms, ${Math.round(report.storageBytes / 1024)} KB`);
    expect(report.problems).toEqual([]);
    expect(report.tournaments).toBe(13);
    expect(report.playersEntered).toBe(300);
    expect(report.champions).toHaveLength(report.divisions);
    expect(report.lateRefused).toContain('Knockouts have started, so new entries can’t join');
    // The whole day must fit in a phone's storage (about 5 MB for the browser).
    expect(report.storageBytes).toBeLessThan(4_500_000);
  });

  test('every tournament opens in the app with its results', async ({ page }) => {
    const { state, report } = await getSeason();
    await loadDay(page, state);
    for (const t of report.tournamentIds) {
      await page.goto(`#/club-tournament/${t.id}`);
      await expect(page.getByRole('heading', { name: t.name })).toBeVisible();
      await page.getByRole('button', { name: 'Knockouts' }).click();
      await expect(page.getByRole('region', { name: 'Knockouts' }).getByText(/Final|This event has no knockouts/).first()).toBeVisible();
    }
    // Walkovers and cancelled matches are shown as such.
    await page.goto(`#/club-tournament/${report.tournamentIds[0].id}`);
    await expect(page.getByText('Walkover').first()).toBeVisible();
    // Desk view of a finished day: everything played.
    const t1 = report.tournamentIds[0];
    await page.goto(`#/club-desk/${t1.id}`);
    await expect(page.getByRole('heading', { name: `${t1.name} · Desk` })).toBeVisible();
    await expect(page.getByText(/(\d+) of \1 matches played/)).toBeVisible();
    // Public results link for a finished tournament.
    await page.goto(`#/results/${report.tournamentIds[3].slug}`);
    await expect(page.getByRole('heading', { name: report.tournamentIds[3].name })).toBeVisible();
  });
});

async function openSeason8(page: Page) {
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Robot');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
  await page.getByRole('button', { name: /Pickleball Central Season 8/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Pickleball Central Season 8' })).toBeVisible();
}

test.describe('Pickleball Central Season 8 (demo sample)', () => {
  test('singles is live; the organiser adds and removes doubles teams before doubles starts', async ({ page }) => {
    await openSeason8(page);
    await page.getByRole('button', { name: 'Entries' }).click();
    await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
    await page.getByRole('button', { name: 'Season 8 Doubles' }).click();
    await expect(page.getByText('12 active teams')).toBeVisible();
    for (const n of ['Robot Late A', 'Robot Late B']) {
      await page.getByLabel('Walk-in player name').fill(n);
      await page.getByLabel('Walk-in player DUPR').fill('3.6');
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(`${n} added to the club`)).toBeVisible();
    }
    const a = page.getByLabel('Late entry player');
    await a.selectOption((await a.locator('option', { hasText: 'Robot Late A' }).getAttribute('value')) ?? '');
    const p2 = page.getByLabel('Late entry partner');
    await p2.selectOption((await p2.locator('option', { hasText: 'Robot Late B' }).getAttribute('value')) ?? '');
    await page.getByRole('button', { name: 'Add to the event' }).click();
    await expect(page.getByText(/Robot Late A \/ Robot Late B added to Pool [A-D] with \d+ new match/)).toBeVisible();
    await expect(page.getByText('13 active teams')).toBeVisible();

    await page.getByRole('button', { name: 'Change' }).first().click();
    await page.getByRole('button', { name: 'Withdraw…' }).click();
    await page.getByRole('button', { name: 'Yes, withdraw' }).click();
    await expect(page.getByText(/withdrawn\. \d+ match(es)? cancelled\./)).toBeVisible();
    await expect(page.getByText('12 active teams')).toBeVisible();
  });

  test('desk: a no-show gives the other side a walkover', async ({ page }) => {
    await openSeason8(page);
    await page.getByRole('button', { name: 'Desk view' }).click();
    await expect(page.getByRole('heading', { name: 'Pickleball Central Season 8 · Desk' })).toBeVisible();
    await page.getByRole('button', { name: 'Walkover…' }).first().click();
    await page.getByRole('region', { name: 'Walkover or retired' }).getByRole('button', { name: /go through/ }).first().click();
    await expect(page.getByText(/win by walkover|win: the other side retired/)).toBeVisible();
  });

  test('a shared Season 8 link opens on a phone that never opened the demo', async ({ page }) => {
    await page.goto('#/event/pq-demo-central-s8');
    await expect(page.getByRole('heading', { name: 'Pickleball Central Season 8' })).toBeVisible();
    await expect(page.getByText('Live now')).toBeVisible();
  });
});
