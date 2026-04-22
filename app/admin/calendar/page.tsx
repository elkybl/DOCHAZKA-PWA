import { AppShell } from "@/components/AppNav";
import { CalendarModule } from "@/components/CalendarModule";

export default function AdminCalendarPage() {
  return (
    <AppShell area="mixed" title="Týmový kalendář" subtitle="Plánování práce, absencí a schvalování docházky.">
      <CalendarModule admin />
    </AppShell>
  );
}
