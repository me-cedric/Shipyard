import { useState } from "react";
import { OpenInEditor } from "@/features/code/open-in-editor";
import { DetailColumn, LinkedCard, PageColumns, SideCards } from "@/features/library/page-parts";
import { format, useI18n } from "@/lib/i18n";
import type { CodeGraph_Serialize, KGraph_Serialize } from "@/lib/ipc";
import { useCodeFocus } from "@/lib/knowledge";
import { copyText } from "@/lib/menus";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";
import { folderClusters } from "./graph-clusters";

/** The chips of a group before "N more". */
const FIRST = 5;
const GROUP = "flex flex-col gap-3.5 rounded-[24px] bg-n-4 p-5";
const WHITE = "bg-surface-2";
const LINKED = "outline-2 outline-accent";

/** The map of the knowledge: one light card for each kind, and the card of the chosen item beside. */
export function KnowledgeMap({
	graph,
	focus,
}: {
	graph: KGraph_Serialize;
	/** The item that "Open in the map" asked for. */
	focus: string | null;
}) {
	const { t } = useI18n();
	const k = t.knowledge;
	const { openRef, explain } = useShell();
	const kindNames = t.refKind as Record<string, string>;
	const [picked, setPicked] = useState<string | null>(null);
	const [only, setOnly] = useState<"orphan" | "stale" | null>(null);
	const [open, setOpen] = useState<string[]>([]);
	const nodes = only ? graph.nodes.filter((n) => n[only]) : graph.nodes;
	const groups = new Map<string, typeof nodes>();
	for (const n of nodes) groups.set(n.kind, [...(groups.get(n.kind) ?? []), n]);
	const want = picked ?? focus;
	const chosen = nodes.find((n) => n.ref === want) ?? nodes[0];
	const linked = chosen
		? graph.edges.flatMap((e) =>
				e.source === chosen.ref ? [e.target] : e.target === chosen.ref ? [e.source] : [],
			)
		: [];
	const near = [...new Set(linked)].flatMap((ref) => graph.nodes.find((n) => n.ref === ref) ?? []);
	const flags = (["orphan", "stale"] as const).filter((f) => graph.nodes.some((n) => n[f]));
	return (
		<>
			{flags.length ? (
				<fieldset aria-label={k.graph.only} className="m-0 flex flex-wrap gap-2 border-0 p-0">
					{flags.map((f) => (
						<Chip
							key={f}
							selected={only === f}
							className={only === f ? undefined : WHITE}
							onClick={() => setOnly(only === f ? null : f)}
						>
							{k.graph[f]}
						</Chip>
					))}
				</fieldset>
			) : null}
			<PageColumns>
				<DetailColumn className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-4">
					{[...groups].map(([kind, members]) => {
						const name = kindNames[kind] ?? kind;
						const all = open.includes(kind) || members.length <= FIRST + 1;
						// The chosen item always shows, also past the first chips.
						const shown = all
							? members
							: members.filter((m, i) => i < FIRST || m.ref === chosen?.ref);
						return (
							<section key={kind} data-map-group aria-label={name} className={GROUP}>
								<h2 className="text-17 font-semibold text-n-12">{name}</h2>
								<div className="flex flex-wrap gap-2">
									{shown.map((m) => (
										<Chip
											key={m.ref}
											selected={m.ref === chosen?.ref}
											className={cn(
												"max-w-full text-left",
												m.ref === chosen?.ref ? undefined : WHITE,
												near.includes(m) && LINKED,
											)}
											onClick={() => setPicked(m.ref)}
										>
											<span className="truncate">{m.title || m.ref}</span>
										</Chip>
									))}
									{all ? null : (
										<Chip
											className={WHITE}
											aria-expanded={false}
											aria-label={`${name}: ${format(k.graph.more, { count: members.length - shown.length })}`}
											onClick={() => setOpen([...open, kind])}
										>
											{format(k.graph.more, { count: members.length - shown.length })}
										</Chip>
									)}
								</div>
							</section>
						);
					})}
				</DetailColumn>
				{chosen ? (
					<SideCards className="flex-[2_1_300px]">
						<Card pad className="flex flex-col gap-3.5">
							<section aria-label={k.graph.chosen} className="flex flex-col gap-3.5">
								<Badge variant="accent" className="self-start">
									{kindNames[chosen.kind] ?? chosen.kind}
								</Badge>
								<h2 className="break-words text-30 font-semibold text-n-12">
									{chosen.title || chosen.ref}
								</h2>
								<div className="flex flex-wrap gap-2.5">
									<Button variant="primary" onClick={() => openRef(chosen.ref)}>
										{k.graph.open}
									</Button>
									<Button onClick={() => explain(chosen.ref)}>{k.explain}</Button>
								</div>
							</section>
						</Card>
						{near.length ? (
							<LinkedCard title={k.graph.linked}>
								{near.map((n) => (
									<Row
										key={n.ref}
										render={(p) => <button type="button" onClick={() => setPicked(n.ref)} {...p} />}
									>
										<Badge>{kindNames[n.kind] ?? n.kind}</Badge>
										<span className="min-w-0 text-left font-semibold">{n.title || n.ref}</span>
									</Row>
								))}
							</LinkedCard>
						) : null}
						<Card pad className="flex flex-wrap items-center gap-3">
							<span className="mr-auto min-w-0 break-all font-mono text-14">{chosen.ref}</span>
							<Button onClick={() => void copyText(chosen.ref)}>{k.graph.copy}</Button>
						</Card>
					</SideCards>
				) : null}
			</PageColumns>
		</>
	);
}

