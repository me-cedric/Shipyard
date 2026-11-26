import { useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import { WithProject } from "@/features/shell/no-project";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import {
	KINDS,
	type QuestionEntry,
	readQuestion,
	STATUSES,
	useQuestions,
	useSpecsActions,
} from "@/lib/specs";
import { memberName, useTeam, useWorkContext } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { PlusIcon } from "@/ui/icons";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { Row } from "@/ui/molecules/row";
import { LibraryPage } from "@/ui/templates/library-page";
import { useGuard } from "./guard";
import { STATE_TONE } from "./parts";
import { FoldDialog, QuestionDialog } from "./question-dialogs";

const ALL = "all";
const MINE = "mine";
/** The kind chips, in the order of the page. */
const CHIPS = ["question", "risk", "assumption", "dependency", "decision", "issue"];

/** Library / Questions: the open items to answer, then the closed ones, with create, edit and fold. */
export function Questions() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.questions} icon={null}>
			<Register />
		</WithProject>
	);
}

/** One open item: who owns it, its kind, and the answer in place. */
function OpenCard({
	entry,
	who,
	onEdit,
}: {
	entry: QuestionEntry;
	who: string;
	onEdit: () => void;
}) {
	const { t } = useI18n();
	const s = t.specs.question;
	const p = t.specs.page;
	const act = useSpecsActions();
	const { failure, run } = useGuard();
	const [answer, setAnswer] = useState("");
	const [empty, setEmpty] = useState(false);
	const q = entry.question;
	const kinds = p.kindOne as Record<string, string>;
	// The answer is the last line of the text, as the form of the question writes it.
	const save = () =>
		run(async () => {
			const file = await unwrap(commands.specsRead(entry.path));
			const now = readQuestion(file.text);
			const w = await act.saveQuestion(
				entry.path,
				{ ...now, status: "answered", body: `${now.body.trimEnd()}\n${answer.trim()}\n` },
				file.stamp,
			);
			if (w.conflict) throw new Error(s.conflict);
		});
	const first = (who || t.review.question.noOwner).split(" ")[0] ?? "";
	return (
		<AttentionCard
			className="h-full"
			head={
				<div className="flex items-center gap-2">
					<Avatar name={who || t.review.question.noOwner} size="s" />
					<span className="min-w-0 truncate font-semibold">{first}</span>
					{entry.issues.length ? (
						<StatusDot status="warning" label={entry.issues.join(", ")} />
					) : null}
					<Badge className="ml-auto">{kinds[q.kind] ?? q.kind}</Badge>
				</div>
			}
		>
			{/* The title opens the form of the item: the card has no Edit button. */}
			<h2 className="text-20 font-semibold text-n-12">
				<button
					type="button"
					aria-label={format(p.editItem, { name: q.title })}
					onClick={onEdit}
					className="cursor-pointer text-left hover:underline"
				>
					{q.title}
				</button>
			</h2>
			<form
				className="mt-auto flex flex-wrap items-center gap-2.5"
				onSubmit={(e) => {
					e.preventDefault();
					if (answer.trim()) {
						setEmpty(false);
						void save();
					} else setEmpty(true);
				}}
			>
				<div className="min-w-0 flex-[1_1_200px]">
					<Input
						label={format(p.answerTo, { name: q.title })}
						placeholder={s.answer}
						value={answer}
						onChange={(e) => setAnswer(e.target.value)}
					/>
				</div>
				<RightButton
					right="specs.edit"
					type="submit"
					variant="primary"
					aria-label={format(p.answerTo, { name: q.title })}
				>
					{s.answer}
				</RightButton>
			</form>
			{/* The line keeps its height, so the error does not move the form of the other cards. */}
			<div className="min-h-5">
				{empty ? (
					<p role="alert" className="text-ui text-danger-text">
						{p.answerRequired}
					</p>
				) : null}
			</div>
			<ErrorNotice error={failure} />
		</AttentionCard>
	);
}

