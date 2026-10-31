import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileActionDialog } from "@/features/code/file-actions";
import { useI18n } from "@/lib/i18n";
import {
	capabilityOf,
	KINDS,
	lastLine,
	type Question,
	type QuestionEntry,
	readQuestion,
	STATUSES,
	specsKeys,
	useFile,
	useFoldTargets,
	useSpecsActions,
	useSpecView,
} from "@/lib/specs";
import { useTeam } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { Dialog } from "@/ui/organisms/dialog";
import { useGuard } from "./guard";

const NO_OWNER = "-";
const today = () => new Date().toISOString().slice(0, 10);
const BLANK: Question = {
	id: "",
	kind: "question",
	status: "open",
	raisedAt: "",
	raisedBy: "",
	owner: "",
	specRef: "",
	taskRef: "",
	ticket: "",
	title: "",
	body: "",
};

/**
 * Create or edit a question. Kind and status are menus of the allowed values; the backend still
 * refuses an unknown value and a duplicate id, and the dialog shows why. The title is the name of
 * the question and the text is its body. The answer is the last line of the body, the line that
 * Fold reads: choosing "answered" puts the cursor in its field. The owner comes from the team.
 * A delete asks first and moves the file to the trash.
 */
export function QuestionDialog({
	entry,
	onClose,
	onFold,
}: {
	entry: QuestionEntry | null;
	onClose: () => void;
	onFold: () => void;
}) {
	const { t } = useI18n();
	const s = t.specs.question;
	const act = useSpecsActions();
	const qc = useQueryClient();
	const members = useTeam().data?.team.members ?? [];
	const [deleting, setDeleting] = useState(false);
	const { error, setError, run } = useGuard();
	const file = useFile(entry?.path ?? null);
	// The fields come from the file that the stamp belongs to; the list entry shows until it loads.
	const [edits, setEdits] = useState<Partial<Question>>({});
	const q: Question = {
		...(entry ? (file.data ? readQuestion(file.data.text) : entry.question) : BLANK),
		...edits,
	};
	const set = (patch: Partial<Question>) => setEdits((x) => ({ ...x, ...patch }));
	const field = (label: string, key: "id" | "title" | "specRef") => (
		<Input
			caption
			label={label}
			value={q[key]}
			disabled={key === "id" && !!entry}
			onChange={(e) => set({ [key]: e.target.value })}
		/>
	);
	// A value that the menu does not list stays in it, so a save keeps what the file holds.
	const menu = (label: string, key: "kind" | "status", values: string[]) => (
		<Select
			caption
			label={label}
			value={q[key]}
			onValueChange={(v) => {
				set({ [key]: v });
				if (key === "status" && v === "answered") setFocusAnswer(true);
			}}
			items={(values.includes(q[key]) ? values : [...values, q[key]]).map((v) => ({
				value: v,
				label: v,
			}))}
		/>
	);
	const [focusAnswer, setFocusAnswer] = useState(false);
	const baseBody = entry ? (file.data ? readQuestion(file.data.text) : entry.question).body : "";
	const wasAnswered = entry?.question.status === "answered";
	const [typed, setTyped] = useState<string | null>(null);
	const answer = typed ?? (wasAnswered ? lastLine(baseBody) : "");
	const needsAnswer = q.status === "answered" && answer.trim() === "";
	const withAnswer = (): Question => {
		if (q.status !== "answered" || typed === null) return q;
		const lines = q.body.trimEnd().split("\n");
		if (wasAnswered) lines[lines.length - 1] = typed.trim();
		else lines.push(typed.trim());
		return { ...q, body: `${lines.join("\n")}\n` };
	};
	const save = () =>
		run(async () => {
			const out = withAnswer();
			if (!entry)
				return act.createQuestion({
					...out,
					raisedAt: today(),
					raisedBy: out.raisedBy || out.owner,
				});
			const w = await act.saveQuestion(entry.path, out, file.data?.stamp ?? null);
			if (w.conflict) throw new Error(s.conflict);
		}).then((ok) => ok && onClose());
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={entry ? entry.question.id : s.new}
			actions={
				<Button
					variant="primary"
					disabled={q.title.trim() === "" || needsAnswer || (!!entry && !file.data)}
					onClick={() => {
						setError(null);
						void save();
					}}
				>
					{t.specs.save}
				</Button>
			}
		>
			<div className="grid grid-cols-2 gap-2">
				{field(s.id, "id")}
				{field(s.title, "title")}
				{menu(s.kind, "kind", KINDS)}
				{menu(s.status, "status", STATUSES)}
				<Select
					caption
					label={s.owner}
					value={q.owner || NO_OWNER}
					onValueChange={(v) => set({ owner: v === NO_OWNER ? "" : v })}
					items={[
						{ value: NO_OWNER, label: t.review.question.noOwner },
						// An owner that the team does not list stays in the list, so a save keeps it.
						...(q.owner && !members.some((m) => m.handle === q.owner)
							? [{ value: q.owner, label: q.owner }]
							: []),
						...members.map((m) => ({ value: m.handle ?? "", label: m.name ?? m.handle ?? "" })),
					]}
				/>
				{field(s.specRef, "specRef")}
				<div className="col-span-2">
					<Textarea
						caption
						label={t.review.question.body}
						value={q.body}
						onChange={(e) => set({ body: e.target.value })}
					/>
				</div>
			</div>
			{q.status === "answered" ? (
				<Textarea
					caption
					label={s.answer}
					value={answer}
					autoFocus={focusAnswer}
					onChange={(e) => setTyped(e.target.value)}
				/>
			) : null}
			{entry ? (
				<div className="flex gap-2">
					{entry.question.status === "answered" && entry.question.specRef ? (
						<Button onClick={onFold}>{s.fold}</Button>
					) : null}
					<Button onClick={() => setDeleting(true)}>{t.review.question.delete}</Button>
				</div>
			) : null}
			{entry && deleting ? (
				<FileActionDialog
					action={{ kind: "delete", path: entry.path }}
					onClose={() => setDeleting(false)}
					onDone={() => {
						void qc.invalidateQueries({ queryKey: specsKeys.all });
						onClose();
					}}
				/>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}

/**
 * Fold an answer into its spec. The preview names the marker that the answer replaces and the line
 * that it adds under `### Clarifications`. One click on Fold writes (REQ-015).
 */
export function FoldDialog({ entry, onClose }: { entry: QuestionEntry; onClose: () => void }) {
	const { t } = useI18n();
	const s = t.specs.question;
	const q = entry.question;
	const act = useSpecsActions();
	const { error, run } = useGuard();
	const target = useFoldTargets(q.id, capabilityOf(q.specRef))[0] ?? null;
	const stamp = useFile(target).data?.stamp;
	const markers = (useSpecView(target).data?.markers ?? []).filter((m) => m.question === q.id);
	const [answer, setAnswer] = useState(lastLine(q.body));
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={`${s.fold} ${q.id}`}
			actions={
				<Button
					variant="primary"
					disabled={!target || !stamp || answer.trim() === ""}
					onClick={() =>
						void run(async () => {
							const w = await act.fold(target ?? "", q.id, answer.trim(), stamp ?? "");
							if (w.conflict) throw new Error(s.conflict);
						}).then((ok) => ok && onClose())
					}
				>
					{s.fold}
				</Button>
			}
		>
			<Input caption label={s.answer} value={answer} onChange={(e) => setAnswer(e.target.value)} />
			<section aria-label={s.preview} className="flex flex-col gap-1 font-mono text-12">
				<span className="text-n-11">{target ?? s.noMarker}</span>
				{markers.map((m) => (
					<span key={m.line} className="text-danger-text">
						{`- ${t.specs.editor.line} ${m.line}: [NEEDS CLARIFICATION: ${m.text}]`}
					</span>
				))}
				{answer.trim() && target ? (
					<>
						<span className="text-success-text">{`+ ${answer.trim()}`}</span>
						<span className="text-success-text">{`+ ### Clarifications: - ${q.id} ${q.title}: ${answer.trim()}`}</span>
					</>
				) : null}
			</section>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}
