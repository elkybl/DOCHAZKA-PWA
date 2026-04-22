import { AppShell } from "@/components/AppNav";
import { CalendarModule } from "@/components/CalendarModule";

export default function CalendarPage() {
  return (
    <AppShell area="auto" title="Kalendář" subtitle="Plán práce, volna, lékaře a dalších událostí.">
      <CalendarModule />
    </AppShell>
  );
}
