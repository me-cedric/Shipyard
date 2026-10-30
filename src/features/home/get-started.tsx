import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { projectKeys } from "@/lib/projects";
import { useChanges } from "@/lib/specs";
import { cn } from "@/lib/utils";
import { useTeam } from "@/lib/work";
import { Progress } from "@/ui/atoms/progress";
import { CheckIcon, ChevronRightIcon, SparklesIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

type Place =
	| "/settings/project"
	| "/settings/connections"
	| "/work/team"
	| "/specs/changes"
	| "/factory/runs";
type Step = { id: "tracker" | "forge" | "team" | "spec" | "run"; done: boolean; to: Place };

/**
 * The first steps of a new project, each one done from the real state of the project and one click
 * from its place. The panel goes away when every step is done. There are no page tours: the constitution has none, and Explain answers a
 * question about any entity.
 */
export function GetStarted() {
	const { t } = useI18n();
	const s = t.home.start;
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	}).data;
	// The same cache as Settings / Connections.
	const connections = useQuery({
		queryKey: ["connections", "list"],
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const team = useTeam().data;
	const changes = useChanges().data;
	const runs = useRuns().data;
	if (!(settings && connections && team && changes && runs)) return null;
	const linked = settings.file?.connections ?? {};
	// With no account of the kind, the step opens Connections; with one, the project picks it.
	const place = (group: "tracker" | "forge"): Place =>
		connections.some((c) => c.group === group) ? "/settings/project" : "/settings/connections";
	const steps: Step[] = [
		{ id: "tracker", done: Boolean(linked.tracker), to: place("tracker") },
		{ id: "forge", done: Boolean(linked.forge), to: place("forge") },
		{ id: "team", done: team.team.members.length > 0, to: "/work/team" },
		{ id: "spec", done: changes.length > 0, to: "/specs/changes" },
		{ id: "run", done: runs.length > 0, to: "/factory/runs" },
	];
	const done = steps.filter((x) => x.done).length;
	const next = steps.findIndex((x) => !x.done);
	if (done === steps.length) return null;
	return (
		<Panel
			title={s.title}
			count={done}
			icon={<SparklesIcon size={14} />}
			tone="accent"
			flush
			toolbar={
				<Progress
					value={done}
					max={steps.length}
					label={format(t.count, { name: s.title, count: done })}
					className="w-32"
				/>
			}
			className="mx-4"
		>
			<ol aria-label={s.title} className="grid grid-cols-1 gap-1 p-1.5 md:grid-cols-5">
				{steps.map((step, i) => (
					<li key={step.id}>
						<Link
							to={step.to}
							aria-current={i === next ? "step" : undefined}
							className="group flex h-full items-center gap-2.5 rounded-md p-2 text-ui transition-colors duration-(--duration-fast) hover:bg-n-3"
						>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-11",
									step.done ? "bg-success text-accent-fg" : "border border-n-7 text-n-11",
								)}
							>
								{step.done ? <CheckIcon size={12} /> : i + 1}
							</span>
							<span
								className={cn("min-w-0 flex-1", step.done ? "text-n-10 line-through" : "text-n-12")}
							>
								{s[step.id]}
								{step.done ? <span className="sr-only"> {s.done}</span> : null}
							</span>
							<span aria-hidden="true" className="flex text-n-10 group-hover:text-n-12">
								<ChevronRightIcon size={14} />
							</span>
						</Link>
					</li>
				))}
			</ol>
		</Panel>
	);
}
