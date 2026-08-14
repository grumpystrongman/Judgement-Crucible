import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getAppCheck } from "firebase-admin/app-check";

function hasFirebaseRuntime() {
  return Boolean(
    process.env.FIREBASE_CONFIG ||
    process.env.FIREBASE_DATABASE_URL ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT,
  );
}

export function firebaseAdminAvailable() {
  return hasFirebaseRuntime();
}

export function getAdminApp() {
  if (!hasFirebaseRuntime()) return null;
  if (getApps().length) return getApps()[0]!;
  return initializeApp(
    process.env.FIREBASE_DATABASE_URL
      ? { databaseURL: process.env.FIREBASE_DATABASE_URL }
      : undefined,
  );
}

export function getAdminDatabase() {
  const app = getAdminApp();
  return app ? getDatabase(app) : null;
}

export async function verifyFirebaseIdToken(request: Request) {
  const app = getAdminApp();
  if (!app) return null;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  try {
    return await getAuth(app).verifyIdToken(authorization.slice(7));
  } catch {
    return null;
  }
}

export async function verifyAppCheckIfRequired(request: Request) {
  if (process.env.REQUIRE_APP_CHECK !== "true") return true;
  const app = getAdminApp();
  if (!app) return process.env.NODE_ENV !== "production";
  const token = request.headers.get("x-firebase-appcheck");
  if (!token) return false;
  try {
    await getAppCheck(app).verifyToken(token);
    return true;
  } catch {
    return false;
  }
}
