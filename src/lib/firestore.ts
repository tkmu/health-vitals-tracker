import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

const globalForFirestore = globalThis as unknown as { firestore: Firestore };

let firestore: Firestore;

if (globalForFirestore.firestore) {
  firestore = globalForFirestore.firestore;
} else {
  if (getApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      try {
        const parsedKey = JSON.parse(serviceAccountKey);
        initializeApp({
          credential: cert(parsedKey),
        });
      } catch (err) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err);
        initializeApp();
      }
    } else {
      initializeApp();
    }
  }

  firestore = getFirestore();
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch (err) {
    // Settings might already be set or Firestore already initialized elsewhere (e.g. NextAuth adapter)
  }

  if (process.env.NODE_ENV !== "production") {
    globalForFirestore.firestore = firestore;
  }
}

export const db = firestore;
