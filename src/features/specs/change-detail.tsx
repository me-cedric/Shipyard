import { useQueries } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import {
	type Artifact,
	type ArtifactKind,
	artifactPath,
	type Change,
	type Finding,
	openItems,
	specsKeys,
	useFile,
	useQuestions,
	useRequirements,
	useSpecsActions,
	useSpecView,
} from "@/lib/specs";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { Segmented } from "@/ui/atoms/segmented";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { RefChip } from "@/ui/molecules/ref-chip";
import { Row } from "@/ui/molecules/row";
import { Dialog } from "@/ui/organisms/dialog";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { FileEditor } from "./file-editor";
import { useGuard } from "./guard";
import { SplitFlow } from "./split";

/** How the open file shows: the sentences to read, the text editor, or the form editor. */
export type FileView = "read" | "text" | "form";

const LABEL = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11";
const TONE = { missing: "you", unchecked: "neutral", draft: "neutral", done: "success" } as const;

/** The file to read: a spec shows one sentence for each requirement, another file shows its text. */
function Reading({ path, title, missing }: { path: string; title: string; missing: boolean }) {
	const { t } = useI18n();
	const text = useFile(missing ? null : path).data?.text;
	const reqs = useSpecView(missing || !path.endsWith("spec.md") ? null : path).data?.requirements;
	if (reqs?.length)
		return (
			<article aria-label={title} className="flex flex-col gap-3 text-17 text-n-12">
				{reqs.map((r) => (
					<p key={r.id}>{r.title}</p>
				))}
			</article>
		);
	if (!text?.trim()) return <p className="text-17 text-n-11">{t.flow.look.brief.noText}</p>;
	return <MarkdownView source={text} label={title} reading />;
}

/**
 * The files of one change, as a page: the switch of the files, Check, Archive and the next step, the
 * file to read or to edit, and the state of each file, the open markers (REQ-007), the requirements
 * with no test and the problems of the last check.
 */
