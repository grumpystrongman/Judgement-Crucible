import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

type SessionResponse = {
  session: {
    code: string;
    hostKey: string;
    phase: string;
    status: string;
    participants: Array<{ id: string; name: string; ready: boolean; vote?: string }>;
    votesCast?: number;
    voteSummary?: Record<string, number>;
    chairId?: string;
  };
  participantId?: string;
  participantKey?: string;
};

async function post(request: APIRequestContext, data: Record<string, unknown>) {
  const response = await request.post("/api/session", { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return await response.json() as SessionResponse;
}

async function prepareSession(request: APIRequestContext) {
  const created = await post(request, { action: "create" });
  const code = created.session.code;
  const hostKey = created.session.hostKey;
  const joined = await post(request, { action: "join", code, name: "Jordan" });
  const participantId = joined.participantId!;
  const participantKey = joined.participantKey!;
  await post(request, { action: "ready", code, participantId, participantKey });
  return { code, hostKey, participantId, participantKey };
}

async function hostAction(request: APIRequestContext, code: string, hostKey: string, action: string, extra: Record<string, unknown> = {}) {
  return post(request, { action, code, hostKey, ...extra });
}

async function setHostCredentials(page: Page, code: string, hostKey: string) {
  await page.addInitScript(({ code, hostKey }) => {
    localStorage.setItem("crucible-host-code", code);
    localStorage.setItem("crucible-host-key", hostKey);
  }, { code, hostKey });
}

function docShot(name: string) {
  mkdirSync(path.join(process.cwd(), "public", "screenshots"), { recursive: true });
  return path.join(process.cwd(), "public", "screenshots", name);
}

test("landing page presents a commercial product, not a framework", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /The call you don’t want to get/i })).toBeVisible();
  await expect(page.getByText("Train the decision, not the trivia.")).toBeVisible();
  await expect(page.getByText("One screen. Every phone. No install.")).toBeVisible();
  const shot = docShot("01-landing.png");
  if (!existsSync(shot)) await page.screenshot({ path: shot, fullPage: true });
});

test("private votes remain unattributed while aggregate split becomes visible", async ({ request }) => {
  const { code, hostKey, participantId, participantKey } = await prepareSession(request);
  await hostAction(request, code, hostKey, "advance"); // briefing
  await hostAction(request, code, hostKey, "advance"); // fact
  await hostAction(request, code, hostKey, "advance"); // voting
  await post(request, { action: "vote", code, participantId, participantKey, optionKey: "C1-C" });

  const duringVote = await request.get(`/api/session?code=${code}`);
  expect(duringVote.ok()).toBeTruthy();
  const during = await duringVote.json() as SessionResponse;
  expect(during.session.votesCast).toBe(1);
  expect(during.session.voteSummary).toEqual({});
  expect(during.session.participants[0]).not.toHaveProperty("vote");

  await hostAction(request, code, hostKey, "advance"); // split
  const afterClose = await request.get(`/api/session?code=${code}`);
  const split = await afterClose.json() as SessionResponse;
  expect(split.session.voteSummary?.["C1-C"]).toBe(1);
  expect(split.session.participants[0]).not.toHaveProperty("vote");
});

test("host, room, and phone complete the first pressured decision", async ({ request, browser }) => {
  const { code, hostKey, participantId, participantKey } = await prepareSession(request);

  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const hostPage = await hostContext.newPage();
  await setHostCredentials(hostPage, code, hostKey);
  await hostPage.goto(`/host?code=${code}`);
  await expect(hostPage.getByText(`ROOM ${code}`)).toBeVisible();
  await expect(hostPage.getByText(/1 participants joined/i)).toBeVisible();
  const hostShot = docShot("02-host-lobby.png");
  if (!existsSync(hostShot)) await hostPage.screenshot({ path: hostShot, fullPage: true });

  await hostAction(request, code, hostKey, "advance");
  await hostAction(request, code, hostKey, "advance");
  await hostAction(request, code, hostKey, "advance");
  await post(request, { action: "vote", code, participantId, participantKey, optionKey: "C1-C" });
  await hostAction(request, code, hostKey, "advance");

  const roomContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const roomPage = await roomContext.newPage();
  await roomPage.goto(`/room?code=${code}`);
  await expect(roomPage.getByText("The room is not aligned.")).toBeVisible();
  await expect(roomPage.getByText("Jordan", { exact: true })).toBeVisible();
  const roomShot = docShot("03-room-split.png");
  if (!existsSync(roomShot)) await roomPage.screenshot({ path: roomShot, fullPage: true });

  await hostAction(request, code, hostKey, "advance"); // pressure
  await hostAction(request, code, hostKey, "advance"); // chair

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phonePage = await phoneContext.newPage();
  await phonePage.addInitScript(({ code, participantId, participantKey }) => {
    localStorage.setItem(`crucible-participant-${code}`, participantId);
    localStorage.setItem(`crucible-participant-key-${code}`, participantKey);
    localStorage.setItem(`crucible-vote-${code}-0`, "C1-C");
  }, { code, participantId, participantKey });
  await phonePage.goto(`/play?code=${code}`);
  await expect(phonePage.getByRole("heading", { name: "Make the call." })).toBeVisible();
  await expect(phonePage.getByText("YOUR EXECUTIVE RECORD")).toBeVisible();
  const phoneShot = docShot("04-mobile-chair.png");
  if (!existsSync(phoneShot)) await phonePage.screenshot({ path: phoneShot, fullPage: true });

  await phonePage.locator('.chair-choice-group').nth(0).getByRole('button').nth(2).click();
  await phonePage.locator('.chair-choice-group').nth(1).getByRole('button').first().click();
  await phonePage.locator('.chair-choice-group').nth(2).getByRole('button').first().click();
  await phonePage.locator('.chair-choice-group').nth(3).getByRole('button').first().click();
  await phonePage.locator('.chair-choice-group').nth(4).getByRole('button').first().click();
  await phonePage.getByRole("button", { name: "Commit my decision" }).click();
  await expect(roomPage.getByText("DECISION COMMITTED")).toBeVisible({ timeout: 10_000 });

  await hostContext.close();
  await roomContext.close();
  await phoneContext.close();
});
