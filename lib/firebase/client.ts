"use client";

import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth, signInAnonymously, User } from "firebase/auth";
import { AppCheck, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { Database, getDatabase, onValue, ref } from "firebase/database";
import type { GameSession } from "@/shared/game";

export type FirebaseClientContext = {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
  user: User;
  appCheck?: AppCheck;
};

let contextPromise: Promise<FirebaseClientContext | null> | null = null;

function explicitConfig() {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (raw) {
    try { return JSON.parse(raw) as Record<string, string>; } catch { return null; }
  }
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    projectId,
    appId,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
}

async function createContext(): Promise<FirebaseClientContext | null> {
  if (typeof window === "undefined") return null;
  try {
    const config = explicitConfig();
    // Firebase App Hosting injects FIREBASE_WEBAPP_CONFIG during build, allowing
    // initializeApp() without explicit options. Local development can provide
    // NEXT_PUBLIC_FIREBASE_CONFIG or use the polling fallback.
    const app = getApps()[0] ?? (config ? initializeApp(config) : initializeApp());
    const auth = getAuth(app);
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const db = getDatabase(app);
    let appCheck: AppCheck | undefined;
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
    if (siteKey) {
      try {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch {
        // Hot reload may initialize App Check more than once; the existing
        // instance remains active and the game can continue.
      }
    }
    return { app, auth, db, user, appCheck };
  } catch {
    return null;
  }
}

export function getFirebaseClient() {
  contextPromise ??= createContext();
  return contextPromise;
}

export async function apiSecurityHeaders() {
  const context = await getFirebaseClient();
  if (!context) return {} as Record<string, string>;
  const headers: Record<string, string> = {
    authorization: `Bearer ${await context.user.getIdToken()}`,
  };
  if (context.appCheck) {
    try {
      const { getToken } = await import("firebase/app-check");
      const token = await getToken(context.appCheck, false);
      if (token?.token) headers["x-firebase-appcheck"] = token.token;
    } catch {
      // API requests still work when App Check enforcement is disabled.
    }
  }
  return headers;
}

export async function subscribeToPublicSession(
  code: string,
  onSession: (session: GameSession | null) => void,
  onError: (message: string) => void,
) {
  const context = await getFirebaseClient();
  if (!context) return null;
  const sessionRef = ref(context.db, `publicSessions/${code.toUpperCase()}`);
  return onValue(
    sessionRef,
    (snapshot) => onSession(snapshot.exists() ? snapshot.val() as GameSession : null),
    () => onError("Realtime connection interrupted"),
  );
}
