import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	DetailColumn,
	LibraryPage,
	LinkedCard,
	LinkedRow,
	ListCard,
	ListColumn,
	PageColumns,
} from "@/features/library/page-parts";
import { WithProject } from "@/features/shell/no-project";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { rememberSelection, useTabSelection } from "@/lib/shell/selection";
import {
	artifactPath,
	type Change,
	capabilityOf,
	openItems,
	useCapabilities,
	useChanges,
	useFile,
	useQuestions,
	useRequirements,
	useSpecsActions,
	useSpecView,
	useTestPlans,
} from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { BookOpenIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { markdown } from "@/ui/molecules/syntax";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { Dialog } from "@/ui/organisms/dialog";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { useGuard } from "./guard";
import { SmallChevron, STATE_TONE, VerdictBadge, worst } from "./parts";

const FILES = ["spec", "plan", "checklist", "tasks"] as const;
type View = "read" | "text" | "files";

/** One spec of the list: a settled one, or one that only a change in progress holds. */
type Spec = {
	capability: string;
	/** The path of its `spec.md`. */
	path: string;
	/** The changes in progress that hold a spec of this name. */
	changes: Change[];
};

/** The settled specs and the specs of the changes in progress, by name. */
function useSpecs() {
	const caps = useCapabilities();
	const changes = useChanges().data ?? [];
	const specs = new Map<string, Spec>();
	for (const c of caps.data ?? [])
		specs.set(c.capability, { capability: c.capability, path: c.path, changes: [] });
	for (const change of changes)
		for (const a of change.artifacts) {
			if (a.artifact !== "spec" || !a.capability || a.status === "missing") continue;
			const spec = specs.get(a.capability) ?? {
				capability: a.capability,
				path: artifactPath(change, a),
				changes: [],
			};
			spec.changes.push(change);
			specs.set(a.capability, spec);
		}
	return {
		list: [...specs.values()].sort((a, b) => a.capability.localeCompare(b.capability)),
		loaded: caps.data !== undefined,
		error: caps.error,
	};
}

/** The tick of a requirement: full when a scenario passes, an empty ring else. */
const Tick = ({ done }: { done: boolean }) => (
	<svg
		aria-hidden="true"
		viewBox="0 0 24 24"
		className={`size-5 shrink-0 fill-none stroke-current stroke-[1.8] ${done ? "text-success-text" : "text-n-10"}`}
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="12" cy="12" r="9" />
		{done ? <path d="M8 12.5l2.5 2.5L16 9.5" /> : null}
	</svg>
);

/** One file of a spec, read only: a page to read. */
function SpecFile({ path, name }: { path: string; name: string }) {
	const text = useFile(path).data?.text ?? "";
	return <MarkdownView source={text} label={name} reading />;
}

/** The open spec: its requirements with their state, its text, or its four files. */
function SpecCard({ spec }: { spec: Spec }) {
	const { t } = useI18n();
	const s = t.specs;
	const p = s.page;
	const { openRef } = useShell();
	const navigate = useNavigate();
	const [view, setView] = useState<View>("read");
	const [file, setFile] = useState<(typeof FILES)[number]>("spec");
	const reqs = useSpecView(spec.path).data?.requirements ?? [];
	const covered = useRequirements().data ?? [];
	const text = useFile(view === "text" ? spec.path : null).data?.text ?? "";
	const change = spec.changes[0];
	return (
		<Card pad className="flex flex-col gap-3.5">
			<div className="flex flex-wrap items-center gap-4">
				<h2 className="mr-auto min-w-0 text-30 font-semibold break-words text-n-12">
					{spec.capability}
				</h2>
				<div className="shrink-0">
					<Segmented
						label={t.editing.view.label}
						value={view}
						onValueChange={setView}
						items={[
							{ value: "read", label: t.knowledge.handbook.read },
							{ value: "text", label: t.editing.view.text },
							{ value: "files", label: s.files },
						]}
					/>
				</div>
				{/* A spec changes through a change: Edit opens the one in progress, or starts one. */}
				<Button
					onClick={() =>
						void (change
							? navigate({
									to: "/flow/feature/$featureId",
									params: { featureId: `change:${change.id}` },
								})
							: navigate({ to: "/flow/new" }))
					}
				>
					{t.knowledge.handbook.edit}
				</Button>
			</div>
			{view === "read" ? (
				<ul aria-label={s.requirements} className="flex flex-col gap-3.5">
					{reqs.map((r) => {
						const ref = `spec:${spec.capability}#${r.id}`;
						const hits = covered.find((c) => c.reference === ref)?.scenarios ?? [];
						const verdict = hits.length ? worst(hits.map((h) => h.verdict)) : null;
						return (
							<li key={r.id}>
								<button
									type="button"
									onClick={() => openRef(ref)}
									className="flex min-h-control w-full cursor-pointer flex-wrap items-center gap-3 rounded-[14px] bg-surface-0 p-4 text-left text-17 text-n-12 hover:bg-n-3"
								>
									<Tick done={verdict === "pass"} />
									<span className="min-w-0 flex-[1_1_240px]">{r.title}</span>
									{verdict === "pass" ? (
										<Badge variant="success">{p.tested}</Badge>
									) : verdict ? (
										<VerdictBadge v={verdict} />
									) : (
										<Badge>{p.noTest}</Badge>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			) : view === "text" ? (
				<CodeEditor
					label={s.artifact.spec}
					value={text}
					readOnly
					highlight={markdown}
					className="min-h-[28rem]"
				/>
			) : (
				<>
					<ViewTabs
						label={s.files}
						value={file}
						onValueChange={setFile}
						tabs={FILES.map((f) => ({ value: f, label: s.artifact[f] }))}
					/>
					<SpecFile
						key={file}
						path={spec.path.replace(/spec\.md$/, `${file}.md`)}
						name={s.artifact[file]}
					/>
				</>
			)}
		</Card>
	);
}

/** The findings of today for one spec: the validation of its changes and the links that no item holds. */
function CheckCard({ spec }: { spec: Spec }) {
	const { t } = useI18n();
	const p = t.specs.page;
	const act = useSpecsActions();
	const { failure, run } = useGuard();
	// The link check runs on a click, as the validation does.
	const links = useQuery({
		queryKey: ["refs", "check"],
		queryFn: () => unwrap(commands.refsCheck()),
		enabled: false,
	});
	const own = `spec:${spec.capability}`;
	const broken = links.data?.filter((b) => b.source === own || b.source.startsWith(`${own}#`));
	const checked = spec.changes.length > 0 && spec.changes.every((c) => c.validated);
	const problems = spec.changes
		.flatMap((c) => c.artifacts)
		.filter((a) => a.capability === spec.capability)
		.reduce((n, a) => n + a.findings.length, 0);
	return (
		<LinkedCard title={p.check}>
			<Row>
				<span className="min-w-0 font-semibold">{p.syntax}</span>
				{!checked ? (
					<Badge className="ml-auto">{p.notChecked}</Badge>
				) : problems ? (
					<Badge variant="you" className="ml-auto">
						{format(p.problems, { count: problems })}
					</Badge>
				) : (
					<Badge variant="success" className="ml-auto">
						{p.noErrors}
					</Badge>
				)}
			</Row>
			<Row>
				<span className="min-w-0 font-semibold">{p.links}</span>
				{!broken ? (
					<Badge className="ml-auto">{p.notChecked}</Badge>
				) : broken.length ? (
					<Badge variant="you" className="ml-auto">
						{format(p.broken, { count: broken.length })}
					</Badge>
				) : (
					<Badge variant="success" className="ml-auto">
						{p.noBroken}
					</Badge>
				)}
			</Row>
			<Row>
				<Button
					onClick={() =>
						void run(async () => {
							for (const c of spec.changes) await act.validate(c.id);
							const r = await links.refetch();
							if (r.error) throw r.error;
						})
					}
				>
					{p.checkRun}
				</Button>
			</Row>
			<ErrorNotice error={failure} className="px-6 pb-3" />
		</LinkedCard>
	);
}

/** The changes in progress of the open spec, and the finished ones to archive. */
function InProgressCard({ changes }: { changes: Change[] }) {
	const { t } = useI18n();
	const s = t.specs;
	const act = useSpecsActions();
	const { error, run } = useGuard();
	// A change that asks first: the open items that its archive refused with.
	const [pending, setPending] = useState<{ id: string; items: string[] } | null>(null);
	const finished = changes.filter((c) => c.artifacts.every((a) => a.status === "done"));
	const archive = (id: string, confirmed: boolean) =>
		run(async () => {
			try {
				await act.archive(id, confirmed);
				setPending(null);
			} catch (e) {
				const items = openItems(e instanceof Error ? e.message : String(e));
				if (!items) throw e;
				setPending({ id, items });
			}
		});
	return (
		<LinkedCard title={s.page.inProgress}>
			{changes.map((c) => (
				<LinkedRow
					key={c.id}
					label={c.title}
					trailing={<SmallChevron />}
					render={(props) => (
						<Link
							to="/flow/feature/$featureId"
							params={{ featureId: `change:${c.id}` }}
							{...props}
						/>
					)}
				/>
			))}
			{finished.length ? (
				<Row>
					<span className="min-w-0 text-n-11">{s.page.finished}</span>
					<RightButton
						right="specs.edit"
						className="ml-auto"
						onClick={() => void archive(finished[0]?.id ?? "", false)}
					>
						{s.archive.open}
					</RightButton>
				</Row>
			) : null}
			<ErrorNotice error={error} className="px-6 pb-3" />
			{pending ? (
				<Dialog
					open
					onOpenChange={(o) => !o && setPending(null)}
					title={s.archive.title}
					actions={
						<RightButton
							right="specs.edit"
							variant="primary"
							onClick={() => void archive(pending.id, true)}
						>
							{s.archive.confirm}
						</RightButton>
					}
				>
					<ul aria-label={s.archive.items} className="flex flex-col gap-1 text-ui">
						{pending.items.map((i) => (
							<li key={i}>{i}</li>
						))}
					</ul>
				</Dialog>
			) : null}
		</LinkedCard>
	);
}

/** The cards under the open spec: its changes in progress, its test plans and questions, the check. */
function SpecLinks({ spec }: { spec: Spec }) {
	const { t } = useI18n();
	const p = t.specs.page;
	const plans = (useTestPlans().data ?? []).filter((pl) =>
		pl.refs.some((r) => capabilityOf(r) === spec.capability),
	);
	const questions = (useQuestions().data ?? []).filter(
		(e) => capabilityOf(e.question.specRef) === spec.capability,
	);
	const state = p.state as Record<string, string>;
	return (
		<>
			{spec.changes.length ? <InProgressCard changes={spec.changes} /> : null}
			{plans.length + questions.length ? (
				<LinkedCard title={p.linked}>
					{plans.map((pl) => (
						<LinkedRow
							key={pl.path}
							label={format(p.testPlan, { name: pl.title })}
							render={(props) => (
								<Link
									to="/library/test-plans"
									onClick={() => rememberSelection("specs:test-plans", pl.path)}
									{...props}
								/>
							)}
						/>
					))}
					{questions.map((e) => (
						<LinkedRow
							key={e.path}
							label={e.question.title}
							trailing={
								<Badge variant={STATE_TONE[e.question.status] ?? "neutral"}>
									{state[e.question.status] ?? e.question.status}
								</Badge>
							}
							render={(props) => <Link to="/library/questions" {...props} />}
						/>
					))}
				</LinkedCard>
			) : null}
			<CheckCard spec={spec} />
		</>
	);
}

/** Library / Specs: the spec list left and the open spec right, in one page. */
export function Capabilities() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.capabilities} icon={null}>
			<SpecsPage />
		</WithProject>
	);
}

function SpecsPage() {
	const { t } = useI18n();
	const s = t.specs;
	const p = s.page;
	const l = t.library;
	const { ask } = useShell();
	const navigate = useNavigate();
	const { list, loaded, error } = useSpecs();
	const [open, setOpen] = useTabSelection(
		"specs:capabilities",
		list.map((c) => c.capability),
	);
	const current = list.find((c) => c.capability === open);
	const questions = useQuestions().data ?? [];
	const waiting = (cap: string) =>
		questions.filter(
			(e) => e.question.status === "open" && capabilityOf(e.question.specRef) === cap,
		).length;
	return (
		<LibraryPage
			title={t.tabs.specs.capabilities}
			className="pt-3"
			action={
				<>
					<Button onClick={() => ask(p.checkCodePrompt)}>{p.checkCode}</Button>
					<Button onClick={() => ask(p.fromCodePrompt)}>{p.fromCode}</Button>
					<RightButton
						right="specs.edit"
						variant="primary"
						onClick={() => void navigate({ to: "/flow/new" })}
					>
						{s.newChange}
					</RightButton>
				</>
			}
			menu={
				current
					? [
							{ label: p.copyRef, onClick: () => void copyText(`spec:${current.capability}`) },
							{ label: p.copyFile, onClick: () => void copyText(current.path) },
						]
					: undefined
			}
		>
			<ErrorNotice error={error} />
			{loaded && list.length === 0 ? (
				<EmptyState
					title={t.empty.capabilities}
					icon={<BookOpenIcon size={28} />}
					action={{
						label: t.tabs.specs.changes,
						onClick: () => void navigate({ to: "/flow/list" }),
					}}
				/>
			) : (
				<PageColumns>
					<ListColumn role="group" aria-label={t.tabs.specs.capabilities}>
						{list.map((c) => {
							const n = waiting(c.capability);
							return (
								<ListCard
									key={c.capability}
									name={c.capability}
									selected={c.capability === open}
									onClick={() => setOpen(c.capability)}
									pills={
										n ? (
											<Badge variant="you">
												{n === 1 ? l.questionsOne : format(l.questionsMany, { count: n })}
											</Badge>
										) : undefined
									}
								/>
							);
						})}
					</ListColumn>
					{current ? (
						<DetailColumn key={current.capability}>
							<SpecCard spec={current} />
							<SpecLinks spec={current} />
						</DetailColumn>
					) : null}
				</PageColumns>
			)}
		</LibraryPage>
	);
}
