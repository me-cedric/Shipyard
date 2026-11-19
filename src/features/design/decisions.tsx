import { type ReactNode, useState } from "react";
import { type Adr, useDesignActions, useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useGraph } from "@/lib/knowledge";
import { RightButton } from "@/lib/rights";
import { Badge } from "@/ui/atoms/badge";
import { Input } from "@/ui/atoms/input";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { markdown } from "@/ui/molecules/syntax";
import { DocForm } from "@/ui/organisms/doc-form";
import { sections } from "@/ui/organisms/doc-parts";
import { DetailColumn, LibraryPage, ListColumn, PageColumns } from "../library/page-parts";
import { FileFrame, type Frame } from "./frame";
import { DesignGate, Empty, ItemList, ListNotice, UsedBy, usePage } from "./parts";

const TONE: Record<string, "success" | "danger"> = { accepted: "success", rejected: "danger" };

/** The MADR status values of the picker. */
const STATUSES = ["proposed", "accepted", "rejected", "deprecated", "superseded"];

/**
 * The answer to a proposed decision (REQ-010): a reason, then Refuse or Accept. Both need the
 * reason: the field is marked as required and both buttons stay off until it has text.
 * `DesignAdrDecision` of the shared parts has the field above the buttons; the design has one row.
 */
function Answer({
	busy,
	onDecide,
}: {
	busy: boolean;
	onDecide: (d: "accept" | "reject", r: string) => void;
}) {
	const { t } = useI18n();
	const p = t.design.page;
	const [reason, setReason] = useState("");
	const r = reason.trim();
	return (
		<div className="flex flex-wrap gap-2.5">
			<div className="min-w-48 flex-1">
				<Input
					label={p.reason}
					placeholder={p.reason}
					aria-required="true"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
				/>
			</div>
			<RightButton right="design.edit" disabled={busy || !r} onClick={() => onDecide("reject", r)}>
				{p.refuse}
			</RightButton>
			<RightButton
				right="design.edit"
				variant="primary"
				disabled={busy || !r}
				onClick={() => onDecide("accept", r)}
			>
				{t.design.decisions.accept}
			</RightButton>
		</div>
	);
}

/**
 * One decision: read-only blocks, one for each section of the file. "Edit" opens the form of the
 * record; "Text" shows the file. A proposed decision sits in the attention card with its answer.
 */
function Decision({ adr, frame }: { adr: Adr; frame: Frame }) {
	const { t } = useI18n();
	const d = t.design.decisions;
	const e = t.editing;
	const { file } = frame;
	const [view, setView] = useState<"form" | "text">("form");
	const [editing, setEditing] = useState(false);
	const body = (
		<>
			<div className="flex flex-wrap items-center gap-2.5">
				<SectionSwitch
					label={e.view.label}
					items={[
						{ id: "form", label: e.view.form, current: view === "form" },
						{ id: "text", label: e.view.text, current: view === "text" },
					]}
					onSelect={(id) => setView(id as typeof view)}
				/>
				<RightButton
					right="design.edit"
					aria-pressed={editing}
					onClick={() => setEditing((v) => !v)}
				>
					{t.design.page.edit}
				</RightButton>
				{editing || view === "text" || file.dirty ? frame.save : null}
			</div>
			{frame.alerts}
			{view === "text" ? (
				<div className="flex min-h-80 flex-col *:flex-1">
					<CodeEditor
						label={d.text}
						value={file.text}
						onChange={file.setText}
						highlight={markdown}
					/>
				</div>
			) : editing ? (
				<DocForm
					text={file.text}
					onChange={file.setText}
					statuses={STATUSES}
					statusLabel={{ ...e.adrStatus, ...d.status }}
					labels={{ ...e.field, form: d.text }}
				/>
			) : (
				sections(file.text).map((s, i) => (
					<section
						// biome-ignore lint/suspicious/noArrayIndexKey: two sections can have the same heading.
						key={`${i}:${s.heading}`}
						aria-label={s.heading}
						className="flex flex-col gap-1.5 rounded-[14px] bg-n-3 p-4 text-17"
					>
						<h3 className="text-13 text-n-11">{s.heading}</h3>
						<p className="whitespace-pre-wrap">{s.body.trim()}</p>
					</section>
				))
			)}
			{adr.status === "proposed" ? (
				<Answer
					// A change that is not saved would be lost: save it first.
					busy={file.dirty}
					onDecide={(decision, reason) =>
						void file.commit(async (s) =>
							unwrap(commands.designAdrDecide(adr.path, decision, reason, s ?? "")),
						)
					}
				/>
			) : null}
		</>
	);
	return adr.status === "proposed" ? (
		<AttentionCard who={t.design.page.waits} title={adr.title}>
			{body}
		</AttentionCard>
	) : (
		<Card pad className="flex flex-col gap-3.5">
			<h2 className="text-20 font-semibold">{adr.title}</h2>
			{body}
		</Card>
	);
}

