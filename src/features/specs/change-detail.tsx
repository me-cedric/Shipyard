import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import {
	type Artifact,
	type ArtifactKind,
	artifactPath,
	type Change,
	type Finding,
	openItems,
	useQuestions,
	useSpecsActions,
	useSpecView,
} from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Progress } from "@/ui/atoms/progress";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ChevronLeftIcon, DocumentTextIcon } from "@/ui/icons";
import { NextStep } from "@/ui/molecules/next-step";
import { RefChip } from "@/ui/molecules/ref-chip";
import { Dialog } from "@/ui/organisms/dialog";
import { FileEditor } from "./file-editor";
import { useGuard } from "./guard";
import { SplitFlow } from "./split";
import { DOT } from "./status";

/** The open markers of a spec. Each one links to its question, or shows unlinked (REQ-007). */
function Markers({ path }: { path: string }) {
	const { t } = useI18n();
	const { openRef } = useShell();
	const view = useSpecView(path).data;
	const known = new Set((useQuestions().data ?? []).map((e) => e.question.id));
	if (!view?.markers.length) return null;
	return (
		<section aria-label={t.specs.markers} className="flex flex-col gap-1">
			<h3 className="text-12 font-medium text-n-11">
				{format(t.count, { name: t.specs.markers, count: view.markers.length })}
			</h3>
			<ul className="flex flex-col gap-1">
				{view.markers.map((m) => (
					<li key={`${m.line}:${m.text}`} className="flex items-center gap-2 text-ui">
						<span className="font-mono text-12 text-n-11">
							{t.specs.editor.line} {m.line}
						</span>
						{m.question ? (
							<RefChip
								refId={`q:${m.question}`}
								state={known.has(m.question) ? "resolved" : "unresolved"}
								onOpen={openRef}
							/>
						) : (
							<Badge variant="warning">{t.specs.unlinked}</Badge>
						)}
						<span className="min-w-0 truncate">{m.text}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

/** The findings of one artifact, each with its line. A click marks the line in the editor. */
function Findings({ list, onPick }: { list: Finding[]; onPick: (line: number | null) => void }) {
	const { t } = useI18n();
	if (list.length === 0) return null;
	return (
		<section aria-label={t.specs.findings}>
			<ul className="flex flex-col">
				{list.map((f) => (
					<li key={`${f.line}:${f.message}`}>
						<button
							type="button"
							onClick={() => onPick(f.line)}
							className="flex min-h-row w-full items-center gap-2 border-b px-1 text-left text-ui"
						>
							<StatusDot status={f.level === "error" ? "danger" : "warning"} />
							{f.line ? (
								<span className="font-mono text-12 text-n-11">
									{t.specs.editor.line} {f.line}
								</span>
							) : null}
							<span className="min-w-0 flex-1 truncate">{f.message}</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

/** One change: its artifacts in the editor, validate, split and archive. */
export function ChangeDetail({ change, onBack }: { change: Change; onBack: () => void }) {
	const { t } = useI18n();
	const s = t.specs;
	const act = useSpecsActions();
	const { error, run } = useGuard();
	const [path, setPath] = useState("proposal.md");
	const [line, setLine] = useState<number | null>(null);
	const [splitting, setSplitting] = useState(false);
	const [pending, setPending] = useState<string[] | null>(null);
	const nameOf = (a: Artifact) => {
		const name = s.artifact[a.artifact as ArtifactKind] ?? a.artifact;
		return a.capability ? `${name} / ${a.capability}` : name;
	};
	const current = change.artifacts.find((a) => a.path === path) ?? change.artifacts[0];

	const archive = (confirmed: boolean) =>
		run(async () => {
			try {
				await act.archive(change.id, confirmed);
				onBack();
			} catch (e) {
				const open = openItems(e instanceof Error ? e.message : String(e));
				if (!open) throw e;
				setPending(open);
			}
		});

	const done = change.artifacts.filter((a) => a.status === "done").length;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-14 items-center gap-3 px-4 pt-3 pb-1">
				<IconButton label={s.back} onClick={onBack}>
					<ChevronLeftIcon size={16} />
				</IconButton>
				<span
					aria-hidden="true"
					className="flex size-8 items-center justify-center rounded-md bg-accent-gradient text-accent-fg shadow-glow"
				>
					<DocumentTextIcon size={16} />
				</span>
				<h1 className="text-20 text-n-12">{change.title}</h1>
				<Progress value={done} max={change.artifacts.length} label={s.artifacts} className="w-32" />
				<span className="font-mono text-12 text-n-11">
					{done}/{change.artifacts.length}
				</span>
			</div>
			<div className="flex min-h-0 flex-1 gap-3 px-4 pt-1 pb-4">
				<nav
					aria-label={s.artifacts}
					className="flex w-60 shrink-0 flex-col gap-0.5 overflow-auto rounded-lg border bg-surface-1 p-1.5 shadow-1"
				>
					{change.artifacts.map((a) => (
						<button
							type="button"
							key={a.path}
							aria-current={a.path === current?.path ? "true" : undefined}
							onClick={() => {
								setPath(a.path);
								setLine(null);
							}}
							className="flex h-row items-center gap-2 rounded-md px-2 text-left text-ui text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-3 aria-[current]:bg-accent-soft"
						>
							<StatusDot status={DOT[a.status]} label={`${nameOf(a)}: ${s.status[a.status]}`} />
							<span className="min-w-0 flex-1 truncate">{nameOf(a)}</span>
							{a.findings.length ? <Badge variant="danger">{a.findings.length}</Badge> : null}
						</button>
					))}
				</nav>
				{current ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto rounded-lg border bg-surface-1 p-3 shadow-1">
						<FileEditor
							key={current.path}
							path={artifactPath(change, current)}
							title={nameOf(current)}
							refId={`change:${change.id}`}
							missing={current.status === "missing"}
							line={line}
							form={current.path.endsWith(".md")}
							actions={
								<>
									<Button onClick={() => void run(() => act.validate(change.id))}>
										{s.validate}
									</Button>
									<NextStep label={t.editing.next.split} onClick={() => setSplitting(true)} />
									<Button onClick={() => void archive(false)}>{s.archive.open}</Button>
								</>
							}
						>
							<Findings list={current.findings} onPick={setLine} />
							{current.artifact === "spec" && current.status !== "missing" ? (
								<Markers path={artifactPath(change, current)} />
							) : null}
						</FileEditor>
						{error ? (
							<p role="alert" className="text-ui text-danger-text">
								{error}
							</p>
						) : null}
					</div>
				) : null}
			</div>
			{splitting ? <SplitFlow change={change.id} onClose={() => setSplitting(false)} /> : null}
			{pending ? (
				<Dialog
					open
					onOpenChange={(o) => !o && setPending(null)}
					title={s.archive.title}
					actions={
						<Button
							variant="primary"
							onClick={() => void archive(true).then(() => setPending(null))}
						>
							{s.archive.confirm}
						</Button>
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
