import { type ReactNode, useState } from "react";
import { Badge } from "../atoms/badge";
import { BrandIcon } from "../atoms/brand-icon";
import { Button } from "../atoms/button";
import { CountUp } from "../atoms/count-up";
import { Caption, Input } from "../atoms/input";
import { Leave } from "../atoms/leave";
import { Tooltip, TooltipProvider } from "../atoms/tooltip";
import { CheckIcon, Cog6ToothIcon, HomeIcon } from "../icons";
import { ApprovalBar } from "../molecules/approval-bar";
import { BackLink } from "../molecules/back-link";
import { CodeLine } from "../molecules/code-editor";
import { DiffFileList } from "../molecules/diff-file-list";
import { EntryRow } from "../molecules/entry-row";
import { NextStep } from "../molecules/next-step";
import { EditorPreview, SideSwitch } from "../molecules/pane-toggle";
import { QuestionCard } from "../molecules/question-card";
import { RunStep } from "../molecules/run-step";
import { SectionNav } from "../molecules/section-nav";
import { SettingLink } from "../molecules/setting-link";
import { Column, Columns, SetupCard, SetupRow } from "../molecules/setup-card";
import { StatePill, Toggle, ValueButton } from "../molecules/setup-controls";
import { SetupPills } from "../molecules/setup-pills";
import { SplitPane } from "../molecules/split-pane";
import { Splitter } from "../molecules/splitter";
import { Stepper } from "../molecules/stepper";
import { Term, Terms } from "../molecules/term";
import { Assignee, CategoryDot, PriorityGlyph } from "../molecules/ticket-row";
import { WriteReportView } from "../molecules/write-report";
import { DocForm } from "../organisms/doc-form";
import { FileViewer } from "../organisms/file-viewer";
import { GraphCanvas, KindMark } from "../organisms/graph-canvas";
import { Link as MarkdownLink } from "../organisms/markdown-view";
import { RunGraph } from "../organisms/run-graph";
import { SlideDeck } from "../organisms/slide-deck";
import { TileCard } from "../organisms/tile-card";
import { TileChart } from "../organisms/tile-chart";
import { ZoomFrame } from "../organisms/zoom-frame";
import {
	BackClaimContext,
	DetailColumn,
	LibraryPage,
	LinkedCard,
	LinkedRow,
	ListCard,
	ListColumn,
	NoMatch,
	PageColumns,
	SideCards,
} from "../templates/library-page";

// The demo texts are English literals: the gallery is a developer page, not a product screen.

/** One named row of a layer page. */
export function Row({ name, children }: { name: string; children: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-3 border-b py-3">
			<h2 className="w-32 font-mono text-11 text-n-10">{name}</h2>
			{children}
		</div>
	);
}

const noop = () => {};
const PATCH = "@@ -1,2 +1,2 @@\n keep\n-old line\n+new line\n";
const CHART_NAMES = {
	number: "Number",
	bars: "Bars",
	line: "Line",
	list: "List",
	stages: "Stages",
	spend: "Spend",
	health: "Health",
};
const TILE_LABELS = {
	table: "Table",
	chart: "Chart",
	pin: "Pin",
	unpin: "Unpin",
	cut: "Cut",
	empty: "No rows",
	more: "More",
	charts: CHART_NAMES,
};
const TILE_ROWS = [
	["Open", "4"],
	["Done", "9"],
];
const KINDS = [
	{ id: "adr", label: "ADR" },
	{ id: "spec", label: "Spec" },
];
const NODES = [
	{ id: "adr:1", kind: "adr", label: "adr:1", name: "ADR adr:1" },
	{ id: "spec:a", kind: "spec", label: "spec:a", name: "Spec spec:a" },
];
const CANVAS_LABELS = {
	table: "Table view",
	name: "Name",
	kind: "Kind",
	links: "Links",
	orphan: "Orphan",
	stale: "Stale",
};
const DOC =
	"# Use SQLite\n\nstatus: accepted\ndeciders: Ada\n\n## Context\n\nOne file per project.\n";

export function SharedAtoms() {
	return (
		<>
			<Row name="BrandIcon">
				<BrandIcon name="github" label="GitHub" />
				<BrandIcon name="unknown" size={20} label="Unknown" />
			</Row>
			<Row name="CountUp">
				<CountUp value={1234} className="text-20" />
			</Row>
			<Row name="Leave">
				<Leave>A row that fades out when it leaves</Leave>
			</Row>
			<Row name="Tooltip">
				<TooltipProvider>
					<Tooltip label="Open" shortcut="⌘O">
						<Button>Hover me</Button>
					</Tooltip>
				</TooltipProvider>
			</Row>
			<Row name="Caption">
				<Caption label="Branch">
					<Input label="Branch" className="w-48" />
				</Caption>
			</Row>
		</>
	);
}

