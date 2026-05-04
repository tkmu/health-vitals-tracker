import { AppShell } from "@/components/app-shell";
import { DashboardShell } from "./dashboard-shell";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardShell />
    </AppShell>
  );
}