export function ChangeDetail({
	change,
	onBack,
	title,
	file,
	view,
}: {
	change: Change;
	onBack: () => void;
	/** The title of the feature. The title of the change stands in. */
	title?: string;
	/** The kind of the file that opens first, such as `spec`. */
	file?: string;
	view?: FileView;
}) {
	const { t } = useI18n();
	const s = t.specs;
	const b = t.flow.look.brief;
	const act = useSpecsActions();
	const { openRef } = useShell();
	const router = useRouter({ warn: false });
	const { error, run } = useGuard();
	const first = change.artifacts.find((a) => a.artifact === file) ?? change.artifacts[0];
	const [open, setOpen] = useState<{ path: string; view: FileView; line: number | null }>({
		path: first?.path ?? "",
		view: view ?? "read",
		line: null,
	});
	// The editor stays mounted after its first use, so a switch to Read keeps the text that the person typed.
	const [edited, setEdited] = useState(open.view === "read" ? "" : open.path);
	// The last validation: a pass is an empty list, and it shows too.
	const [checked, setChecked] = useState<Finding[] | null>(null);
	const [splitting, setSplitting] = useState(false);
	const [pending, setPending] = useState<string[] | null>(null);
	const show = (path: string, v: FileView, line: number | null = null) => {
		setOpen({ path, view: v, line });
		if (v !== "read") setEdited(path);
	};
	// The capability shows in the name only where a change holds more than one.
	const many = new Set(change.artifacts.map((a) => a.capability).filter(Boolean)).size > 1;
	const nameOf = (a: Artifact) => {
		const name = s.artifact[a.artifact as ArtifactKind] ?? a.artifact;
		return many && a.capability ? `${name} / ${a.capability}` : name;
	};
	const current = change.artifacts.find((a) => a.path === open.path) ?? change.artifacts[0];
	const specs = change.artifacts.filter((a) => a.artifact === "spec" && a.status !== "missing");
	const views = useQueries({
		queries: specs.map((a) => ({
			queryKey: specsKeys.spec(artifactPath(change, a)),
			queryFn: () => unwrap(commands.specsSpec(artifactPath(change, a))),
			retry: false,
		})),
	});
	const known = new Set((useQuestions().data ?? []).map((e) => e.question.id));
	const markers = specs.flatMap((a, i) =>
		(views[i]?.data?.markers ?? []).map((m) => ({ ...m, path: a.path })),
	);
	// A requirement that no scenario cites has no test.
	const rows = useRequirements().data ?? [];
	const bare = specs.flatMap((a, i) =>
		(views[i]?.data?.requirements ?? []).filter(
			(r) => !rows.find((x) => x.reference === `spec:${a.capability}#${r.id}`)?.scenarios.length,
		),
	);
	const found = checked ?? change.artifacts.flatMap((a) => a.findings);

	const archive = (confirmed: boolean) =>
		run(async () => {
			try {
				await act.archive(change.id, confirmed);
				onBack();
			} catch (e) {
				const items = openItems(toFailure(e).details);
				if (!items) throw e;
				setPending(items);
			}
		});

	const done = change.artifacts.filter((a) => a.status === "done").length;
	const filesDone = format(b.filesDone, { done, total: change.artifacts.length });
	const md = !!current?.path.endsWith(".md");
	return (
		<div className="flex flex-col gap-6 px-4 pb-10">
			<div className="flex flex-col">
				<BackLink label={b.back} render={(p) => <button type="button" onClick={onBack} {...p} />} />
				<div className="flex flex-wrap items-center gap-4">
					<h1 className="mr-auto text-44 font-semibold text-n-12">{title ?? change.title}</h1>
					<span className="text-n-11">{filesDone}</span>
					<Progress
						value={done}
						max={change.artifacts.length}
						label={filesDone}
						className="w-35 shrink-0"
					/>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-4">
				{/* The Segmented atom gives each item an equal slot: this switch is as wide as the names of the files. */}
				<fieldset
					aria-label={b.filesOfChange}
					className="m-0 flex w-fit min-w-0 max-w-full flex-wrap rounded-md border-0 bg-n-4 p-1"
				>
					{change.artifacts.map((a) => (
						<button
							key={a.path}
							type="button"
							aria-pressed={a.path === current?.path}
							onClick={() => show(a.path, "read")}
							className={cn(
								"min-h-control cursor-pointer rounded-sm px-3.5 font-medium text-n-10 transition-colors duration-(--duration-fast) hover:text-n-12",
								a.path === current?.path && "bg-surface-2 text-n-12 shadow-1",
							)}
						>
							{nameOf(a)}
						</button>
					))}
				</fieldset>
				<div className="ml-auto flex items-center gap-4">
					<Button
						onClick={() =>
							void run(async () => {
								const list = await act.validate(change.id);
								setChecked(list);
								// The text opens on the first file that has a problem.
								const hit = list.find((f) => f.path);
								if (hit) show(hit.path, "text", hit.line);
							})
						}
					>
						{b.check}
					</Button>
					<Button onClick={() => void archive(false)}>{s.archive.open}</Button>
					<Button variant="primary" onClick={() => setSplitting(true)}>
						{b.nextSplit}
					</Button>
				</div>
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex flex-wrap items-start gap-6">
				{current ? (
					<Card className="flex-[3_1_480px] overflow-hidden">
						<Row>
							<h2 className="font-semibold">{nameOf(current)}</h2>
							<Badge variant={TONE[current.status]}>{s.status[current.status]}</Badge>
							<span className="ml-auto">
								<Segmented
									label={b.view}
									value={open.view}
									onValueChange={(v) => show(current.path, v as FileView)}
									items={[
										{ value: "read", label: b.read },
										...(md ? [{ value: "form", label: t.editing.view.form }] : []),
										{ value: "text", label: b.text },
									]}
								/>
							</span>
						</Row>
						{open.view === "read" ? (
							<div className="border-t border-n-6 px-6 py-5">
								<Reading
									path={artifactPath(change, current)}
									title={nameOf(current)}
									missing={current.status === "missing"}
								/>
							</div>
						) : null}
						{edited === current.path ? (
							<div
								hidden={open.view === "read"}
								className={cn(
									"min-h-112 flex-col border-t border-n-6 px-6 py-5",
									open.view === "read" ? "hidden" : "flex",
								)}
							>
								<FileEditor
									key={current.path}
									path={artifactPath(change, current)}
									title={nameOf(current)}
									refId={`change:${change.id}`}
									missing={current.status === "missing"}
									line={open.line}
									view={open.view === "form" && md ? "form" : "text"}
								/>
							</div>
						) : null}
					</Card>
				) : null}
				<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
					<Card className="py-2">
						<section aria-label={b.stateOfFiles}>
							<h2 className={LABEL}>{b.stateOfFiles}</h2>
							{change.artifacts.map((a) => (
								<Row key={a.path}>
									<span className="font-semibold">{nameOf(a)}</span>
									{a.findings.length ? <Badge variant="danger">{a.findings.length}</Badge> : null}
									<Badge
										variant={TONE[a.status]}
										className="ml-auto"
										role="img"
										aria-label={`${nameOf(a)}: ${s.status[a.status]}`}
									>
										{s.status[a.status]}
									</Badge>
								</Row>
							))}
						</section>
					</Card>
					{markers.length ? (
						<Card className={cn("py-2", ATTENTION_FRAME)}>
							<section aria-label={s.markers}>
								<h2 className={LABEL}>{format(b.markersCount, { count: markers.length })}</h2>
								{markers.map((m) => (
									<Row key={`${m.path}:${m.line}:${m.text}`} className="py-2">
										<span className="min-w-0 flex-[1_1_180px]">{m.text}</span>
										<span className="text-n-11">{format(b.line, { line: m.line })}</span>
										{m.question ? (
											<RefChip
												refId={`q:${m.question}`}
												state={known.has(m.question) ? "resolved" : "unresolved"}
												onOpen={openRef}
											/>
										) : (
											<Badge variant="warning">{s.unlinked}</Badge>
										)}
										<Button onClick={() => show(m.path, "text", m.line)}>{b.goTo}</Button>
									</Row>
								))}
							</section>
						</Card>
					) : null}
					{bare.length ? (
						<Card className="py-2">
							<section aria-label={format(b.noLink, { count: bare.length })}>
								<h2 className={LABEL}>{format(b.noLink, { count: bare.length })}</h2>
								{bare.map((r) => (
									<Row key={r.id}>
										<span className="min-w-0 flex-[1_1_180px]">{r.title}</span>
										<Button onClick={() => void router?.navigate({ to: "/library/test-plans" })}>
											{b.linkIt}
										</Button>
									</Row>
								))}
							</section>
						</Card>
					) : null}
					<Card className="py-2">
						<section aria-label={b.problems} aria-live="polite">
							<h2 className={LABEL}>
								{found.length ? format(b.problemsCount, { count: found.length }) : b.problems}
							</h2>
							{found.length ? (
								found.map((f) => (
									<Row
										key={`${f.path}:${f.line}:${f.message}`}
										render={(p) => (
											<button
												type="button"
												onClick={() => show(f.path, "text", f.line)}
												{...p}
												className={cn(p.className, "text-left")}
											/>
										)}
									>
										<span className="min-w-0 flex-[1_1_180px]">{f.message}</span>
										{f.line ? (
											<span className="text-n-11">{format(b.line, { line: f.line })}</span>
										) : null}
									</Row>
								))
							) : (
								<Row>
									{checked || change.validated ? (
										<>
											<span className="font-semibold">{s.valid}</span>
											<Badge variant="success">{b.checked}</Badge>
										</>
									) : (
										<span className="font-semibold">{s.status.unchecked}</span>
									)}
								</Row>
							)}
						</section>
					</Card>
				</div>
			</div>
			{splitting ? <SplitFlow change={change.id} onClose={() => setSplitting(false)} /> : null}
			{pending ? (
				<Dialog
					open
					onOpenChange={(o) => !o && setPending(null)}
					title={s.archive.title}
					actions={
						<RightButton
							right="specs.edit"
							variant="primary"
							onClick={() => void archive(true).then(() => setPending(null))}
						>
							{s.archive.confirm}
						</RightButton>
					}
				>
					<ul aria-label={s.archive.items} className="flex flex-col gap-1 text-ui">
						{pending.map((i) => (
							<li key={i}>{i}</li>
						))}
					</ul>
				</Dialog>
			) : null}
		</div>
	);
}