function Register() {
	const { t } = useI18n();
	const s = t.specs.question;
	const p = t.specs.page;
	const l = t.library;
	const questions = useQuestions();
	const all = questions.data;
	const members = useTeam().data?.team.members ?? [];
	const me = useWorkContext().data?.me ?? null;
	const [chip, setChip] = useState(ALL);
	const [filters, setFilters] = useState(false);
	const [text, setText] = useState("");
	const [status, setStatus] = useState(ALL);
	const [owner, setOwner] = useState(ALL);
	// `null` closed, `"new"` the create form.
	const [edit, setEdit] = useState<QuestionEntry | "new" | null>(null);
	const [fold, setFold] = useState<QuestionEntry | null>(null);

	const owners = [...new Set((all ?? []).map((e) => e.question.owner).filter(Boolean))].sort();
	const has = (v: string) => v.toLowerCase().includes(text.toLowerCase());
	const shown = (all ?? []).filter(
		({ question: q }) =>
			(text === "" || has(q.id) || has(q.title)) &&
			(chip === ALL || (chip === MINE ? q.owner === me : q.kind === chip)) &&
			(status === ALL || q.status === status) &&
			(owner === ALL || q.owner === owner),
	);
	const open = shown.filter((e) => e.question.status === "open");
	const closed = shown.filter((e) => e.question.status !== "open");
	const waiting = (all ?? []).filter((e) => e.question.status === "open").length;
	const kinds = p.kinds as Record<string, string>;
	const kindOne = p.kindOne as Record<string, string>;
	const states = p.state as Record<string, string>;
	const options = (first: string, values: string[], labels?: Record<string, string>) => [
		{ value: ALL, label: first },
		...values.map((v) => ({ value: v, label: labels?.[v] ?? v })),
	];
	const create = () => setEdit("new");
	return (
		<LibraryPage
			className="pt-3"
			title={
				waiting === 0
					? t.tabs.specs.questions
					: waiting === 1
						? l.questionsOne
						: format(l.questionsMany, { count: waiting })
			}
			action={
				<>
					<PageExport page="raid" />
					<RightButton right="specs.edit" variant="primary" onClick={create}>
						{s.new}
					</RightButton>
				</>
			}
			menu={[{ label: p.filters, onClick: () => setFilters((on) => !on) }]}
		>
			<fieldset aria-label={s.kind} className="flex flex-wrap gap-2">
				{[ALL, ...CHIPS, ...KINDS.filter((k) => !CHIPS.includes(k)), MINE].map((k) => (
					<Chip
						key={k}
						selected={chip === k}
						onClick={() => setChip(k)}
						className={chip === k ? undefined : "bg-surface-2"}
					>
						{k === ALL ? t.specs.filter.all : k === MINE ? p.mine : (kinds[k] ?? k)}
					</Chip>
				))}
			</fieldset>
			{filters ? (
				<div className="flex flex-wrap items-center gap-2">
					<FilterBar
						query={text}
						onQueryChange={setText}
						filters={[]}
						active={[]}
						onToggle={() => {}}
					/>
					<Select
						label={s.status}
						value={status}
						onValueChange={setStatus}
						items={options(s.allStatuses, STATUSES, states)}
					/>
					<Select
						label={s.owner}
						value={owner}
						onValueChange={setOwner}
						items={options(
							s.allOwners,
							owners,
							Object.fromEntries(owners.map((o) => [o, memberName(members, o)])),
						)}
					/>
				</div>
			) : null}
			<ErrorNotice error={questions.error} />
			{all && all.length === 0 ? (
				<EmptyState
					title={t.empty.questions}
					action={{ label: s.new, icon: <PlusIcon size={14} />, onClick: create }}
				/>
			) : null}
			{open.length ? (
				<ul
					aria-label={t.tabs.specs.questions}
					className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] items-stretch gap-6"
				>
					{open.map((e) => (
						<li key={e.path} className="flex min-w-0 flex-col [&>article]:flex-1">
							<OpenCard
								entry={e}
								who={memberName(members, e.question.owner)}
								onEdit={() => setEdit(e)}
							/>
						</li>
					))}
				</ul>
			) : null}
			{closed.length ? (
				<Card className="py-2">
					<section aria-label={p.closed}>
						<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{p.closed}</h2>
						<ul>
							{closed.map((e) => {
								const q = e.question;
								const who = memberName(members, q.owner);
								return (
									<li key={e.path} className="[&+&]:border-t [&+&]:border-n-6">
										<Row>
											{who ? <Avatar name={who} size="s" /> : null}
											<button
												type="button"
												aria-label={format(p.editItem, { name: q.title })}
												onClick={() => setEdit(e)}
												className="min-h-control min-w-0 flex-[1_1_200px] cursor-pointer text-left font-semibold hover:underline"
											>
												{q.title}
											</button>
											{e.issues.length ? (
												<StatusDot status="warning" label={e.issues.join(", ")} />
											) : null}
											<Badge>{kindOne[q.kind] ?? q.kind}</Badge>
											<Badge variant={STATE_TONE[q.status] ?? "neutral"}>
												{states[q.status] ?? q.status}
											</Badge>
											{q.status === "answered" && q.specRef ? (
												<Button aria-label={`${p.foldLong}: ${q.title}`} onClick={() => setFold(e)}>
													{p.foldLong}
												</Button>
											) : null}
										</Row>
									</li>
								);
							})}
						</ul>
					</section>
				</Card>
			) : null}
			{edit ? (
				<QuestionDialog
					key={edit === "new" ? "new" : edit.path}
					entry={edit === "new" ? null : edit}
					onClose={() => setEdit(null)}
					onFold={() => {
						if (edit !== "new") setFold(edit);
						setEdit(null);
					}}
				/>
			) : null}
			{fold ? <FoldDialog entry={fold} onClose={() => setFold(null)} /> : null}
		</LibraryPage>
	);
}
