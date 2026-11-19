import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import {
	type Artifact,
	type Brick,
	bricksPath,
	bricksText,
	DESIGN_DIR,
	ofKind,
	parseBricks,
	parseFlows,
	slug,
	TEMPLATE,
	useDesignActions,
	useDesignFile,
	useDesignList,
} from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { commands, type FlowRow_Deserialize, unwrap } from "@/lib/ipc";
import { RightButton, RightIconButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { linkClass } from "@/ui/atoms/link-button";
import { PlusIcon, TrashIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { type FlowDraft, type FlowError, FlowMatrix } from "@/ui/organisms/flow-matrix";
import type { FlowField } from "@/ui/organisms/flow-rows";
import { LibraryPage, LinkedCard, LinkedRow, PageColumns, SideCards } from "../library/page-parts";
import { FileFrame, type Frame } from "./frame";
import { DesignGate, Empty, fileName, ListNotice, TextCard, usePage } from "./parts";

// The fields that a row must hold. The port is the only optional one (REQ-018).
const REQUIRED: FlowField[] = ["source", "destination", "network", "protocol", "action"];

const toApi = (id: number, d: FlowDraft): FlowRow_Deserialize => ({
	id,
	source: d.source.trim(),
	destination: d.destination.trim(),
	network: d.network.trim(),
	protocol: d.protocol.trim(),
	port: d.port.trim() || null,
	action: d.action as "allow" | "deny",
	name: d.name?.trim() || null,
	subnet: d.subnet?.trim() || null,
	sourceName: d.sourceName?.trim() || null,
	destinationName: d.destinationName?.trim() || null,
});

/** The bricks of the network, one file beside the flows. A name is kept once, and a rename follows into the flows. */
function Bricks({
	path,
	file,
	bricks,
	onRename,
}: {
	path: string;
	file: ReturnType<typeof useDesignFile>;
	bricks: Brick[];
	onRename: (from: string, to: string) => void;
}) {
	const { t } = useI18n();
	const f = t.design.flows;
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const taken = (n: string, except?: string) =>
		bricks.some((b) => b.id !== except && b.name.trim().toLowerCase() === n.trim().toLowerCase());
	const save = (next: Brick[]) =>
		file.commit(async (stamp) =>
			unwrap(commands.designWrite(path, bricksText(next), stamp, stamp === null)),
		);
	return (
		<div className="flex flex-col gap-2">
			<form
				className="flex items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const n = name.trim();
					if (!n) return;
					if (taken(n)) return setError(f.brickTaken);
					setError(null);
					setName("");
					void save([
						...bricks,
						{ id: `brick-${Date.now().toString(36)}`, name: n, description: "" },
					]);
				}}
			>
				<Input label={f.brickName} value={name} onChange={(e) => setName(e.target.value)} />
				<RightButton right="design.edit" type="submit" disabled={!name.trim()}>
					<PlusIcon size={14} />
					{f.brickAdd}
				</RightButton>
			</form>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<ul aria-label={f.bricksTab} className="flex flex-col divide-y">
				{bricks.map((b) => (
					<li key={b.id} className="flex items-center gap-2 py-1">
						<BrickField
							label={f.brickName}
							value={b.name}
							onSave={(v) => {
								if (!v.trim() || v.trim() === b.name) return;
								if (taken(v, b.id)) return setError(f.brickTaken);
								setError(null);
								void save(bricks.map((x) => (x.id === b.id ? { ...x, name: v.trim() } : x))).then(
									(ok) => ok && onRename(b.name, v.trim()),
								);
							}}
						/>
						<BrickField
							label={f.brickDescription}
							value={b.description}
							onSave={(v) =>
								void save(bricks.map((x) => (x.id === b.id ? { ...x, description: v } : x)))
							}
						/>
						<RightIconButton
							right="design.edit"
							label={format(f.brickRemove, { name: b.name })}
							onClick={() => void save(bricks.filter((x) => x.id !== b.id))}
						>
							<TrashIcon size={14} />
						</RightIconButton>
					</li>
				))}
			</ul>
		</div>
	);
}

