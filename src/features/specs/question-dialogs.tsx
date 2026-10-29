import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
	capabilityOf,
	KINDS,
	lastLine,
	type Question,
	type QuestionEntry,
	STATUSES,
	useFile,
	useFoldTargets,
	useSpecsActions,
	useSpecView,
} from "@/lib/specs";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Dialog } from "@/ui/organisms/dialog";
import { useGuard } from "./guard";

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
 * Create or edit a question. Kind and status take free text with the allowed values as hints: the
 * backend refuses an unknown kind, an unknown status and a duplicate id, and the dialog shows why.
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
	const { error, setError, run } = useGuard();
	const file = useFile(entry?.path ?? null);
	const [q, setQ] = useState<Question>(entry?.question ?? BLANK);
	const set = (patch: Partial<Question>) => setQ((x) => ({ ...x, ...patch }));
	const field = (label: string, key: "id" | "title" | "kind" | "status" | "owner" | "specRef") => (
		<Input
			caption
			label={label}
			value={q[key]}
			disabled={key === "id" && !!entry}
			list={key === "kind" ? "q-kinds" : key === "status" ? "q-statuses" : undefined}
			onChange={(e) => set({ [key]: e.target.value })}
		/>
	);
	const save = () =>
		run(async () => {
			if (!entry)
				return act.createQuestion({ ...q, raisedAt: today(), raisedBy: q.raisedBy || q.owner });
			const w = await act.saveQuestion(entry.path, q, file.data?.stamp ?? null);
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
					disabled={q.title.trim() === "" || (!!entry && !file.data)}
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
				{field(s.kind, "kind")}
				{field(s.status, "status")}
				{field(s.owner, "owner")}
				{field(s.specRef, "specRef")}
			</div>
			<datalist id="q-kinds">
				{KINDS.map((k) => (
					<option key={k} value={k} />
				))}
			</datalist>
			<datalist id="q-statuses">
				{STATUSES.map((k) => (
					<option key={k} value={k} />
				))}
			</datalist>
			{entry && entry.question.status === "answered" && entry.question.specRef ? (
				<div>
					<Button onClick={onFold}>{s.fold}</Button>
				</div>
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
