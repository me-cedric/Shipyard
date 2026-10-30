import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useState } from "react";
import { useGuard } from "@/features/work/guard";
import {
	type ApprovalItem,
	type MessageItem,
	type QuestionItem,
	useInbox,
	useInboxActions,
} from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import { useActiveProject, useProjectActions } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { capabilityOf, useFile, useFoldTargets, useSpecsActions, useSpecView } from "@/lib/specs";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ArrowPathIcon, FolderOpenIcon, InboxIcon } from "@/ui/icons";
import { ApprovalBar } from "@/ui/molecules/approval-bar";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { QuestionCard } from "@/ui/molecules/question-card";
import { RefChip } from "@/ui/molecules/ref-chip";
import { HomeStats } from "../stats";

/**
 * Home / Inbox: what waits for the person, in four groups (shell REQ-003, questions-loop REQ-008).
 * `start` shows under the header: the Get started steps of a new project.
 */
export function Inbox({ start }: { start?: ReactNode }) {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const { openFolder } = useProjectActions();
	const act = useInboxActions();
	const { loading, questions, approvals, plans, messages, timesheet } = useInbox();
	const total =
		questions.length + approvals.length + plans.length + messages.length + Number(timesheet);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader
				icon={<InboxIcon size={16} />}
				title={t.home.needsYou}
				count={active ? total : undefined}
				menu={
					active
						? [
								{
									label: t.home.refresh,
									icon: <ArrowPathIcon size={12} />,
									onClick: () => void act.refresh(),
								},
							]
						: undefined
				}
			/>
			{active === null ? (
				<EmptyState
					action={{
						label: t.projects.open,
						icon: <FolderOpenIcon size={14} />,
						onClick: () => void openFolder(),
					}}
				/>
			) : (
				<>
					{start}
					<HomeStats />
					{total === 0 && !loading ? (
						<EmptyState
							layout="cards"
							action={{
								label: t.home.refresh,
								icon: <ArrowPathIcon size={14} />,
								onClick: () => void act.refresh(),
							}}
						/>
					) : (
						<div className="flex flex-col gap-4 px-4">
							<Group name={t.home.questions} count={questions.length}>
								{questions.map((x) => (
									<QuestionRow key={`${x.run}:${x.question.id}`} item={x} />
								))}
							</Group>
							<Group name={t.home.approvals} count={approvals.length}>
								{approvals.map((a) => (
									<ApprovalRow key={a.id} approval={a} />
								))}
							</Group>
							<Group name={t.home.planReview} count={plans.length}>
								{plans.map((r) => (
									<PlanRow key={r.id} run={r.id} ticket={r.key} title={r.title} />
								))}
							</Group>
							<Group name={t.home.timesheet} count={Number(timesheet)}>
								<TimesheetRow />
							</Group>
							<Group name={t.home.messages} count={messages.length}>
								{messages.map((m) => (
									<MessageRow key={`${m.run}:${m.n}`} message={m} />
								))}
							</Group>
						</div>
					)}
				</>
			)}
		</div>
	);
}

function Group({ name, count, children }: { name: string; count: number; children: ReactNode }) {
	if (count === 0) return null;
	return (
		<Panel title={name} count={count}>
			{children}
		</Panel>
	);
}

/** The run chip and the ticket key of a row. */
function RunLink({ run, ticket }: { run: string; ticket: string }) {
	const { openRef } = useShell();
	return (
		<>
			<RefChip refId={`run:${run}`} state="resolved" onOpen={openRef} />
			<span className="font-mono text-12 text-n-11">{ticket}</span>
		</>
	);
}

const Failure = ({ error }: { error: string | null }) =>
	error ? (
		<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
			{error}
		</p>
	) : null;

function QuestionRow({ item }: { item: QuestionItem }) {
	const act = useInboxActions();
	const { error, run: guard } = useGuard();
	const q = item.question;
	const props: ComponentProps<typeof QuestionCard> = {
		question: q,
		meta: <RunLink run={item.run} ticket={item.key} />,
		onAnswer: (choice) => void guard(() => act.answer(item.run, q.id, choice)),
	};
	return (
		<Card className="*:border-b-0">
			{q.spec && q.state === "answered" ? (
				<FoldedCard {...props} spec={q.spec} />
			) : (
				<QuestionCard {...props} />
			)}
			<Failure error={error} />
		</Card>
	);
}