/** A text field that saves when it loses focus. */
function BrickField({
	label,
	value,
	onSave,
}: {
	label: string;
	value: string;
	onSave: (value: string) => void;
}) {
	const [v, setV] = useState(value);
	useEffect(() => setV(value), [value]);
	return (
		<Input
			label={`${label} ${value}`.trim()}
			value={v}
			onChange={(e) => setV(e.target.value)}
			onBlur={() => v !== value && onSave(v)}
		/>
	);
}

/** The rows and the bricks of one flow table, with the save and the checks of a row. */
function useTable(a: Artifact, file: ReturnType<typeof useDesignFile>) {
	const { t } = useI18n();
	const f = t.design.flows;
	const [error, setError] = useState<FlowError | null>(null);
	const { rows, error: bad } = useMemo(() => parseFlows(file.saved), [file.saved]);
	const bricksFile = bricksPath(a.path);
	// A project with no bricks file yet starts empty. The first brick creates the file.
	const brickDoc = useDesignFile(bricksFile, bricksText([]));
	const bricks = useMemo(() => parseBricks(brickDoc.saved), [brickDoc.saved]);
	const save = (next: FlowRow_Deserialize[]) =>
		file.commit(async (stamp) => unwrap(commands.designFlowsSave(a.path, next, stamp)));
	return {
		rows,
		bad,
		bricks,
		bricksFile,
		brickDoc,
		error,
		save,
		// Rejects a row with a missing field and names it. `false` keeps the editor open.
		check: (id: string, d: FlowDraft) => {
			const field = REQUIRED.find((k) => !d[k]?.trim());
			setError(field ? { id, field, message: f.missing } : null);
			return !field;
		},
		// A renamed brick keeps its flows: each flow that named it follows.
		rename: (from: string, to: string) => {
			const follow = (n: string | null | undefined) => (n === from ? to : n);
			if (rows.some((r) => r.sourceName === from || r.destinationName === from))
				void save(
					rows.map((r) => ({
						...r,
						sourceName: follow(r.sourceName),
						destinationName: follow(r.destinationName),
					})),
				);
		},
	};
}

