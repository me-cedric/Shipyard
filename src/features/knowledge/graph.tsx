import { useMemo, useState } from "react";
import { NoProject } from "@/features/work/no-project";
import { useI18n } from "@/lib/i18n";
import { message, useCodeGraph, useGraph, useGraphFocus, useIndexCode } from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { ArrowPathIcon, ShareIcon, XMarkIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { type CanvasNode, GraphCanvas, KindMark } from "@/ui/organisms/graph-canvas";
import { ListDetail } from "@/ui/templates/list-detail";

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

	if (active === undefined) return null;
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
			{index.error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{message(index.error)}
				</p>
			) : null}
			{wantsIndex ? (
				<div className="p-4">
					<EmptyState
						action={{
							label: k.graph.index,
							icon: <ArrowPathIcon size={14} />,
							onClick: () => index.mutate(),
						}}
					/>
				</div>
			) : (
				<GraphCanvas
					nodes={shown.nodes}
					links={shown.edges}
					kinds={kinds.map((x) => ({ id: x.id, label: kindName(x.id) }))}
					label={k.graph.title}
					labels={k.canvas}
					glow
					selected={selectedRef}
					onOpen={(id) => openRef(source === "code" ? `code:${id}` : id)}
				/>
			)}
		</ListDetail>
	);
}