const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The map of the code: the open folder with its files, the symbols of the chosen file as chips,
 * the other folders as tiles, and the card of the chosen symbol with its callers and callees.
 */
export function CodeMap({
	graph,
	file,
	onFile,
}: {
	graph: CodeGraph_Serialize;
	/** The file whose symbols show. */
	file: string | null;
	onFile: (file: string | null) => void;
}) {
	const k = useI18n().t.knowledge;
	const { openRef, explain } = useShell();
	const [folder, setFolder] = useState<string | null>(null);
	const [symbol, setSymbol] = useState<string | null>(null);
	const folders = folderClusters(graph.nodes);
	const at =
		folders.find((f) => f.key === folder) ??
		folders.find((f) => f.members.some((m) => m.ref === file)) ??
		folders[0];
	// The first file of the open folder shows when none is chosen: the detail column is never empty.
	const current = file ?? at?.members[0]?.ref ?? null;
	const focus = useCodeFocus(current).data;
	const symbols = (focus?.nodes ?? []).filter((n) => n.kind === "symbol");
	const chosen =
		symbols.find((n) => n.ref === symbol) ??
		(symbol ? undefined : symbols.find((n) => n.location === current));
	const pick = (id: string) => {
		const home = symbols.find((n) => n.ref === id)?.location;
		if (home && home !== current) onFile(home);
		setSymbol(id);
	};
	/** The symbols on the other end of the calls of the chosen symbol. */
	const ends = (from: "source" | "target", to: "source" | "target") =>
		(focus?.edges ?? [])
			.filter((e) => e[from] === chosen?.ref)
			.flatMap((e) => symbols.find((n) => n.ref === e[to]) ?? []);
	const calls = (title: string, list: typeof symbols) =>
		list.length ? (
			<LinkedCard title={title}>
				{list.map((n) => (
					<Row
						key={n.ref}
						render={(p) => <button type="button" onClick={() => pick(n.ref)} {...p} />}
					>
						<span className="min-w-0 font-mono text-14 font-semibold">{n.title}</span>
						<span className="ml-auto min-w-0 break-all font-mono text-14 text-n-10">
							{n.location}
						</span>
					</Row>
				))}
			</LinkedCard>
		) : null;
	const target = chosen ?? graph.nodes.find((n) => n.ref === current);
	return (
		<PageColumns>
			<DetailColumn>
				{at ? (
					<section aria-label={at.key} className={GROUP}>
						<h2 className="text-17 font-semibold text-n-12">{at.key}</h2>
						<div className="flex flex-wrap items-start gap-3">
							{at.members.map((m) =>
								m.ref === current ? (
									<Card key={m.ref} className="flex flex-[1_1_240px] flex-col gap-2.5 p-4">
										<span className="break-all font-mono text-14 font-semibold">{m.ref}</span>
										<fieldset
											aria-label={`${k.graph.symbol}: ${base(m.ref)}`}
											className="m-0 flex flex-wrap gap-2 border-0 p-0"
										>
											{symbols
												.filter((n) => n.location === current)
												.map((n) => (
													<Chip
														key={n.ref}
														selected={n.ref === chosen?.ref}
														className="font-mono text-14"
														onClick={() => setSymbol(n.ref)}
													>
														{n.title}
													</Chip>
												))}
										</fieldset>
									</Card>
								) : (
									<Chip
										key={m.ref}
										className={cn(WHITE, "font-mono text-14")}
										aria-label={`${k.graph.file} ${m.ref}`}
										onClick={() => {
											setSymbol(null);
											onFile(m.ref);
										}}
									>
										{base(m.ref)}
									</Chip>
								),
							)}
						</div>
					</section>
				) : null}
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3.5">
					{folders
						.filter((f) => f !== at)
						.map((f) => (
							<button
								key={f.id}
								type="button"
								aria-label={`${k.graph.folder} ${f.key}`}
								className="flex min-h-control cursor-pointer flex-col gap-3 rounded-lg bg-n-4 p-4.5 text-left text-n-12"
								onClick={() => {
									setFolder(f.key);
									setSymbol(null);
									onFile(null);
								}}
							>
								<span className="break-all text-17 font-semibold">{f.key}</span>
								<span className="text-n-10">
									{format(k.graph.files, { count: f.members.length })}
								</span>
							</button>
						))}
				</div>
			</DetailColumn>
			{target ? (
				<SideCards className="flex-[2_1_300px]">
					<Card pad>
						<section aria-label={k.graph.chosen} className="flex flex-col gap-3.5">
							<Badge variant="accent" className="self-start">
								{chosen ? k.graph.symbol : k.graph.file}
							</Badge>
							<h2 className="break-all font-mono text-30 font-semibold text-n-12">
								{chosen ? chosen.title : base(target.ref)}
							</h2>
							<span className="break-all font-mono text-14 text-n-10">{target.location}</span>
							<div className="flex flex-wrap gap-2.5">
								<Button variant="primary" onClick={() => explain(`code:${target.ref}`)}>
									{k.explain}
								</Button>
								<Button onClick={() => openRef(`code:${target.ref}`)}>{k.graph.open}</Button>
								{target.location ? <OpenInEditor path={target.location} /> : null}
							</div>
						</section>
					</Card>
					{chosen ? calls(k.graph.callers, ends("target", "source")) : null}
					{chosen ? calls(k.graph.callees, ends("source", "target")) : null}
				</SideCards>
			) : null}
		</PageColumns>
	);
}
