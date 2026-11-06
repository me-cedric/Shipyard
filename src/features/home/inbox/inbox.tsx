import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { planOf } from "@/features/factory/runs/plan";
import { useGuard } from "@/features/work/guard";
import { useRunLog } from "@/lib/factory";
import {
	type ApprovalItem,
	type MessageItem,
	type QuestionItem,
	type ReviewItem,
	useInbox,
	useInboxActions,
} from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import { showAnchor } from "@/lib/notifications/targets";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { capabilityOf, useFile, useFoldTargets, useSpecsActions, useSpecView } from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { useWorkContext } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ApprovalBar } from "@/ui/molecules/approval-bar";
import { Card } from "@/ui/molecules/card";
import { Panel } from "@/ui/molecules/panel";
import { QuestionCard } from "@/ui/molecules/question-card";
import { RefChip } from "@/ui/molecules/ref-chip";
import { routeInbox } from "./routing";

/** The count of what waits for the person: the groups of Needs you. */
export function needsYouTotal(i: ReturnType<typeof useInbox>) {
	return (
		i.questions.length +
		i.approvals.length +
		i.plans.length +
		i.reviews.length +
		i.messages.length +
		Number(i.timesheet)
	);
}

/**
 * The Needs you section of Home / Today: what waits for the person, in six groups, each with its
 * actions in place (shell REQ-004, questions-loop REQ-008). It shows nothing when nothing waits.
 */
export function NeedsYou() {
	const { t } = useI18n();
	const raw = useInbox();
	const { can, role } = useRights();
	const me = useWorkContext().data?.me ?? null;
	const items = useWorkItems({}).data ?? [];
	const [everyone, setEveryone] = useState(false);
	const inbox = routeInbox(raw, {
		everyone,
		can,
		role,
		me,
		assignee: (key) => items.find((i) => i.key === key)?.member,
	});
	const { questions, approvals, plans, reviews, messages, timesheet } = inbox;
	if (needsYouTotal(raw) === 0) return null;
	return (
		<section aria-label={t.home.needsYou} className="flex flex-col gap-4 px-4">
			{role === null ? null : (
				<Button aria-pressed={everyone} className="self-end" onClick={() => setEveryone(!everyone)}>
					{t.rights.everyone}
				</Button>
			)}
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
			<Group name={t.home.reviews} count={reviews.length}>
				{reviews.map((r) => (
					<ReviewRow key={`${r.number}:${r.headSha}`} review={r} />
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
		</section>
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

/** The run chip of a row, named by its ticket key. */
function RunLink({ run, ticket }: { run: string; ticket: string }) {
	const { openRef } = useShell();
	return (
		<>
			{/* The ticket names the run; the run id stays in the accessible name and behind Copy ref. */}
			<RefChip refId={`run:${run}`} text={ticket || undefined} state="resolved" onOpen={openRef} />
		</>
	);
}

const Failure = ({ error }: { error: string | null }) =>
	error ? (
		<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
			{error}
		</p>
	) : null;

export function QuestionRow({ item }: { item: QuestionItem }) {
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

export function ApprovalRow({ approval: a }: { approval: ApprovalItem }) {
	const act = useInboxActions();
	const { reason } = useRights().gate(a.right);
	const { error, run } = useGuard();
	return (
		<Card className="*:border-b-0">
			<ApprovalBar
				approval={a}
				meta={<RunLink run={a.run} ticket={a.key} />}
				reason={reason}
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
	const { openRef } = useShell();
	const [note, setNote] = useState("");
	const { events, hasNextPage, isFetchingNextPage, fetchNextPage } = useRunLog(run);
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
	const summary = planOf(events)?.summary.trim();
	return (
		<Card>
			<div className="flex flex-wrap items-center gap-2 px-3 py-2">
				<RunLink run={run} ticket={ticket} />
				<span className="flex-1 text-ui font-medium">{title}</span>
				<Button
					onClick={() => {
						openRef(`run:${run}`);
						showAnchor("plan");
					}}
				>
					{t.home.planOpen}
				</Button>
				<Input
					label={t.home.note}
					className="max-w-xs"
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
				<RightButton
					right="runs.approve"
					onClick={() => void guard(() => act.planReject(run, note))}
				>
					{t.home.planReject}
				</RightButton>
				<RightButton
					right="runs.approve"
					variant="primary"
					onClick={() => void guard(() => act.planApprove(run))}
				>
					{t.home.planApprove}
				</RightButton>
			</div>
			{summary ? (
				<p className="line-clamp-3 px-3 pb-2 text-ui whitespace-pre-line text-n-11">{summary}</p>
			) : null}
			<Failure error={error} />
		</Card>
	);
}

/** A draft review of an agent that waits for a person: the link opens its pull request. */
function ReviewRow({ review: r }: { review: ReviewItem }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	return (
		<Card>
			<div className="flex flex-wrap items-center gap-2 px-3 py-2">
				<span className="font-mono text-12 text-n-11">#{r.number}</span>
				<span className="flex-1 text-ui font-medium">{r.title}</span>
				<Button
					onClick={() => {
						if (r.reference) rememberSelection("code:pull-requests", r.reference);
						void navigate({ to: "/code/pull-requests" });
					}}
				>
					{t.home.reviewOpen}
				</Button>
			</div>
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
