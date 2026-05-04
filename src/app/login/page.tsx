import { LoginClient } from "./login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.callbackUrl;
  const callbackUrl = typeof raw === "string" && raw.startsWith("/") ? raw : "/dashboard";
  return <LoginClient callbackUrl={callbackUrl} />;
}
