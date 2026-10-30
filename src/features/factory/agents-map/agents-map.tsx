import { useMemo } from "react";
import { NoProject } from "@/features/work/no-project";
import { useRuns, useSessions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { LiveDot } from "@/ui/atoms/live-dot";
import { ShareIcon } from "@/ui/icons";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { type CanvasNode, GraphCanvas } from "@/ui/organisms/graph-canvas";
import { ListDetail } from "@/ui/templates/list-detail";

/** Factory / Agents map: agents, tickets, files and refs. A node opens its entity in the inspector (factory REQ-030). */
export function AgentsMap() {
	const { t } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const runs = useRuns();
	const sessions = useSessions();
	const { openRef, selectedRef } = useShell();
	const graph = useMemo(() => {
		const nodes = new Map<string, CanvasNode>();
		const links: [string, string][] = [];
		const live = new Set<string>();
		const add = (n: CanvasNode) => nodes.set(n.id, n);
		for (const r of runs.data ?? []) {
			const ticket = `wi:${r.key}`;
			add({ id: ticket, kind: "ticket", label: r.key, name: `${f.ticket} ${r.key}` });
			add({
				id: r.reference,
				kind: "ref",
				label: r.reference,
				name: `${f.ref} ${r.reference}`,
			});
			links.push([ticket, r.reference]);
			for (const p of new Set(r.findings.flatMap((x) => (x.path ? [x.path] : [])))) {
				add({ id: `doc:${p}`, kind: "file", label: p, name: `${f.file} ${p}` });
				links.push([ticket, `doc:${p}`]);
			}
		}
		for (const s of sessions.data ?? []) {
			const id = `run:${s.run}/${s.step}`;
			add({
				id,
				kind: "agent",
				label: `${s.runner} ${s.step}`,
				name: `${f.agent} ${s.runner} ${s.step}`,
				status: STEP_STATUS[s.state],
			});
			if (s.state === "running") live.add(id);
			links.push([id, `wi:${s.key}`]);
		}
		return { nodes: [...nodes.values()], links, live };
	}, [runs.data, sessions.data, f]);
	const kinds = [
		{ id: "agent", label: f.agent },
		{ id: "ticket", label: f.ticket },
		{ id: "file", label: f.file },
		{ id: "ref", label: f.ref },
	];
	if (active === null) return <NoProject title={f.agentsMap} />;
	return (
		<ListDetail
			title={f.agentsMap}
			icon={<ShareIcon size={16} />}
			chips={
				<Badge variant="accent">
					<LiveDot />
					{graph.live.size} {f.step.running}
				</Badge>
			}
		>
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
		</ListDetail>
	);
}
