import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameSession } from "@/shared/game";
import { publicSession } from "@/shared/game";
import { getAdminDatabase } from "@/lib/firebase/admin";

const localRoot = path.join(process.cwd(), ".local-data", "sessions");

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function localRead(code: string): Promise<GameSession | null> {
  try {
    const raw = await readFile(path.join(localRoot, `${code}.json`), "utf8");
    return JSON.parse(raw) as GameSession;
  } catch {
    return null;
  }
}

async function localWrite(session: GameSession) {
  await mkdir(localRoot, { recursive: true });
  const target = path.join(localRoot, `${session.code}.json`);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(clean(session), null, 2), "utf8");
  await rename(temp, target);
}

export async function readSession(code: string): Promise<GameSession | null> {
  const normalized = code.toUpperCase();
  const db = getAdminDatabase();
  if (!db) return localRead(normalized);
  const snapshot = await db.ref(`privateSessions/${normalized}`).get();
  return snapshot.exists() ? snapshot.val() as GameSession : null;
}

export async function saveSession(session: GameSession) {
  session.updatedAt = new Date().toISOString();
  const db = getAdminDatabase();
  if (!db) return localWrite(session);
  const safe = clean(publicSession(session));
  await db.ref().update({
    [`privateSessions/${session.code}`]: clean(session),
    [`publicSessions/${session.code}`]: safe,
  });
}

export async function createStoredSession(session: GameSession) {
  const existing = await readSession(session.code);
  if (existing) throw new Error("Room collision");
  await saveSession(session);
}

export function storageMode() {
  return getAdminDatabase() ? "firebase-realtime-database" : "local-json";
}