export function SharedMolecules() {
	const [open, setOpen] = useState<ReadonlySet<string>>(new Set(["a.ts"]));
	const [sides, setSides] = useState({ editor: false, preview: true });
	const [width, setWidth] = useState(200);
	const [count, setCount] = useState(2);
	const [on, setOn] = useState(true);
	return (
		<>
			<Row name="ApprovalBar">
				<div className="w-full">
					<ApprovalBar
						approval={{
							kind: "comment",
							key: "SHP-12",
							title: "Add sessions",
							summary: "Post a comment on SHP-12",
							detail: "Ready for review.",
							force: false,
						}}
						onApprove={noop}
						onReject={noop}
					/>
				</div>
			</Row>
			<Row name="QuestionCard">
				<div className="w-full">
					<QuestionCard
						question={{
							id: "Q-001",
							question: "Which store do we use?",
							options: ["SQLite", "Postgres"],
							recommended: 1,
							free_text: true,
							spec: null,
							state: "open",
							answer: null,
							unclear: null,
							edited: false,
						}}
						onAnswer={noop}
					/>
				</div>
			</Row>
			<Row name="DiffFileList">
				<div className="w-full">
					<DiffFileList
						files={[
							{ path: "a.ts", state: "modified", patch: PATCH, comments: 1 },
							{ path: "b.ts", state: "added", patch: null },
						]}
						expanded={open}
						onToggle={(p) =>
							setOpen((s) => {
								const next = new Set(s);
								if (!next.delete(p)) next.add(p);
								return next;
							})
						}
					/>
				</div>
			</Row>
			<Row name="EntryRow">
				<ul className="w-full">
					<EntryRow name="lint" status="success" statusLabel="Ready" onOpen={noop}>
						<Badge>2 files</Badge>
					</EntryRow>
				</ul>
			</Row>
			<Row name="NextStep">
				<NextStep label="Start the run" onClick={noop} />
			</Row>
			<Row name="RunStep">
				<RunStep id="build" state="running" />
				<RunStep id="review" name="Review" state="gate" />
				<RunStep id="each" state="done" units={3} />
			</Row>
			<Row name="SectionNav">
				<div className="w-full">
					<SectionNav
						label="Sections"
						items={[
							{ id: "a", label: "Home", icon: <HomeIcon size={14} /> },
							{ id: "b", label: "Settings", icon: <Cog6ToothIcon size={14} /> },
						]}
					/>
				</div>
			</Row>
			<Row name="SettingLink">
				<SettingLink target="/setup/computer">Open the setting</SettingLink>
			</Row>
			<Row name="SetupCard">
				<div className="w-full">
					<Columns>
						<Column>
							<SetupCard title="Agents" action={<ValueButton>Claude</ValueButton>}>
								<SetupRow label="At once">
									<Stepper label="At once" value={count} min={1} max={5} onValueChange={setCount} />
								</SetupRow>
								<SetupRow label="Automatic">
									<Toggle label="Automatic" checked={on} onCheckedChange={setOn} />
								</SetupRow>
							</SetupCard>
						</Column>
						<Column>
							<SetupCard title="State">
								<StatePill state="ready" />
								<StatePill state="fix">To fix</StatePill>
								<StatePill state="off" />
							</SetupCard>
						</Column>
					</Columns>
				</div>
			</Row>
			<Row name="SetupPills">
				<SetupPills
					label="Setup"
					items={[
						{ id: "a", label: "Computer", href: "/setup/computer", current: true },
						{ id: "b", label: "Project", href: "/setup/project" },
					]}
				/>
			</Row>
			<Row name="Term, Terms">
				<Term id="agent">agent</Term>
				<Terms>An agent works on one ticket.</Terms>
			</Row>
			<Row name="Ticket parts">
				<CategoryDot category="in-progress" label="In progress" />
				<Assignee name="Ada Lovelace" />
				<PriorityGlyph level={1} label="High" />
			</Row>
			<Row name="WriteReportView">
				<WriteReportView report={{ written: ["a.md"], kept: ["b.md"] }} />
			</Row>
			<Row name="CodeLine">
				<CodeLine text="const a = 1;" lang="ts" />
			</Row>
			<Row name="SideSwitch">
				<SideSwitch
					sides={sides}
					choose={(c) => setSides({ editor: c !== "preview", preview: c !== "editor" })}
				/>
			</Row>
			<Row name="EditorPreview">
				<div className="flex h-24 w-full">
					<EditorPreview
						id="gallery-editor-preview"
						label="Resize"
						editor={<div className="border p-2">Text</div>}
						preview={<div className="min-w-0 flex-1 border p-2">Picture</div>}
					/>
				</div>
			</Row>
			<Row name="SplitPane">
				<div className="flex h-16 w-full gap-3">
					<SplitPane id="gallery-split" label="Resize pane" fallback={160}>
						<div className="border p-2">Left</div>
					</SplitPane>
					<div className="flex-1 border p-2">Right</div>
				</div>
			</Row>
			<Row name="Splitter">
				<div className="relative h-16 w-8">
					<Splitter
						label="Resize"
						value={width}
						min={100}
						max={400}
						onChange={(size) => setWidth(size)}
						onReset={() => setWidth(200)}
					/>
				</div>
			</Row>
		</>
	);
}

