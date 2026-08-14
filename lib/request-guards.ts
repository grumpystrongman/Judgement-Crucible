import type { GameSession, Participant } from "@/shared/game";

export function normalizeRoom(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

export function normalizeName(value: unknown) {
  return String(value ?? "Council Member").trim().replace(/\s+/g, " ").slice(0, 28);
}

export function findAuthorizedParticipant(
  session: GameSession,
  participantId: unknown,
  participantKey: unknown,
  firebaseUid?: string | null,
): Participant | null {
  const id = String(participantId ?? "");
  const participant = session.participants.find((item) => item.id === id);
  if (!participant) return null;
  if (firebaseUid) return participant.id === firebaseUid ? participant : null;
  return participant.accessKey && participant.accessKey === String(participantKey ?? "") ? participant : null;
}