/** An answered spec question: the preview of its fold, and the fold on a click (REQ-015). */
function FoldedCard({ spec, ...props }: ComponentProps<typeof QuestionCard> & { spec: string }) {
	const { t } = useI18n();
	const { question: q } = props;
	const fold = useSpecsActions().fold;
	const { error, run } = useGuard();
	const target = useFoldTargets(q.id, capabilityOf(spec))[0] ?? null;
	const stamp = useFile(target).data?.stamp;
	const markers = (useSpecView(target).data?.markers ?? []).filter((m) => m.question === q.id);
	const given = q.answer?.choice;
	const answer = (given?.kind === "option" ? q.options[given.n - 1] : given?.text) ?? "";
	return (
		<>
			<QuestionCard
				{...props}
				fold={
					target && answer
						? {
								lines: [
									...markers.map(
										(m) => `- ${t.specs.editor.line} ${m.line}: [NEEDS CLARIFICATION: ${m.text}]`,
									),
									`+ ### Clarifications: - ${q.id} ${q.question}: ${answer}`,
								],
								disabled: !stamp,
								onFold: () =>
									void run(async () => {
										const w = await fold(target, q.id, answer, stamp ?? "");
										if (w.conflict) throw new Error(t.specs.question.conflict);
									}),
							}
						: undefined
				}
			/>
			<Failure error={error} />
		</>
	);
}

function ApprovalRow({ approval: a }: { approval: ApprovalItem }) {
	const act = useInboxActions();
	const { error, run } = useGuard();
	return (
		<Card className="*:border-b-0">
			<ApprovalBar
				approval={a}
				meta={<RunLink run={a.run} ticket={a.key} />}
				onApprove={() => void run(() => act.approve(a.id))}
				onReject={() => void run(() => act.reject(a.id))}
			/>
			<Failure error={error} />
		</Card>
	);
}

function PlanRow({ run, ticket, title }: { run: string; ticket: string; title: string }) {
	const { t } = useI18n();
	const act = useInboxActions();
	const { error, run: guard } = useGuard();
	const [note, setNote] = useState("");
	return (
		<Card>
			<div className="flex flex-wrap items-center gap-2 px-3 py-2">
				<RunLink run={run} ticket={ticket} />
				<span className="flex-1 text-ui font-medium">{title}</span>
				<Input
					label={t.home.note}
					className="max-w-xs"
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
				<Button onClick={() => void guard(() => act.planReject(run, note))}>
					{t.home.planReject}
				</Button>
				<Button variant="primary" onClick={() => void guard(() => act.planApprove(run))}>
					{t.home.planApprove}
				</Button>
			</div>
			<Failure error={error} />
		</Card>
	);
}

function TimesheetRow() {
	const { t } = useI18n();
	const navigate = useNavigate();
	return (
		<Card>
			<div className="flex items-center gap-2 px-3 py-2">
				<span className="flex-1 text-ui">{t.home.timesheetDay}</span>
				<Button onClick={() => void navigate({ to: "/work/time" })}>{t.home.timesheetOpen}</Button>
			</div>
		</Card>
	);
}

function MessageRow({ message: m }: { message: MessageItem }) {
	const { t } = useI18n();
	const act = useInboxActions();
	const { error, run } = useGuard();
	return (
		<Card>
			<div className="flex flex-wrap items-center gap-2 px-3 py-2">
				<RunLink run={m.run} ticket={m.key} />
				<span className="font-mono text-12 text-n-11">{m.from}</span>
				<span className={m.read ? "flex-1 text-ui text-n-11" : "flex-1 text-ui font-medium"}>
					{m.text}
				</span>
				{m.read ? null : (
					<Button onClick={() => void run(() => act.markRead(m.run, m.n))}>
						{t.home.markRead}
					</Button>
				)}
			</div>
			<Failure error={error} />
		</Card>
	);
}
