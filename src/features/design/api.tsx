import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { featureOfRef } from "@/features/shell/ref-page";
import {
	type Artifact,
	DESIGN_DIR,
	designKeys,
	ofKind,
	slug,
	TEMPLATE,
	useDesignActions,
	useDesignList,
} from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useBacklinks } from "@/lib/refs";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { linkClass } from "@/ui/atoms/link-button";
import { ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { useSides } from "@/ui/molecules/pane-toggle";
import { Row } from "@/ui/molecules/row";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { Dialog } from "@/ui/organisms/dialog";
import { type ApiDoc, type ApiOp, parseOpenApi, type TryRequest } from "@/ui/organisms/openapi";
import { TryPanel } from "@/ui/organisms/try-panel";
import {
	DetailColumn,
	LibraryPage,
	ListCard,
	ListColumn,
	NoMatch,
	PageColumns,
} from "@/ui/templates/library-page";
import { FileFrame, type Frame } from "./frame";
import {
	DesignGate,
	Empty,
	fileName,
	ListNotice,
	TextCard,
	UsedBy,
	useEdit,
	usePage,
} from "./parts";

type Pending = { method: string; server: string; go: () => void; cancel: () => void };

/** One endpoint of one contract. */
type Endpoint = { id: string; a: Artifact; doc: ApiDoc; op: ApiOp };

/**
 * The try panel of one operation. A GET goes out at once. Any other method waits for one click
 * on the dialog that names the server (Q-039, option 1).
 */
/** A slug as words with a capital: `add-export` gives "Add export". */
const words = (slug: string) => {
	const w = slug.replace(/[-_]+/g, " ");
	return w.charAt(0).toUpperCase() + w.slice(1);
};

function Try({ a, op, doc }: { a: Artifact; op: ApiOp; doc: ApiDoc }) {
	const { t } = useI18n();
	const act = useDesignActions();
	const [pending, setPending] = useState<Pending | null>(null);

	const send = (r: TryRequest, server: string) => {
		// The panel joins the server and the path. The command wants them apart.
		const call = () =>
			act.send({
				path: a.path,
				server,
				method: r.method,
				route: r.url.slice(server.replace(/\/$/, "").length),
				body: r.body ?? null,
			});
		if (r.method === "GET") return call();
		return new Promise<Awaited<ReturnType<typeof call>>>((resolve, reject) =>
			setPending({
				method: r.method,
				server,
				go: () => call().then(resolve, reject),
				cancel: () => reject(new Error(t.design.api.cancelled)),
			}),
		);
	};

	return (
		<>
			<TryPanel
				servers={doc.servers}
				method={op.method}
				path={op.path}
				params={op.parameters}
				onSend={send}
				labels={t.design.api}
			/>
			{pending ? (
				<Dialog
					open
					onOpenChange={() => {
						pending.cancel();
						setPending(null);
					}}
					title={format(t.design.api.confirm, { method: pending.method, server: pending.server })}
					actions={
						<Button
							variant="primary"
							onClick={() => {
								pending.go();
								setPending(null);
							}}
						>
							{t.design.api.send}
						</Button>
					}
				>
					<span />
				</Dialog>
			) : null}
		</>
	);
}

/** One endpoint: the method and the path, what it does, its parameters and its answers. */
function EndpointCard({ op, refId }: { op: ApiOp; refId: string }) {
	const { t } = useI18n();
	const l = t.design.api;
	// The changes that cite the contract (`spec:library-functions#REQ-013`).
	const changes = (useBacklinks(refId).data ?? [])
		.filter((g) => g.kind === "change")
		.flatMap((g) => g.items);
	const block = "flex flex-col gap-2 rounded-field bg-n-3 p-4";
	return (
		<Card pad className="flex flex-col gap-3.5">
			<section aria-label={`${op.method} ${op.path}`} className="contents">
				<div className="flex flex-wrap items-center gap-2.5">
					<Badge variant="info">{op.method}</Badge>
					<span className="font-mono text-15 break-all">{op.path}</span>
				</div>
				{op.summary ? <h2 className="text-30 font-semibold">{op.summary}</h2> : null}
				{op.parameters.length ? (
					<ul aria-label={l.parameters} className="flex flex-col gap-2">
						{op.parameters.map((p) => (
							<li
								key={`${p.in}.${p.name}`}
								className="flex flex-wrap items-center gap-3 rounded-field bg-n-3 px-4 py-3"
							>
								<span className="font-mono font-semibold">{p.name}</span>
								<span className="min-w-0 flex-1 text-n-11">{p.description}</span>
								{(p.options ?? []).map((o) => (
									<Badge key={o}>{o}</Badge>
								))}
								{p.required ? <Badge>{l.required}</Badge> : null}
							</li>
						))}
					</ul>
				) : null}
				<section aria-label={l.responses} className={block}>
					<h3 className="text-13 text-n-11">{l.responses}</h3>
					<ul className="flex flex-col gap-2">
						{op.responses.map((r) => (
							<li key={r.status} className="flex flex-wrap items-center gap-3">
								<span className="font-mono font-semibold">{r.status}</span>
								<span className="flex-1">{r.description}</span>
							</li>
						))}
					</ul>
				</section>
				{changes.length ? (
					<ul aria-label={t.design.page.usedBy} className="flex flex-wrap gap-x-4 gap-y-1">
						{changes.map((b) => {
							const to = featureOfRef(b.source);
							return to ? (
								<li key={b.source}>
									<Link {...to} className={cn(linkClass, "min-h-control")}>
										{b.title || words(b.source.slice(b.source.indexOf(":") + 1))}
									</Link>
								</li>
							) : null;
						})}
					</ul>
				) : null}
			</section>
		</Card>
	);
}

/** The side of the open contract: one endpoint with its try panel, or the text of the file. */
function Detail({
	a,
	frame,
	endpoint,
	text,
}: {
	a: Artifact;
	frame: Frame;
	endpoint: Endpoint | undefined;
	text: boolean;
}) {
	const { t } = useI18n();
	const { file, onError } = frame;
	// A contract that does not parse shows its error, with the line when the parser gives one.
	const error = useMemo(() => parseOpenApi(file.text).error ?? null, [file.text]);
	useEffect(() => {
		if (file.ready) onError(error);
	}, [file.ready, error, onError]);
	return (
		<>
			{frame.alerts}
			{text ? (
				<TextCard name={fileName(a.path)} save={frame.save}>
					<CodeEditor
						label={t.design.api.text}
						value={file.text}
						errorLine={frame.error?.line}
						onChange={file.setText}
					/>
				</TextCard>
			) : endpoint ? (
				<>
					<EndpointCard op={endpoint.op} refId={a.reference} />
					<Card pad className="flex flex-col gap-3.5">
						<h2 className="text-17 font-semibold">{t.design.page.tryIt}</h2>
						<Try key={endpoint.id} a={a} op={endpoint.op} doc={endpoint.doc} />
					</Card>
				</>
			) : null}
		</>
	);
}

/**
 * Library / API: the endpoints of the OpenAPI contracts at the left, the open endpoint with its try
 * panel at the right (REQ-011 to REQ-013). "Text" shows the contract file of the open endpoint.
 */
export function Api() {
	const { t } = useI18n();
	const p = t.design.page;
	const title = t.tabs.design.api;
	const list = useDesignList().data;
	const act = useDesignActions();
	const arts = ofKind(list, "api");
	const page = usePage(
		title,
		arts.map((a) => ({ ref: a.reference, title: a.title, issue: a.issue, path: a.path })),
		{
			run: async (name) => {
				const s = slug(name);
				await act.create(`${DESIGN_DIR.api}/${s}.yaml`, TEMPLATE.api(name));
				return `api:${s}`;
			},
		},
		p.newContract,
	);
	// The key is under the list: a save of a contract reads its endpoints again.
	const texts = useQueries({
		queries: arts.map((a) => ({
			queryKey: [...designKeys.list, "api", a.path],
			queryFn: () => unwrap(commands.designRead(a.path)),
			enabled: !a.issue,
		})),
	});
	const endpoints: Endpoint[] = arts.flatMap((a, i) => {
		const doc = parseOpenApi(texts[i]?.data?.text ?? "").doc;
		return doc
			? doc.groups.flatMap((g) =>
					g.ops.map((op) => ({ id: `${a.reference} ${op.method} ${op.path}`, a, doc, op })),
				)
			: [];
	});
	const [query, setQuery] = useState("");
	const [opId, setOpId] = useState<string | null>(null);
	const a = arts.find((x) => x.reference === page.selected);
	const own = endpoints.filter((e) => e.a === a);
	const endpoint = own.find((e) => e.id === opId) ?? own[0];
	const { sides, choose } = useSides("design-api", !!a && a.reference === page.created);
	const { area, edit } = useEdit(() => choose("editor"));
	const q = query.trim().toLowerCase();
	const item = a ? { ref: a.reference, title: a.title, path: a.path } : undefined;
	return (
		<DesignGate title={title}>
			<LibraryPage
				title={title}
				action={
					a ? (
						<>
							<SectionSwitch
								label={t.editing.view.label}
								items={[
									{ id: "preview", label: t.editing.sides.picture, current: !sides.editor },
									{ id: "editor", label: t.editing.view.text, current: sides.editor },
								]}
								onSelect={(id) => choose(id as "preview" | "editor")}
							/>
							<RightButton right="design.edit" onClick={edit}>
								{p.edit}
							</RightButton>
							<Button variant="primary" onClick={() => item && page.askChange(item)}>
								{p.ask}
							</Button>
						</>
					) : undefined
				}
				menu={
					arts.length
						? [{ label: p.newContract, onClick: () => page.add() }, ...page.pageMenu(item)]
						: undefined
				}
			>
				{page.dialogs}
				<ListNotice />
				{arts.length === 0 ? (
					<Empty label={p.newContract} onAdd={() => page.add()} />
				) : (
					<PageColumns>
						<ListColumn className="flex-[2_1_300px]">
							<Input
								label={p.findEndpoint}
								placeholder={p.findEndpoint}
								type="search"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
							{q &&
							!endpoints.some((e) =>
								`${e.op.method} ${e.op.path} ${e.op.summary}`.toLowerCase().includes(q),
							) ? (
								<NoMatch onClear={() => setQuery("")} />
							) : null}
							<ul aria-label={p.endpoints} className="flex flex-col gap-2.5">
								{endpoints
									.filter((e) =>
										`${e.op.method} ${e.op.path} ${e.op.summary}`.toLowerCase().includes(q),
									)
									.map((e) => (
										<li key={e.id}>
											<ListCard
												name={e.op.path}
												pills={
													<Badge variant={e === endpoint ? "info" : "neutral"}>{e.op.method}</Badge>
												}
												selected={e === endpoint}
												// The method comes first, on the line of the path.
												className="flex-row-reverse flex-wrap items-center justify-end font-mono [&>span:first-child]:text-15! [&>span:first-child]:font-normal!"
												onClick={() => {
													setOpId(e.id);
													page.pick(e.a.reference);
												}}
											/>
										</li>
									))}
							</ul>
						</ListColumn>
						<DetailColumn className="flex-[3_1_480px]">
							<div ref={area} className="contents">
								{a ? (
									<FileFrame key={a.path} path={a.path} issue={a.issue}>
										{(frame) => (
											<Detail a={a} frame={frame} endpoint={endpoint} text={sides.editor} />
										)}
									</FileFrame>
								) : null}
							</div>
							<Card className="py-2">
								<ul aria-label={title}>
									{arts.map((x) => (
										<li key={x.reference} className="[&+&]:border-t [&+&]:border-n-6">
											<ContextMenu
												items={page.menuOf({ ref: x.reference, title: x.title, path: x.path })}
											>
												<Row
													render={(r) => (
														<button
															type="button"
															aria-pressed={x === a}
															onClick={() => page.pick(x.reference)}
															{...r}
															className={`${r.className} w-full cursor-pointer text-left`}
														/>
													)}
												>
													<span className="min-w-0 break-all font-mono font-semibold">
														{fileName(x.path)}
														<span className="sr-only">
															{x.title}
															{x.version ? `, ${x.version}` : ""}
														</span>
													</span>
													<span className="ml-auto flex items-center gap-1.5">
														{x.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
														<ChevronRightIcon size={16} />
													</span>
												</Row>
											</ContextMenu>
										</li>
									))}
								</ul>
							</Card>
							{a ? <UsedBy refId={a.reference} /> : null}
						</DetailColumn>
					</PageColumns>
				)}
			</LibraryPage>
		</DesignGate>
	);
}
