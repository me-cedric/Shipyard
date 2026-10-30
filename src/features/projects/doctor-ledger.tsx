import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Finding_Serialize, unwrap } from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { ClockIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

/** Settings / Health: one row each time the findings changed, newest first. Reading it records a snapshot. */
export function DoctorLedger({ findings }: { findings: Finding_Serialize[] }) {
	const { t } = useI18n();
	const l = t.settings.ledger;
	// A new set of findings reads the ledger again, and that read records the snapshot.
	const ledger = useQuery({
		queryKey: ["doctor", "ledger", findings.map((f) => f.id).join(",")],
		queryFn: () => unwrap(commands.doctorLedger()),
	});
	const rows = ledger.data ?? [];
	return (
		<Panel title={l.title} count={rows.length} icon={<ClockIcon size={14} />} flush>
			{rows.map((e) => (
				<div
					key={e.at}
					className="flex min-h-9 items-center gap-3 border-b px-3 py-1 last:border-b-0"
				>
					<time dateTime={e.at} className="w-44 font-mono text-12 text-n-11">
						{e.at.replace("T", " ").replace("Z", "")}
					</time>
					<span className="w-12 text-right font-mono text-ui">{e.items.length}</span>
					{e.added > 0 ? (
						<Badge variant="warning">{format(l.added, { count: e.added })}</Badge>
					) : null}
					{e.resolved > 0 ? (
						<Badge variant="success">{format(l.resolved, { count: e.resolved })}</Badge>
					) : null}
				</div>
			))}
		</Panel>
	);
}