/**
 * Library / Decisions: the decisions with title and status (REQ-008 to REQ-010). A proposed
 * decision comes first and opens first: it waits for an answer.
 */
export function Decisions() {
	const { t } = useI18n();
	const d = t.design.decisions;
	const p = t.design.page;
	const title = t.tabs.design.decisions;
	const list = useDesignList().data;
	const act = useDesignActions();
	// A decision that no spec cites is unused: the graph knows it as an orphan.
	const unused = new Set((useGraph().data?.nodes ?? []).filter((n) => n.orphan).map((n) => n.ref));
	const [onlyUnused, setOnlyUnused] = useState(false);
	const refOf = (a: Adr) => `adr:${a.number}`;
	const all = list?.adrs ?? [];
	const adrs = [
		...all.filter((a) => a.status === "proposed"),
		...all.filter((a) => a.status !== "proposed"),
	];
	const shown = adrs.filter((a) => !onlyUnused || unused.has(refOf(a)));
	const page = usePage(
		title,
		adrs.map((a) => ({ ref: refOf(a), title: a.title, path: a.path })),
		{ run: async (name) => `adr:${(await act.createAdr(name)).number}` },
		p.newDecision,
		"adr",
	);
	const adr = adrs.find((a) => refOf(a) === page.selected);
	const pills = (ref: string): ReactNode => {
		const a = adrs.find((x) => refOf(x) === ref);
		if (!a) return null;
		return (
			<>
				{a.status === "proposed" ? (
					<Badge variant="you">{p.waits}</Badge>
				) : (
					<Badge variant={TONE[a.status] ?? "neutral"}>{d.status[a.status] ?? a.status}</Badge>
				)}
				{unused.has(ref) ? <Badge>{p.noSpec}</Badge> : null}
			</>
		);
	};
	return (
		<DesignGate title={title}>
			<LibraryPage
				title={title}
				action={
					all.length ? (
						<RightButton right="design.edit" variant="primary" onClick={() => page.add()}>
							{p.newDecision}
						</RightButton>
					) : undefined
				}
				menu={[
					...(all.length
						? [
								{
									label: onlyUnused ? p.allDecisions : p.onlyUnused,
									onClick: () => setOnlyUnused((v) => !v),
								},
							]
						: []),
					...page.pageMenu(page.open),
				]}
			>
				{page.dialogs}
				<ListNotice />
				{all.length === 0 ? (
					<Empty label={p.newDecision} onAdd={() => page.add()} />
				) : (
					<PageColumns>
						<ListColumn className="flex-[2_1_300px]">
							<ItemList
								label={title}
								items={shown.map((a) => ({ ref: refOf(a), title: a.title, path: a.path }))}
								selected={page.selected}
								onPick={page.pick}
								menuOf={page.menuOf}
								pills={(i) => pills(i.ref)}
							/>
						</ListColumn>
						<DetailColumn className="flex-[3_1_480px]">
							{adr ? (
								<FileFrame key={adr.path} path={adr.path}>
									{(frame) => <Decision adr={adr} frame={frame} />}
								</FileFrame>
							) : null}
							{adr ? <UsedBy refId={refOf(adr)} /> : null}
						</DetailColumn>
					</PageColumns>
				)}
			</LibraryPage>
		</DesignGate>
	);
}
