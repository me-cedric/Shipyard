import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useEffect, useState } from "react";
import { planOf } from "@/features/factory/runs/plan";
import { useGuard } from "@/features/work/guard";
import { useRunLog } from "@/lib/factory";
import {
	type ApprovalItem,
	type MessageItem,
	type NeedsYouItem,
	type QuestionItem,
	type ReviewItem,
	useInboxActions,
} from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import { showAnchor } from "@/lib/notifications/targets";
import { RightButton, useRights } from "@/lib/rights";
import { pullHref, useShell } from "@/lib/shell";
import { capabilityOf, useFile, useFoldTargets, useSpecsActions, useSpecView } from "@/lib/specs";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ApprovalBar } from "@/ui/molecules/approval-bar";
import { Card } from "@/ui/molecules/card";
import { QuestionCard } from "@/ui/molecules/question-card";
import { RefChip } from "@/ui/molecules/ref-chip";
import { MarkdownView } from "@/ui/organisms/markdown-view";

/** The row of a thing that needs the person, with each control and each right gate (spec:app-redesign#REQ-007). */
export function NeedsRow({ item: x }: { item: NeedsYouItem }) {
	switch (x.kind) {
		case "question":
			return <QuestionRow item={x.item} />;
		case "approval":
			return <ApprovalRow approval={x.item} />;
		case "plan":
			return <PlanRow run={x.item.id} ticket={x.item.key} title={x.item.title} />;
		case "review":
			return <ReviewRow review={x.item} />;
		case "message":
			return <MessageRow message={x.item} />;
	}
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

/** `noRun` hides the chip of the run: the run page already is that run. */
export function QuestionRow({ item, noRun }: { item: QuestionItem; noRun?: boolean }) {
	const act = useInboxActions();
	const { error, run: guard } = useGuard();
	const q = item.question;
	const props: ComponentProps<typeof QuestionCard> = {
		question: q,
		meta: noRun ? undefined : <RunLink run={item.run} ticket={item.key} />,
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

export function ApprovalRow({
	approval: a,
	noRun,
}: {
	approval: ApprovalItem;
	/** Hide the chip of the run: the run page already is that run. */
	noRun?: boolean;
}) {
	const { t } = useI18n();
	const act = useInboxActions();
	const { reason } = useRights().gate(a.right);
	const { error, run } = useGuard();
	return (
		<Card className="*:border-b-0">
			<ApprovalBar
				approval={a}
				meta={noRun ? undefined : <RunLink run={a.run} ticket={a.key} />}
				reason={reason}
				body={(text) => <MarkdownView source={text} label={t.home.details} refs={false} />}
				onApprove={() => void run(() => act.approve(a.id))}
				onReject={() => void run(() => act.reject(a.id))}
			/>
			<Failure error={error} />
		</Card>
	);
}

export function PlanRow({ run, ticket, title }: { run: string; ticket: string; title: string }) {
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
					className="min-h-control"
					onClick={() => {
						openRef(`run:${run}`);
						showAnchor("plan");
					}}
				>
					{t.home.planOpen}
				</Button>
				<Input
					label={t.home.note}
					className="max-w-xs min-h-control"
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
				<RightButton
					right="runs.approve"
					className="min-h-control"
					onClick={() => void guard(() => act.planReject(run, note))}
				>
					{t.home.planReject}
				</RightButton>
				<RightButton
					right="runs.approve"
					className="min-h-control"
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
export function ReviewRow({ review: r }: { review: ReviewItem }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	return (
		<Card>
			<div className="flex flex-wrap items-center gap-2 px-3 py-2">
				<span className="font-mono text-12 text-n-11">#{r.number}</span>
				<span className="flex-1 text-ui font-medium">{r.title}</span>
				<Button
					className="min-h-control"
					onClick={() => {
						void navigate(r.reference ? pullHref(r.reference) : { to: "/code/pull-requests" });
					}}
				>
					{t.home.reviewOpen}
				</Button>
			</div>
		</Card>
	);
}

export function MessageRow({ message: m }: { message: MessageItem }) {
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
					<Button
						className="min-h-control"
						onClick={() => void run(() => act.markRead(m.run, m.n))}
					>
						{t.home.markRead}
					</Button>
				)}
			</div>
			<Failure error={error} />
		</Card>
	);
}
