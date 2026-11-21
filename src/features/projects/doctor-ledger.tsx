import { useQuery } from "@tanstack/react-query";
import { SetupCard } from "@/features/settings/parts";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useHealth } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Row } from "@/ui/molecules/row";

/**
 * Setup / Logs and feedback: one row each time the findings changed, newest first. Reading it
 * records a snapshot. The page Logs and feedback mounts this part.
 */
export function FindingsOverTime() {
	const { t } = useI18n();
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
					<time dateTime={e.at} className="font-mono text-ui font-normal text-n-11">
						{e.at.replace("T", " ").replace("Z", "")}
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
