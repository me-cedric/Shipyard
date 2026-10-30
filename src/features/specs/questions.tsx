import { motion } from "motion/react";
import { useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import { useI18n } from "@/lib/i18n";
import { KINDS, type QuestionEntry, STATUSES, useQuestions } from "@/lib/specs";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ChatBubbleIcon, PlusIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { LIST, useEnter } from "@/ui/motion";
import { ListDetail } from "@/ui/templates/list-detail";
import { WithProject } from "./no-project";
import { FoldDialog, QuestionDialog } from "./question-dialogs";

const ALL = "all";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
/** The tint of a status: the chip and the line on top of the card. */
const STATUS: Record<string, { tone: Tone; line: string }> = {
	open: { tone: "warning", line: "bg-warning" },
	answered: { tone: "success", line: "bg-success" },
	withdrawn: { tone: "neutral", line: "bg-n-8" },
};
const KIND: Record<string, Tone> = {
	risk: "danger",
	assumption: "info",
	issue: "warning",
	dependency: "accent",
	question: "accent",
	decision: "success",
};

/** Specs / Questions: the RAID register with combined filters, create, edit and fold. */
export function Questions() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.questions}>
			<Register />
		</WithProject>
	);
}

function Register() {
	const { t } = useI18n();
	const s = t.specs.question;
	const all = useQuestions().data;
	const [text, setText] = useState("");
	const [kind, setKind] = useState(ALL);
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
			(kind === ALL || q.kind === kind) &&
			(status === ALL || q.status === status) &&
			(owner === ALL || q.owner === owner),
	);
	const enter = useEnter();
	const options = (all: string, values: string[]) => [
		{ value: ALL, label: all },
		...values.map((v) => ({ value: v, label: v })),
	];
	const create = () => setEdit("new");
	return (
		<ListDetail
			title={t.tabs.specs.questions}
			icon={<ChatBubbleIcon size={16} />}
			count={all?.length}
			action={
				all?.length ? (
					<Button variant="primary" onClick={create}>
						<PlusIcon size={14} />
						{s.new}
					</Button>
				) : null
			}
			toolbar={
				<>
					<FilterBar
						query={text}
						onQueryChange={setText}
						filters={[]}
						active={[]}
						onToggle={() => {}}
					/>
					<Select
						label={s.kind}
						value={kind}
						onValueChange={setKind}
						items={options(s.allKinds, KINDS)}
					/>
					<Select
						label={s.status}
						value={status}
						onValueChange={setStatus}
						items={options(s.allStatuses, STATUSES)}
					/>
					<Select
						label={s.owner}
						value={owner}
						onValueChange={setOwner}
						items={options(s.allOwners, owners)}
					/>
					<PageExport page="raid" />
				</>
			}
		>
			{all && all.length === 0 ? (
				<div className="p-4">
					<EmptyState action={{ label: s.new, icon: <PlusIcon size={14} />, onClick: create }} />
				</div>
			) : (
				<motion.ul
					aria-label={t.tabs.specs.questions}
					variants={LIST}
					initial={enter}
					animate="shown"
					className="grid min-h-0 auto-rows-min grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3 overflow-auto px-4 pt-1 pb-4"
				>
					{shown.map((e) => {
						const q = e.question;
						const st = STATUS[q.status] ?? { tone: "neutral", line: "bg-n-8" };
						return (
							<li key={e.path}>
								<Card interactive className="relative overflow-hidden p-0">
									<span
										aria-hidden="true"
										className={cn("absolute inset-x-0 top-0 h-0.5", st.line)}
									/>
									<button
										type="button"
										onClick={() => setEdit(e)}
										className="flex h-full w-full flex-col gap-2 rounded-lg p-3 text-left"
									>
										<span className="flex items-center gap-2">
											<span className="font-mono text-12 text-n-11">{q.id}</span>
											<Badge variant={KIND[q.kind] ?? "neutral"}>{q.kind}</Badge>
											<span className="flex-1" />
											{e.issues.length ? (
												<StatusDot status="warning" label={e.issues.join(", ")} />
											) : null}
											<Badge variant={st.tone}>{q.status}</Badge>
										</span>
										<span className="line-clamp-2 min-h-10 text-ui text-n-12">{q.title}</span>
										{q.owner ? (
											<span className="flex items-center gap-2 text-12 text-n-11">
												<Avatar name={q.owner} className="size-5" />
												{q.owner}
											</span>
										) : null}
									</button>
								</Card>
							</li>
						);
					})}
				</motion.ul>
			)}
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
		</ListDetail>
	);
}
