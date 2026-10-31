import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	type ExternalSource,
	type ExternalState,
	unwrap,
	type WriteReport,
} from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import type { Status } from "@/ui/atoms/status-dot";
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	CheckIcon,
	ShieldCheckIcon,
	SparklesIcon,
} from "@/ui/icons";
import { EntryRow } from "@/ui/molecules/entry-row";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { WriteReportView } from "@/ui/molecules/write-report";

const STATE: Record<ExternalState, Status> = {
	off: "idle",
	current: "success",
	drift: "warning",
	edited: "info",
};
const keys = {
	objectives: ["compass-objectives"] as const,
	external: ["compass-external"] as const,
};

/**
 * The setup of the compass: install the contract, apply an objective (a set of skills, packs and
 * MCP servers that suit the project), and keep the external skill sources up to date. Each write
 * needs a click; a reinstall that replaces edited files asks again.
 */
export function CompassSetup() {
	const { t } = useI18n();
	const x = t.extensions.setup;
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const objectives = useQuery({
		queryKey: keys.objectives,
		queryFn: () => unwrap(commands.compassObjectives()),
	});
	const external = useQuery({
		queryKey: keys.external,
		queryFn: () => unwrap(commands.compassExternal()),
	});
	const [report, setReport] = useState<WriteReport | null>(null);
	const [skipped, setSkipped] = useState<string[]>([]);
	const [confirm, setConfirm] = useState<string | null>(null);

	const write = (job: () => Promise<{ report: WriteReport; skipped?: string[] }>) =>
		run(async () => {
			const out = await job();
			setReport(out.report);
			setSkipped(out.skipped ?? []);
			setConfirm(null);
			for (const k of [["compass"], keys.objectives, keys.external])
				await qc.invalidateQueries({ queryKey: k });
		});
	const reinstall = (s: ExternalSource) =>
		write(() => unwrap(commands.compassExternalReinstall(s.id, true)));
	const sources = external.data ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button onClick={() => void write(() => unwrap(commands.compassContractInstall(true)))}>
					<ShieldCheckIcon size={14} />
					{x.contract}
				</Button>
			</div>
			<ErrorNotice error={failure} />
			{report ? <WriteReportView report={report} /> : null}
			{skipped.length ? (
				<p role="status" className="text-12 text-n-11">
					{format(x.skipped, { names: skipped.join(", ") })}
				</p>
			) : null}
			<Panel
				title={x.objectives}
				count={objectives.data?.length ?? 0}
				icon={<SparklesIcon size={14} />}
				flush
			>
				{(objectives.data ?? []).map((o) => {
					const name = x.objective[o.id] ?? o.id;
					const fit = o.assets.length - o.unavailable.length;
					const complete = fit > 0 && o.on.length >= fit;
					return (
						<SettingsRow key={o.id} label={name}>
							<Badge variant={complete ? "success" : "neutral"}>
								{format(x.objectiveCount, { on: o.on.length, total: o.assets.length })}
							</Badge>
							{complete ? (
								<Badge variant="success">
									<CheckIcon size={12} />
									{x.objectiveDone}
								</Badge>
							) : (
								<Button
									disabled={fit === 0}
									aria-label={format(x.objectiveApply, { name })}
									onClick={() =>
										void write(() => unwrap(commands.compassObjectiveApply(o.id, true)))
									}
								>
									{t.extensions.compass.apply}
								</Button>
							)}
						</SettingsRow>
					);
				})}
			</Panel>
			<Panel
				title={x.external}
				count={sources.length}
				icon={<ArrowDownTrayIcon size={14} />}
				toolbar={
					<Button
						variant="ghost"
						disabled={!sources.some((s) => s.state === "drift")}
						onClick={() => void write(() => unwrap(commands.compassExternalRefresh(true)))}
					>
						<ArrowPathIcon size={14} />
						{x.refresh}
					</Button>
				}
				flush
			>
				<ul>
					{sources.map((s) => (
						<EntryRow
							key={s.id}
							name={s.id}
							status={STATE[s.state]}
							statusLabel={x.externalState[s.state]}
						>
							{s.changed.length ? (
								<Badge variant="warning">{format(x.changed, { count: s.changed.length })}</Badge>
							) : null}
							{s.edited.length ? (
								<Badge variant="info">{format(x.edited, { count: s.edited.length })}</Badge>
							) : null}
							{s.state === "off" ? (
								<Button
									disabled={!s.available}
									aria-label={format(x.installName, { name: s.id })}
									onClick={() => void reinstall(s)}
								>
									{x.install}
								</Button>
							) : confirm === s.id ? (
								<>
									<Button variant="danger" onClick={() => void reinstall(s)}>
										{format(x.reinstallConfirm, { name: s.id })}
									</Button>
									<Button variant="ghost" onClick={() => setConfirm(null)}>
										{x.cancel}
									</Button>
								</>
							) : (
								<Button
									variant="ghost"
									aria-label={format(x.reinstallName, { name: s.id })}
									onClick={() => (s.edited.length ? setConfirm(s.id) : void reinstall(s))}
								>
									{x.reinstall}
								</Button>
							)}
						</EntryRow>
					))}
				</ul>
			</Panel>
		</div>
	);
}
