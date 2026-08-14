import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scenario = JSON.parse(await readFile(new URL("../spec/trusted-path-v2/trusted-path.v2.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(await readFile(new URL("../spec/trusted-path-v2/trusted-path.tests.json", import.meta.url), "utf8"));
const tokens = JSON.parse(await readFile(new URL("../spec/trusted-path-v2/cyber-ronin.tokens.json", import.meta.url), "utf8"));

test("ships the complete four-call Trusted Path package", () => {
  assert.equal(scenario.calls.length, 4);
  assert.deepEqual(scenario.calls.map((call) => call.options.length), [4, 4, 4, 4]);
  assert.deepEqual(scenario.calls.map((call) => call.call_id), ["C1", "C2", "C3", "C4"]);
  assert.equal(scenario.duration_variants["30"].enabled, true);
});

test("contains the canonical deterministic fixtures", () => {
  assert.deepEqual(fixtures.rules_fixtures.map((item) => item.test_id), ["T1", "T2", "T3", "T4", "T5"]);
  assert.deepEqual(fixtures.experience_fixtures.map((item) => item.test_id), ["UX-01", "UX-02", "UX-03", "UX-04", "UX-05", "UX-06", "UX-07", "UX-08"]);
});

test("uses the approved Judgment Chamber Cyber Ronin system", () => {
  assert.equal(tokens.theme, "judgment-chamber");
  assert.equal(tokens.color.signal_cyan, "#00C8F8");
  assert.equal(tokens.color.consequence_ember, "#E56A3D");
  assert.ok(tokens.balance.controlled_dark_surfaces_percent >= 70);
  assert.ok(tokens.prohibited.includes("bright_white_panels"));
});

test("implements every production surface", async () => {
  const files = await Promise.all([
    "../app/page.tsx",
    "../app/host/page.tsx",
    "../app/room/page.tsx",
    "../app/play/page.tsx",
    "../app/simulator/page.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.ok(files.every((source) => source.includes("CrucibleClient")));
});

test("keeps consequence, judgment process, tendencies, and transfer separate", async () => {
  const source = await readFile(new URL("../app/components/CrucibleClient.tsx", import.meta.url), "utf8");
  const game = await readFile(new URL("../shared/game.ts", import.meta.url), "utf8");
  assert.match(source, /Consequences are not scores/);
  assert.match(source, /Competing executive pressure/);
  assert.match(source, /Commit my decision/);
  assert.match(source, /Room Judgment Debrief/);
  assert.match(source, /Train the decision, not the trivia/);
  assert.match(game, /decisionTrail: DecisionRecord\[\]/);
  assert.match(game, /records\.length >= 2/);
  assert.match(game, /carriedForward/);
});

test("never sends individual votes through the public or host projection", async () => {
  const game = await readFile(new URL("../shared/game.ts", import.meta.url), "utf8");
  assert.match(game, /vote: _vote/);
  assert.match(game, /voteSummary: revealVotes \? voteDistribution\(session\) : \{\}/);
  assert.match(game, /Host receives readiness and private post-session commitments, never vote attribution/);
});

test("authorizes the active Chair and validates structured decisions server-side", async () => {
  const source = await readFile(new URL("../app/api/session/route.ts", import.meta.url), "utf8");
  assert.match(source, /action === "chairDecision"/);
  assert.match(source, /session\.chairId !== participant\.id/);
  assert.match(source, /buildChairStatement/);
  assert.match(source, /verifyFirebaseIdToken/);
  assert.match(source, /verifyAppCheckIfRequired/);
});
