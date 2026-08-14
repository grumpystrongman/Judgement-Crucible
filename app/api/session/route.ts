import { randomUUID } from "node:crypto";
import {
  advance,
  buildChairStatement,
  type ChairDecisionInput,
  createSession,
  hostSession,
  publicSession,
  resolveDecision,
  scenario,
} from "@/shared/game";
import { firebaseAdminAvailable, verifyAppCheckIfRequired, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { createStoredSession, readSession, saveSession, storageMode } from "@/lib/session-store";
import { findAuthorizedParticipant, normalizeName, normalizeRoom } from "@/lib/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PARTICIPANTS = 32;

function roomCode() {
  return Array.from({ length: 4 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
}

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(body, { ...init, headers });
}

async function identity(request: Request) {
  const uid = (await verifyFirebaseIdToken(request))?.uid ?? null;
  if (firebaseAdminAvailable() && !uid) return { uid: null, error: json({ error: "Authentication required" }, { status: 401 }) };
  if (!(await verifyAppCheckIfRequired(request))) return { uid, error: json({ error: "App integrity check failed" }, { status: 401 }) };
  return { uid, error: null };
}

export async function GET(request: Request) {
  try {
    const auth = await identity(request);
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    const room = normalizeRoom(url.searchParams.get("code"));
    const hostKey = url.searchParams.get("hostKey") ?? "";
    if (room.length !== 4) return json({ error: "A four-character room code is required" }, { status: 400 });
    const session = await readSession(room);
    if (!session) return json({ error: "Room not found" }, { status: 404 });
    const isHost = Boolean(hostKey && hostKey === session.hostKey);
    return json({ session: isHost ? hostSession(session) : publicSession(session), storage: storageMode() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Session unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await identity(request);
    if (auth.error) return auth.error;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "create");

    if (action === "create") {
      let code = roomCode();
      for (let attempt = 0; attempt < 20 && await readSession(code); attempt += 1) code = roomCode();
      const session = createSession(code, randomUUID());
      await createStoredSession(session);
      return json({ session: hostSession(session), storage: storageMode() }, { status: 201 });
    }

    const room = normalizeRoom(body.code);
    if (room.length !== 4) return json({ error: "A valid room code is required" }, { status: 400 });
    const session = await readSession(room);
    if (!session) return json({ error: "Room not found" }, { status: 404 });

    if (action === "join") {
      const name = normalizeName(body.name);
      if (!name) return json({ error: "Enter a seat name" }, { status: 400 });
      const requestedId = String(body.participantId ?? "");
      const requestedKey = String(body.participantKey ?? "");
      let participant = auth.uid
        ? session.participants.find((item) => item.id === auth.uid)
        : session.participants.find((item) => item.id === requestedId && item.accessKey === requestedKey);
      if (!participant) {
        if (session.status === "closed") return json({ error: "This session is closed" }, { status: 409 });
        if (session.participants.length >= MAX_PARTICIPANTS) return json({ error: "This room has reached its 32-seat limit" }, { status: 409 });
        participant = {
          id: auth.uid ?? randomUUID(),
          accessKey: auth.uid ? undefined : randomUUID(),
          name,
          ready: false,
        };
        session.participants.push(participant);
      } else {
        participant.name = name;
      }
      await saveSession(session);
      return json({
        session: publicSession(session),
        participantId: participant.id,
        participantKey: participant.accessKey ?? "",
        storage: storageMode(),
      });
    }

    if (["ready", "vote", "chairDecision", "commitment"].includes(action)) {
      const participant = findAuthorizedParticipant(session, body.participantId, body.participantKey, auth.uid);
      if (!participant) return json({ error: "Participant authorization failed" }, { status: 403 });

      if (action === "ready") {
        participant.ready = true;
        await saveSession(session);
        return json({ session: publicSession(session) });
      }

      if (action === "vote") {
        if (session.phase !== "voting") return json({ error: "Voting is closed" }, { status: 409 });
        const optionKey = String(body.optionKey ?? "");
        const valid = scenario.calls[session.callIndex]?.options.some((option) => option.option_key === optionKey);
        if (!valid) return json({ error: "Unknown decision option" }, { status: 400 });
        participant.vote = optionKey;
        await saveSession(session);
        return json({ session: publicSession(session) });
      }

      if (action === "chairDecision") {
        if (session.phase !== "chair") return json({ error: "The Chair is not currently deciding" }, { status: 409 });
        if (!session.chairId || session.chairId !== participant.id) return json({ error: "Only the active Chair can commit this decision" }, { status: 403 });
        const input = body.payload as ChairDecisionInput;
        const next = resolveDecision(session, {
          optionKey: input.optionKey,
          statement: buildChairStatement(session.callIndex, input),
          judgment: { decision: true, priority: true, tradeoff: true, trigger: true, owner: true },
          chairInput: input,
          hesitation: Boolean(session.countdownEndsAt && Date.now() > session.countdownEndsAt),
          inputs: {
            decision_right_explicit: true,
            identities_validated: input.optionKey === "C2-C",
            interim_recommendation: true,
          },
        });
        await saveSession(next);
        return json({ session: publicSession(next) });
      }

      if (session.status !== "closed") return json({ error: "The commitment opens when the session closes" }, { status: 409 });
      participant.commitment = String(body.commitment ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
      if (!participant.commitment) return json({ error: "Enter a commitment before sealing it" }, { status: 400 });
      await saveSession(session);
      return json({ session: publicSession(session) });
    }

    if (String(body.hostKey ?? "") !== session.hostKey) return json({ error: "Host authorization failed" }, { status: 403 });

    let next = session;
    if (action === "advance") {
      if (session.phase === "lobby" && session.participants.filter((participant) => participant.ready).length < 1) {
        return json({ error: "At least one participant must be ready before briefing begins" }, { status: 409 });
      }
      next = advance(session);
    } else if (action === "decision") {
      next = resolveDecision(session, body.payload as Parameters<typeof resolveDecision>[1]);
    } else if (action === "assignChair") {
      const participantId = String(body.participantId ?? "");
      if (!session.participants.some((participant) => participant.id === participantId)) return json({ error: "Chair must be an active participant" }, { status: 400 });
      next.chairId = participantId;
    } else if (action === "manualVotes") {
      const distribution = body.distribution as Record<string, number>;
      next.participants = [];
      let index = 0;
      for (const [optionKey, rawCount] of Object.entries(distribution ?? {})) {
        if (!scenario.calls[next.callIndex]?.options.some((option) => option.option_key === optionKey)) continue;
        const count = Math.max(0, Math.min(32, Number(rawCount) || 0));
        for (let i = 0; i < count && next.participants.length < MAX_PARTICIPANTS; i += 1) {
          index += 1;
          next.participants.push({ id: `manual-${index}`, name: `Seat ${index}`, ready: true, vote: optionKey });
        }
      }
    } else {
      return json({ error: "Unsupported action" }, { status: 400 });
    }

    await saveSession(next);
    return json({ session: hostSession(next), storage: storageMode() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 500 });
  }
}