/** The flow tables of the project and the open one. Both pages share the choice. */
function useTables() {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const arts = ofKind(list, "flow");
	const page = usePage(
		t.tabs.design.flows,
		arts.map((a) => ({ ref: a.reference, title: a.title, issue: a.issue, path: a.path })),
		{
			run: async (name) => {
				const s = slug(name);
				await act.create(`${DESIGN_DIR.flow}/${s}.yaml`, TEMPLATE.flow);
				return `flow:${s}`;
			},
		},
		t.design.page.newTable,
	);
	const a = arts.find((x) => x.reference === page.selected);
	// One table is the usual case: the chips show only when there is a choice.
	const chips =
		arts.length > 1 ? (
			<fieldset
				aria-label={t.design.page.files}
				className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
			>
				{arts.map((x) => (
					<ContextMenu
						key={x.reference}
						items={page.menuOf({ ref: x.reference, title: x.title, path: x.path })}
					>
						<Chip selected={x.reference === page.selected} onClick={() => page.pick(x.reference)}>
							{x.title}
							{x.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
						</Chip>
					</ContextMenu>
				))}
			</fieldset>
		) : null;
	return { page, a, chips };
}

/** The name of an end of a flow: its brick, else its address. */
const ends = (r: {
	sourceName?: string;
	source: string;
	destinationName?: string;
	destination: string;
}) => [r.sourceName || r.source, r.destinationName || r.destination] as const;

function List({
	a,
	frame,
	page,
	chips,
}: {
	a: Artifact;
	frame: Frame;
	page: ReturnType<typeof usePage>;
	chips: ReactNode;
}) {
	const { t } = useI18n();
	const f = t.design.flows;
	const p = t.design.page;
	const title = t.tabs.design.flows;
	const router = useRouter({ warn: false });
	const table = useTable(a, frame.file);
	const [view, setView] = useState<"flows" | "bricks">("flows");
	const [text, setText] = useState(false);
	const { rows } = table;
	const froms = [...new Set(rows.map((r) => ends(r)[0]))].slice(0, 4);
	const tos = [...new Set(rows.map((r) => ends(r)[1]))].slice(0, 3);
	const item = { ref: a.reference, title: a.title, path: a.path };
	return (
		<LibraryPage
			title={title}
			action={
				<>
					<SectionSwitch
						label={f.views}
						items={[
							{ id: "flows", label: p.flows, current: view === "flows" },
							{ id: "bricks", label: f.bricksTab, current: view === "bricks" },
						]}
						onSelect={(id) => setView(id as typeof view)}
					/>
					<RightButton right="design.edit" aria-pressed={text} onClick={() => setText((v) => !v)}>
						{p.editText}
					</RightButton>
					<RightButton
						right="design.edit"
						variant="primary"
						onClick={() => void router?.navigate({ to: "/library/flows/matrix", hash: "add" })}
					>
						{p.addFlow}
					</RightButton>
				</>
			}
			menu={[{ label: p.newTable, onClick: () => page.add() }, ...page.pageMenu(item)]}
		>
			{page.dialogs}
			{chips}
			<ListNotice />
			{frame.alerts}
			<PageColumns>
				{text ? (
					<TextCard name={fileName(a.path)} save={frame.save}>
						<CodeEditor label={p.flowsText} value={frame.file.text} onChange={frame.file.setText} />
					</TextCard>
				) : view === "bricks" ? (
					<Card pad className="flex-[3_1_520px]">
						<Bricks
							path={table.bricksFile}
							file={table.brickDoc}
							bricks={table.bricks}
							onRename={table.rename}
						/>
					</Card>
				) : (
					<Card className="flex-[3_1_520px] overflow-x-auto px-6 py-2">
						<table className="w-full min-w-[640px] border-collapse text-left">
							<thead>
								<tr>
									<th scope="col" className="h-11 text-13 font-normal text-n-11">
										{p.flowFrom}
									</th>
									<td className="w-10" />
									<th scope="col" className="h-11 text-13 font-normal text-n-11">
										{p.flowTo}
									</th>
									<td className="w-10" />
									<th scope="col" className="h-11 text-13 font-normal text-n-11">
										{p.why}
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => {
									const [from, to] = ends(r);
									return (
										<tr key={r.id} className="border-t border-n-6">
											<td className="w-[28%] py-2.5">
												<span className="flex min-h-control items-center rounded-md bg-n-3 px-3.5 font-semibold">
													{from}
												</span>
											</td>
											<td aria-hidden="true" className="px-0">
												<span className="block h-0.5 bg-accent" />
											</td>
											<td className="w-[28%] py-2.5">
												<span
													className={cn(
														"flex min-h-control items-center rounded-md bg-n-3 px-3.5 font-semibold",
														// An address, not a name.
														!r.destinationName && "font-mono",
													)}
												>
													{to}
												</span>
											</td>
											<td aria-hidden="true" className="px-0">
												<span className="block h-0.5 bg-accent" />
											</td>
											<td className="py-2.5">
												{r.note || r.name || [r.protocol, r.port].filter(Boolean).join(" ")}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</Card>
				)}
				<SideCards className="flex-[2_1_300px]">
					<Card pad className="flex flex-col gap-3.5">
						<h2 className="text-13 font-semibold text-n-11">{p.bricksHosts}</h2>
						<div
							role="img"
							aria-label={format(p.matrixOf, { bricks: froms.length, hosts: tos.length })}
							className="grid items-center gap-1.5"
							style={{ gridTemplateColumns: `110px repeat(${tos.length || 1}, minmax(0, 1fr))` }}
						>
							<span />
							{tos.map((h) => (
								<span key={h} title={h} className="truncate font-mono text-12 text-n-11">
									{h}
								</span>
							))}
							{froms.map((b) => [
								<span key={b} className="truncate font-semibold">
									{b}
								</span>,
								...tos.map((h) => (
									<i
										key={`${b}>${h}`}
										className={cn(
											"block h-8 rounded-sm",
											rows.some((r) => ends(r)[0] === b && ends(r)[1] === h)
												? "bg-accent"
												: "bg-n-3",
										)}
									/>
								)),
							])}
						</div>
						<Link to="/library/flows/matrix" className={cn(linkClass, "min-h-control self-start")}>
							{p.openMatrix}
						</Link>
					</Card>
					<LinkedCard title={p.linked}>
						<LinkedRow
							label={t.tabs.design.architecture}
							render={(x) => <Link to="/library/architecture" {...x} />}
						/>
						<LinkedRow label={p.connections} render={(x) => <Link to="/setup/computer" {...x} />} />
					</LinkedCard>
				</SideCards>
			</PageColumns>
		</LibraryPage>
	);
}

/**
 * Library / Network flows: the flows as a plain list From / To / Why, the bricks, and the way to
 * the full matrix (REQ-016 to REQ-018). "Edit as text" shows the file.
 */
export function Flows() {
	const { t } = useI18n();
	const title = t.tabs.design.flows;
	const { page, a, chips } = useTables();
	return (
		<DesignGate title={title}>
			{a ? (
				<FileFrame key={a.path} path={a.path} issue={a.issue}>
					{(frame) => <List a={a} frame={frame} page={page} chips={chips} />}
				</FileFrame>
			) : (
				<LibraryPage title={title}>
					{page.dialogs}
					<ListNotice />
					<Empty label={t.design.page.newTable} onAdd={() => page.add()} />
				</LibraryPage>
			)}
		</DesignGate>
	);
}

function Matrix({ a, frame, signal }: { a: Artifact; frame: Frame; signal: number }) {
	const { t } = useI18n();
	const f = t.design.flows;
	const p = t.design.page;
	const { rows, bad, bricks, error, save, check } = useTable(a, frame.file);
	if (bad) return null;
	return (
		<FlowMatrix
			addSignal={signal}
			chipLabels={{ allow: p.allowed, deny: p.denied }}
			rows={rows.map((r) => ({
				id: String(r.id),
				source: r.source,
				destination: r.destination,
				network: r.network,
				protocol: r.protocol,
				port: r.port ?? "",
				action: r.action,
				name: r.name ?? "",
				subnet: r.subnet ?? "",
				sourceName: r.sourceName ?? "",
				destinationName: r.destinationName ?? "",
			}))}
			bricks={bricks.map((b) => b.name).filter(Boolean)}
			actions={[
				{ value: "allow", label: f.allow },
				{ value: "deny", label: f.deny },
			]}
			error={error}
			labels={{
				...f,
				add: p.addFlow,
				search: p.findHost,
				from: p.flowFrom,
				to: p.flowTo,
				zone: p.zone,
				allowed: p.allowed,
				show: p.show,
				rowMenu: p.rowMenu,
			}}
			onAdd={(d) => {
				if (!check("", d)) return false;
				void save([...rows, toApi(Math.max(0, ...rows.map((r) => r.id)) + 1, d)]);
			}}
			onEdit={(id, d) => {
				if (!check(id, d)) return false;
				void save(rows.map((r) => (String(r.id) === id ? { ...r, ...toApi(r.id, d) } : r)));
			}}
			onRemove={(id) => void save(rows.filter((r) => String(r.id) !== id))}
		/>
	);
}

/**
 * Library / Flow matrix (`/library/flows/matrix`): the full table of the open flow table, with the
 * filters and the edits of a row. The hash "add" in the address opens the editor of a new flow.
 */
export function FlowMatrixPage() {
	const { t } = useI18n();
	const { page, a, chips } = useTables();
	const hashAdd = useRouterState({ select: (s) => s.location.hash === "add" });
	// The hash "add" opens the editor once; the menu item opens it again.
	const [adds, setAdds] = useState(0);
	const signal = adds + (hashAdd ? 1 : 0);
	return (
		<DesignGate title={t.design.page.matrix}>
			<LibraryPage
				title={t.design.page.matrix}
				back={
					<BackLink
						label={t.tabs.design.flows}
						render={(x) => <Link to="/library/flows" {...x} />}
					/>
				}
				action={a ? <PageExport page="flows" /> : undefined}
				menu={
					a ? [{ label: t.design.page.addFlow, onClick: () => setAdds((n) => n + 1) }] : undefined
				}
			>
				{page.dialogs}
				{chips}
				<ListNotice />
				{a ? (
					<FileFrame key={a.path} path={a.path} issue={a.issue} readOnly>
						{(frame) => (
							<>
								{frame.alerts}
								<Matrix a={a} frame={frame} signal={signal} />
							</>
						)}
					</FileFrame>
				) : null}
			</LibraryPage>
		</DesignGate>
	);
}
