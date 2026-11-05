import { useMemo, useState } from "react";
import { NoProject } from "@/features/work/no-project";
import { useI18n } from "@/lib/i18n";
import { useCodeGraph, useGraph, useGraphFocus, useIndexCode } from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { ArrowPathIcon, ShareIcon, XMarkIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { PageHeader } from "@/ui/molecules/page-header";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { type CanvasNode, GraphCanvas, KindMark } from "@/ui/organisms/graph-canvas";
import { ListDetail } from "@/ui/templates/list-detail";
import { boxOf, cellOf, clusterView, forceLayout, type GNode, isCluster } from "./graph-clusters";

type Source = "refs" | "code";

/**
 * Knowledge / Graph: the reference graph or the code graph on one renderer. A click opens the
 * entity in the inspector. The graph edits nothing (REQ-001 to REQ-007).
 */
export function Graph() {
	const { t } = useI18n();
	const k = t.knowledge;
	const active = useActiveProject().data;
	const { openRef, selectedRef } = useShell();
	const [source, setSource] = useState<Source>("refs");
	const [query, setQuery] = useState("");
	const [hidden, setHidden] = useState<string[]>([]);
	const [focus, setFocus] = useGraphFocus();
	const refs = useGraph().data;
	const code = useCodeGraph().data;
	const index = useIndexCode();

	const kindNames = t.refKind as Record<string, string>;
	const kindName = (id: string) => kindNames[id] ?? id;
	const all = useMemo(() => {
		if (source === "code")
			return {
				nodes: (code?.nodes ?? []).map(
					(n): CanvasNode => ({
						id: n.ref,
						kind: n.kind,
						label: n.title,
						name: `${n.kind === "file" ? k.graph.file : k.graph.symbol} ${n.title}`,
					}),
				),
				edges: (code?.edges ?? []).map((e): [string, string] => [e.source, e.target]),
			};
		return {
			nodes: (refs?.nodes ?? []).map(
				(n): CanvasNode => ({
					id: n.ref,
					kind: n.kind,
					// The title reads; the ref stays in the accessible name and the inspector.
					label: n.title || n.ref,
					name: `${kindNames[n.kind] ?? n.kind} ${n.ref}, ${n.title}`,
					orphan: n.orphan,
					stale: n.stale,
				}),
			),
			edges: (refs?.edges ?? []).map((e): [string, string] => [e.source, e.target]),
		};
	}, [source, refs, code, k, kindNames]);

	const [open, setOpen] = useState<string[]>([]);
	const clustered = source === "refs" && !focus;
	const kinds = useMemo(() => {
		const count = new Map<string, number>();
		for (const n of all.nodes) count.set(n.kind, (count.get(n.kind) ?? 0) + 1);
		return [...count].map(([id, n]) => ({ id, n }));
	}, [all.nodes]);

	const shown = useMemo(() => {
		const near = new Set<string>();
		if (focus && source === "refs") {
			near.add(focus);
			for (const [a, b] of all.edges) {
				if (a === focus) near.add(b);
				if (b === focus) near.add(a);
			}
		}
		const q = query.trim().toLowerCase();
		const nodes = all.nodes.filter(
			(n) =>
				!hidden.includes(n.kind) &&
				(!focus || source === "code" || near.has(n.id)) &&
				(!q || n.name.toLowerCase().includes(q)),
		);
		return { nodes, edges: all.edges };
	}, [all, hidden, focus, query, source]);

	// Clusters first: a cluster draws as one node, and opens in place on a click or Enter.
	const drawn = useMemo(() => {
		if (!clustered || !refs) return null;
		const raw: GNode[] = refs.nodes.map((n) => ({
			ref: n.ref,
			kind: n.kind,
			title: n.title || n.ref,
			location: n.location,
		}));
		const keep = new Set(shown.nodes.map((n) => n.id));
		const q = query.trim();
		const kindName = (id: string) => kindNames[id] ?? id;
		const view = clusterView(
			raw,
			raw.filter((n) => keep.has(n.ref)),
			all.edges,
			open,
			q,
		);
		const byId = new Map(shown.nodes.map((n) => [n.id, n]));
		const boxes = view.clusters.map((c) => boxOf(c.id, c.members.length, view.open.has(c.id)));
		const place = forceLayout(boxes, view.links);
		const positions = new Map<string, { x: number; y: number }>();
		const nodes: CanvasNode[] = [];
		const table: CanvasNode[] = [];
		for (const c of view.clusters) {
			const isOpen = view.open.has(c.id);
			const at = place.get(c.id) ?? { x: 0, y: 0 };
			const lead = c.members.find((m) => m.ref === `${c.kind}:${c.key}`)?.title;
			const title = c.key ? lead || c.key : kindName(c.kind);
			const head: CanvasNode = {
				id: c.id,
				kind: c.kind,
				label: title,
				name: `${c.key ? `${kindName(c.kind)} ${title}` : title} ${c.members.length}`,
				count: c.members.length,
				open: isOpen,
			};
			positions.set(c.id, at);
			nodes.push(head);
			table.push(head);
			c.members.forEach((m, i) => {
				const n = byId.get(m.ref);
				if (!n) return;
				table.push(n);
				if (!isOpen) return;
				const cell = cellOf(i, c.members.length);
				positions.set(m.ref, { x: at.x + cell.x, y: at.y + cell.y });
				nodes.push(q ? { ...n, match: true } : n);
			});
		}
		return { nodes, table, positions, links: view.links };
	}, [clustered, refs, shown.nodes, all.edges, open, query, kindNames]);

	if (active === undefined)
		return <PageHeader icon={<ShareIcon size={16} />} title={k.graph.title} />;
	if (active === null) return <NoProject title={k.graph.title} />;
	const wantsIndex = source === "code" && code !== undefined && code.state !== "ready";
	return (
		<ListDetail
			title={k.graph.title}
			icon={<ShareIcon size={16} />}
			count={shown.nodes.length}
			chips={
				<ViewTabs<Source>
					label={k.graph.source}
					value={source}
					onValueChange={setSource}
					tabs={[
						{ value: "refs", label: k.graph.refs },
						{ value: "code", label: k.graph.code },
					]}
				/>
			}
			toolbar={
				<>
					{wantsIndex ? null : (
						<FilterBar
							query={query}
							onQueryChange={setQuery}
							filters={kinds.map((x, i) => ({
								id: x.id,
								label: `${kindName(x.id)} ${x.n}`,
								icon: <KindMark index={i} />,
							}))}
							active={kinds.map((x) => x.id).filter((id) => !hidden.includes(id))}
							onToggle={(id) =>
								setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))
							}
						/>
					)}
					{focus && source === "refs" ? (
						<Button variant="ghost" onClick={() => setFocus(null)}>
							<XMarkIcon size={14} />
							{k.graph.clear}
						</Button>
					) : null}
				</>
			}
		>
			{index.error ? <ErrorNotice error={index.error} className="px-3 py-1" /> : null}
			{wantsIndex ? (
				<div className="p-4">
					<EmptyState
						title={t.empty.graph}
						action={{
							label: k.graph.index,
							icon: <ArrowPathIcon size={14} />,
							busy: index.isPending,
							onClick: () => index.mutate(),
						}}
					/>
				</div>
			) : (
				<GraphCanvas
					nodes={drawn?.nodes ?? shown.nodes}
					links={drawn?.links ?? shown.edges}
					positions={drawn?.positions}
					tableNodes={drawn?.table}
					kinds={kinds.map((x) => ({ id: x.id, label: kindName(x.id) }))}
					label={k.graph.title}
					labels={k.canvas}
					glow
					selected={selectedRef}
					onOpen={(id) =>
						isCluster(id)
							? setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))
							: openRef(source === "code" ? `code:${id}` : id)
					}
				/>
			)}
		</ListDetail>
	);
}