export function SharedOrganisms() {
	const [doc, setDoc] = useState(DOC);
	return (
		<>
			<Row name="TileCard">
				<div className="w-80">
					<TileCard
						title="Work"
						data={{ columns: ["Status", "Count"], rows: TILE_ROWS, cut: false, off: null }}
						offText="Off"
						labels={TILE_LABELS}
					/>
				</div>
			</Row>
			<Row name="TileChart">
				<div className="w-80">
					<TileChart
						chart="bars"
						title="Work"
						rows={TILE_ROWS}
						names={CHART_NAMES}
						barsName="Work by status"
					/>
				</div>
			</Row>
			<Row name="RunGraph">
				<RunGraph
					label="Run steps"
					className="h-40 w-full"
					steps={[
						{ id: "plan", needs: [], state: "done" },
						{ id: "build", needs: ["plan"], state: "running" },
						{ id: "review", needs: ["build"], state: "pending" },
					]}
				/>
			</Row>
			<Row name="GraphCanvas, KindMark">
				<GraphCanvas
					nodes={NODES}
					links={[["spec:a", "adr:1"]]}
					kinds={KINDS}
					label="Graph"
					labels={CANVAS_LABELS}
					onOpen={noop}
				/>
				<KindMark index={0} label="ADR" />
			</Row>
			<Row name="SlideDeck">
				<div className="h-48 w-full">
					<SlideDeck
						slides={["# One", "# Two"]}
						style={{ background: "#fff", text: "#111", accent: "#06c", font: "sans-serif" }}
						label="Deck"
						slideLabel={(n) => `Slide ${n}`}
					/>
				</div>
			</Row>
			<Row name="ZoomFrame">
				<ZoomFrame label="Picture" className="h-32 w-64">
					<div className="p-4">A picture</div>
				</ZoomFrame>
			</Row>
			<Row name="FileViewer">
				<div className="h-24 w-full">
					<FileViewer
						label="File"
						text={"const a = 1;\nconst b = 2;\n"}
						line={2}
						path="a.ts"
						binaryLabel="Binary file"
					/>
				</div>
			</Row>
			<Row name="DocForm">
				<div className="w-full">
					<DocForm
						text={doc}
						onChange={setDoc}
						statuses={["proposed", "accepted"]}
						labels={{ form: "Document", title: "Title", status: "Status", people: "People" }}
					/>
				</div>
			</Row>
			<Row name="Markdown Link">
				<MarkdownLink url="https://example.com">A link</MarkdownLink>
			</Row>
		</>
	);
}

export function SharedTemplates() {
	return (
		<BackClaimContext value={() => noop}>
			<LibraryPage
				title="Library page"
				count={2}
				back={<BackLink label="Back" render={(p) => <a href="#top" {...p} />} />}
			>
				<PageColumns>
					<ListColumn>
						<ListCard name="First item" selected pills={<Badge>open</Badge>} />
						<ListCard name="Second item" />
						<NoMatch onClear={noop} />
					</ListColumn>
					<DetailColumn>
						<LinkedCard title="Linked">
							<LinkedRow label="spec:auth" render={(p) => <a href="#top" {...p} />} />
						</LinkedCard>
					</DetailColumn>
					<SideCards>
						<LinkedCard title="Used by">
							<LinkedRow
								label="wi:KEY-1"
								leading={<CheckIcon size={14} />}
								render={(p) => <a href="#top" {...p} />}
							/>
						</LinkedCard>
					</SideCards>
				</PageColumns>
			</LibraryPage>
		</BackClaimContext>
	);
}
