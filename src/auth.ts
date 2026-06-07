import NextAuth from "next-auth";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { db } from "@/lib/firestore";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: FirestoreAdapter(db),
  ...authConfig,
});

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}
