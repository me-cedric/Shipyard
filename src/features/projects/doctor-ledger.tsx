import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { dateLocale, formatDay, usePrefs } from "@/lib/prefs";
import { useHealth } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Row } from "@/ui/molecules/row";
import { SetupCard } from "@/ui/molecules/setup-card";

/**
 * Setup / Logs and feedback: one row each time the findings changed, newest first. Reading it
 * records a snapshot. The page Logs and feedback mounts this part.
 */
export function FindingsOverTime() {
	const { t, lang } = useI18n();
	const { dateFormat } = usePrefs();
	// The local day and time of the stamp, in the date format of the person.
	const when = (at: string) => {
		const d = new Date(at);
		const day = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
			.map((n) => String(n).padStart(2, "0"))
			.join("-");
		const time = d.toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit" });
		return `${formatDay(day, dateFormat, lang)} ${time}`;
	};
	const l = t.settings.ledger;
	const findings = useHealth().data ?? [];
	// A new set of findings reads the ledger again, and that read records the snapshot.
	const ledger = useQuery({
		queryKey: ["doctor", "ledger", findings.map((f) => f.id).join(",")],
		queryFn: () => unwrap(commands.doctorLedger()),
	});
	return (
		<SetupCard id="doctor-ledger" title={l.title}>
			{(ledger.data ?? []).map((e) => (
				<Row key={e.at}>
					<time dateTime={e.at} className="text-ui font-normal text-n-11">
						{when(e.at)}
					</time>
					{e.added > 0 ? (
						<Badge variant="neutral">{format(l.added, { count: e.added })}</Badge>
					) : null}
					{e.resolved > 0 ? (
						<Badge variant="success">{format(l.resolved, { count: e.resolved })}</Badge>
					) : null}
					<span className="sr-only">{e.items.length}</span>
				</Row>
			))}
		</SetupCard>
	);
}
