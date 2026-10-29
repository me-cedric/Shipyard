import { useMemo } from "react";
import { NoProject } from "@/features/work/no-project";
import { useRuns, useSessions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { EntityGraph, type EntityNode } from "@/ui/organisms/entity-graph";
import { ListDetail } from "@/ui/templates/list-detail";

/** Factory / Agents map: agents, tickets, files and refs. A node opens its entity in the inspector (factory REQ-030). */
export function AgentsMap() {
	const { t } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const runs = useRuns();
	const sessions = useSessions();
	const { openRef } = useShell();
	const graph = useMemo(() => {
		const nodes = new Map<string, EntityNode>();
		const links: [string, string][] = [];
		const add = (n: EntityNode) => nodes.set(n.id, n);
		for (const r of runs.data ?? []) {
			const ticket = `wi:${r.key}`;
			add({ id: ticket, kind: "ticket", label: r.key, name: `${f.ticket} ${r.key}` });
			add({
				id: r.reference,
				kind: "ref",
				label: r.reference.slice(0, 12),
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
			links.push([id, `wi:${s.key}`]);
		}
		return { nodes: [...nodes.values()], links };
	}, [runs.data, sessions.data, f]);
	if (active === null) return <NoProject title={f.agentsMap} />;
	return (
		<ListDetail title={f.agentsMap}>
			<EntityGraph nodes={graph.nodes} links={graph.links} label={f.graph} onOpen={openRef} />
		</ListDetail>
	);
}
