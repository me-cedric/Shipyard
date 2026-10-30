import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ToolCheck, unwrap } from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowDownTrayIcon, CommandLineIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

const GROUPS = ["base", "forge", "agent", "scanner"] as const;
export const toolsKey = ["doctor", "tools"] as const;

/** Settings / Health: the tools Shipyard works with. A missing tool installs after one click. */
export function DoctorTools() {
	const { t } = useI18n();
	const d = t.settings.tools;
	const qc = useQueryClient();
	const tools = useQuery({ queryKey: toolsKey, queryFn: () => unwrap(commands.doctorTools()) });
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const list = tools.data;
	if (!list) return null;
	const install = async (tool: ToolCheck) => {
		setBusy(tool.id);
		setError(null);
		try {
			qc.setQueryData(toolsKey, await unwrap(commands.doctorToolInstall(tool.id, true)));
			await qc.invalidateQueries({ queryKey: ["doctor", "ledger"] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};
	const missing = list.filter((x) => !x.installed).length;
	return (
		<Panel
			title={d.title}
			count={missing}
			icon={<CommandLineIcon size={14} />}
			tone={missing ? "warning" : "success"}
			flush
		>
			{GROUPS.map((g) => (
				<section key={g} aria-label={d.group[g]}>
					<h3 className="px-3 pt-2 text-12 font-medium text-n-11">{d.group[g]}</h3>
					{list
						.filter((x) => x.group === g)
						.map((x) => (
							<div
								key={x.id}
								className="flex min-h-9 items-center gap-3 border-b px-3 py-1 last:border-b-0"
							>
								<StatusDot
									status={x.installed ? "success" : "warning"}
									label={x.installed ? d.installed : d.missing}
									className="size-2"
								/>
								<span className="w-32 text-ui">{x.id}</span>
								<span className="min-w-0 flex-1 truncate font-mono text-12 text-n-11">
									{x.version}
								</span>
								{x.installed ? null : <Badge variant="warning">{d.missing}</Badge>}
								{!x.installed && x.canInstall ? (
									<Button
										variant="secondary"
										disabled={busy !== null}
										onClick={() => void install(x)}
									>
										<ArrowDownTrayIcon size={14} />
										{format(d.install, { name: x.id })}
									</Button>
								) : null}
							</div>
						))}
				</section>
			))}
			{error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Panel>
	);
}
