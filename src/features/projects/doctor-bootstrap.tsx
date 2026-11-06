import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { type BootstrapAnswers, commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { Badge } from "@/ui/atoms/badge";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Textarea } from "@/ui/atoms/textarea";
import { ArrowDownTrayIcon, PlusIcon, SparklesIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { toolsKey } from "./doctor-tools";

const STACKS = ["rust", "node", "python", "other"] as const;
const AGENTS = ["claude", "codex"] as const;
const EMPTY: BootstrapAnswers = { name: "", key: "", summary: "", stack: "rust", agent: "claude" };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Settings / Health: set up the tools and the files of a new project in one form. The preview
 * shows each file and whether it is new. One click writes the new files and keeps the others.
 */
export function DoctorBootstrap() {
	const { t } = useI18n();
	const d = t.doctor.bootstrap;
	const qc = useQueryClient();
	const [a, setA] = useState<BootstrapAnswers>(EMPTY);
	const [note, setNote] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// The step in progress, "create" or a tool id: a second click waits for it.
	const [working, setWorking] = useState<string | null>(null);
	const ready = a.name.trim() !== "" && a.key.trim() !== "";
	const plan = useQuery({
		queryKey: ["doctor", "bootstrap", a],
		queryFn: () => unwrap(commands.doctorBootstrapPlan(a)),
		enabled: ready,
		retry: false,
	});
	const create = async () => {
		setError(null);
		setWorking("create");
		try {
			const done = await unwrap(commands.doctorBootstrapApply(a, true));
			setNote(format(d.created, { count: String(done.length) }));
			await qc.invalidateQueries({ queryKey: ["doctor"] });
			await qc.invalidateQueries();
		} catch (e) {
			setError(message(e));
		} finally {
			setWorking(null);
		}
	};
	const install = async (id: string) => {
		setError(null);
		setWorking(id);
		try {
			qc.setQueryData(toolsKey, await unwrap(commands.doctorToolInstall(id, true)));
			await qc.invalidateQueries({ queryKey: ["doctor", "bootstrap"] });
		} catch (e) {
			setError(message(e));
		} finally {
			setWorking(null);
		}
	};
	const set = (patch: Partial<BootstrapAnswers>) => {
		setNote(null);
		setA({ ...a, ...patch });
	};
	const shown = plan.data;
	return (
		<Panel title={d.title} icon={<SparklesIcon size={14} />} tone="accent">
			<div className="flex flex-col gap-3 p-3">
				<div className="flex flex-wrap gap-2">
					<Input
						label={d.name}
						className="w-48"
						value={a.name}
						onChange={(e) => set({ name: e.target.value })}
					/>
					<Input
						label={d.key}
						className="w-28"
						value={a.key}
						onChange={(e) => set({ key: e.target.value.toUpperCase() })}
					/>
					<Select
						label={d.stack}
						value={a.stack}
						items={STACKS.map((v) => ({ value: v, label: d.stacks[v] }))}
						onValueChange={(stack) => set({ stack })}
					/>
					<Select
						label={d.agent}
						value={a.agent}
						items={AGENTS.map((v) => ({
							value: v,
							label: runnerName(v),
							icon: <BrandIcon name={v} size={14} />,
						}))}
						onValueChange={(agent) => set({ agent })}
					/>
				</div>
				<Textarea
					label={d.summary}
					rows={2}
					value={a.summary}
					onChange={(e) => set({ summary: e.target.value })}
				/>
				{shown ? (
					<>
						<section aria-label={d.files} className="flex flex-col rounded-md border">
							{shown.files.map((f) => (
								<details key={f.path} className="border-b px-3 py-1 last:border-b-0">
									<summary className="flex cursor-pointer items-center gap-2 text-ui focus-visible:ring-2">
										<span className="min-w-0 flex-1 truncate font-mono text-12">{f.path}</span>
										<Badge variant={f.state === "new" ? "success" : "neutral"}>
											{f.state === "new" ? d.fileNew : d.fileKept}
										</Badge>
									</summary>
									<pre className="max-h-40 overflow-auto rounded-md bg-n-2 p-2 font-mono text-11">
										{f.content}
									</pre>
								</details>
							))}
						</section>
						<section aria-label={d.tools} className="flex flex-wrap gap-2">
							{shown.tools.map((x) => (
								<span key={x.id} className="flex items-center gap-1 text-ui">
									<StatusDot
										status={x.installed ? "success" : "warning"}
										label={x.installed ? t.settings.tools.installed : t.settings.tools.missing}
										className="size-2"
									/>
									{x.id}
									{!x.installed && x.canInstall ? (
										<RightButton
											right="project.settings"
											variant="secondary"
											busy={working === x.id}
											disabled={working !== null}
											onClick={() => void install(x.id)}
										>
											<ArrowDownTrayIcon size={14} />
											{format(t.settings.tools.install, { name: x.id })}
										</RightButton>
									) : null}
								</span>
							))}
						</section>
					</>
				) : null}
				<div className="flex items-center gap-3">
					<RightButton
						right="project.settings"
						variant="primary"
						busy={working === "create"}
						disabled={!shown?.files.some((f) => f.state === "new") || working !== null}
						onClick={() => void create()}
					>
						<PlusIcon size={14} />
						{d.create}
					</RightButton>
					{note ? (
						<span role="status" className="text-ui text-success-text">
							{note}
						</span>
					) : null}
				</div>
				{error || (ready && plan.error) ? (
					<p role="alert" className="text-ui text-danger-text">
						{error ?? message(plan.error)}
					</p>
				) : null}
			</div>
		</Panel>
	);
}
