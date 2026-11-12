import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { NoProject } from "@/features/shell/no-project";
import { useRuns, useSessions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { runnerName } from "@/ui/atoms/brand-icon";
import { LiveDot } from "@/ui/atoms/live-dot";
import { ShareIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { type CanvasNode, GraphCanvas } from "@/ui/organisms/graph-canvas";
import { ListDetail } from "@/ui/templates/list-detail";
import { nameOf } from "../runs/run-live";

/** Factory / Agents map: agents, tickets, files and refs. A node opens its entity in the inspector (factory REQ-030). */
export function AgentsMap() {
	const { t } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const runs = useRuns();
	const sessions = useSessions();
	const { openRef, selectedRef } = useShell();
	const navigate = useNavigate();
	const copyRef = t.context.copyRef;
	const graph = useMemo(() => {
		const nodes = new Map<string, CanvasNode>();
		const links: [string, string][] = [];
		const live = new Set<string>();
		// A node shows a plain name; its raw ref is its tooltip and the item Copy ref of its menu.
		const add = (n: CanvasNode) =>
			nodes.set(n.id, {
				...n,
				title: n.id,
				menu: [{ id: "copy", label: copyRef, onSelect: () => copyText(n.id) }],
			});
		for (const r of runs.data ?? []) {
			const ticket = `wi:${r.key}`;
			add({ id: ticket, kind: "ticket", label: r.key, name: `${f.ticket} ${r.key}` });
			add({
				id: r.reference,
				kind: "ref",
				label: `${r.key} ${r.title}`,
				name: `${f.ref} ${r.key} ${r.title}`,
			});
			links.push([ticket, r.reference]);
			for (const p of new Set(r.findings.flatMap((x) => (x.path ? [x.path] : [])))) {
				const file = p.split("/").at(-1) ?? p;
				add({ id: `doc:${p}`, kind: "file", label: file, name: `${f.file} ${file}` });
				links.push([ticket, `doc:${p}`]);
			}
		}
		for (const s of sessions.data ?? []) {
			const id = `run:${s.run}/${s.step}`;
			add({
				id,
				kind: "agent",
				label: `${runnerName(s.runner)} ${nameOf(s.step)}`,
				name: `${f.agent} ${runnerName(s.runner)} ${nameOf(s.step)}`,
				status: STEP_STATUS[s.state],
			});
			if (s.state === "running") live.add(id);
			links.push([id, `wi:${s.key}`]);
		}
		return { nodes: [...nodes.values()], links, live };
	}, [runs.data, sessions.data, f, copyRef]);
	const kinds = [
		{ id: "agent", label: f.agent },
		{ id: "ticket", label: f.ticket },
		{ id: "file", label: f.file },
		{ id: "ref", label: f.ref },
	];
	if (active === undefined) return <Loading title={f.agentsMap} icon={<ShareIcon size={16} />} />;
	if (active === null) return <NoProject title={f.agentsMap} icon={<ShareIcon size={16} />} />;
	return (
		<ListDetail
			title={f.agentsMap}
			icon={<ShareIcon size={16} />}
			chips={
				<Badge variant="accent">
					<LiveDot idle={graph.live.size === 0} />
					{graph.live.size} {f.step.running}
				</Badge>
			}
		>
			{/* The map shows the runs that Shipyard starts. With none, it says so and leads to Runs. */}
			{graph.nodes.length === 0 && runs.data && sessions.data ? (
				<div className="p-4">
					<EmptyState
						title={t.empty.runs}
						action={{
							label: f.runs,
							onClick: () => void navigate({ to: "/factory/runs" }),
						}}
					/>
				</div>
			) : (
				<GraphCanvas
					glow
					legend
					live={graph.live}
					nodes={graph.nodes}
					links={graph.links}
					kinds={kinds}
					label={f.graph}
					labels={t.knowledge.canvas}
					selected={selectedRef}
					onOpen={openRef}
				/>
			)}
		</ListDetail>
	);
}
