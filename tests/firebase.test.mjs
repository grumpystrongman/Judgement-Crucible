import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rules = JSON.parse(await readFile(new URL("../database.rules.json", import.meta.url), "utf8"));
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const appHosting = await readFile(new URL("../apphosting.yaml", import.meta.url), "utf8");
const store = await readFile(new URL("../lib/session-store.ts", import.meta.url), "utf8");

test("Firebase clients can only read sanitized public sessions", () => {
  assert.equal(rules.rules[".read"], false);
  assert.equal(rules.rules[".write"], false);
  assert.equal(rules.rules.publicSessions.$room[".write"], false);
  assert.equal(rules.rules.privateSessions[".read"], false);
  assert.equal(rules.rules.privateSessions[".write"], false);
  assert.match(rules.rules.publicSessions.$room[".read"], /auth != null/);
});

test("production package uses native Next and Firebase rather than Cloudflare bindings", () => {
  assert.match(pkg.scripts.dev, /^next dev/);
  assert.match(pkg.scripts.build, /^next build/);
  assert.ok(pkg.dependencies.firebase);
  assert.ok(pkg.dependencies["firebase-admin"]);
  assert.ok(!pkg.dependencies["drizzle-orm"]);
});

test("session store writes private authority and sanitized realtime projections separately", () => {
  assert.match(store, /privateSessions\/\$\{session\.code\}/);
  assert.match(store, /publicSessions\/\$\{session\.code\}/);
  assert.match(store, /publicSession\(session\)/);
});

test("Firebase App Hosting runtime is explicitly sized", () => {
  assert.match(appHosting, /cpu: 1/);
  assert.match(appHosting, /memoryMiB: 512/);
  assert.match(appHosting, /maxInstances: 20/);
});
