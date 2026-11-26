import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, type KeyboardEvent, useEffect, useState } from "react";
import { planOf } from "@/features/factory/runs/plan";
import { message, useGuard } from "@/features/work/guard";
import { useRunLog } from "@/lib/factory";
import {
	type ApprovalItem,
	type MessageItem,
	type NeedsYouItem,
	type QuestionItem,
	type ReviewItem,
	useInboxActions,
} from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { QuestionChoice } from "@/lib/ipc";
import { showAnchor } from "@/lib/notifications/targets";
import { RightButton, useRights } from "@/lib/rights";
import { pullHref, useShell } from "@/lib/shell";
import { capabilityOf, useFile, useFoldTargets, useSpecsActions, useSpecView } from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Input } from "@/ui/atoms/input";
import { ApprovalBar, approvalSentence } from "@/ui/molecules/approval-bar";
import { Card } from "@/ui/molecules/card";
import { Option } from "@/ui/molecules/option";
import { QuestionCard } from "@/ui/molecules/question-card";
import { RefChip } from "@/ui/molecules/ref-chip";
import { MarkdownView } from "@/ui/organisms/markdown-view";

/** The row of a thing that needs the person, with each control and each right gate (spec:app-redesign#REQ-007). */
export function NeedsRow({ item: x, onLater }: { item: NeedsYouItem; onLater?: () => void }) {
	switch (x.kind) {
		case "question":
			return <QuestionRow item={x.item} />;
		case "approval":
			return <ApprovalsQuestion approvals={x.items} onNotYet={onLater} />;
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

/**
 * An open question on the card of Today (picture 001): one large button for each answer, then one
 * row with the free answer, Later and Send. Digits pick an answer and Enter sends, as on the card of a run.
 */
export function OpenQuestion({ item, onLater }: { item: QuestionItem; onLater?: () => void }) {
	const { t } = useI18n();
	const h = t.home;
	const act = useInboxActions();
	const { error, run: guard } = useGuard();
	const q = item.question;
	const [n, setN] = useState<number | null>(q.recommended >= 1 ? q.recommended : null);
	const [text, setText] = useState("");
	const choice: QuestionChoice | null = text.trim()
		? { kind: "text", text: text.trim() }
		: n !== null
			? { kind: "option", n }
			: null;
	const send = () => {
		if (choice) void guard(() => act.answer(item.run, q.id, choice));
	};
	const pick = (i: number) => {
		setN(i);
		setText("");
	};
	const onKeyDown = (e: KeyboardEvent) => {
		const field = e.target instanceof HTMLInputElement;
		// Enter sends from an answer or from the field. On Later and Send it presses that button.
		const answers = e.target instanceof HTMLElement && e.target.closest("[role=group]") !== null;
		if (e.key === "Enter" && (field || answers)) {
			e.preventDefault();
			send();
		} else if (!field && /^[1-9]$/.test(e.key) && Number(e.key) <= q.options.length)
			pick(Number(e.key));
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the keys of the answers work from each control of the card
		<div onKeyDown={onKeyDown} className="flex flex-col gap-6">
			{q.unclear ? (
				<p
					role="note"
					aria-label={h.unclear}
					className="rounded-md border border-warning px-4 py-2"
				>
					{q.unclear}
				</p>
			) : null}
			{q.edited ? <p className="text-warning-text">{h.edited}</p> : null}
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset draws its own frame */}
			<div role="group" aria-label={q.question} className="flex flex-col gap-2.5">
				{q.options.map((label, i) => (
					<Option
						key={label}
						selected={n === i + 1 && !text.trim()}
						onClick={() => pick(i + 1)}
						trailing={i + 1 === q.recommended ? <Badge variant="accent">{h.pick}</Badge> : null}
					>
						{label}
					</Option>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-2.5">
				{q.free_text ? (
					<Input
						label={h.another}
						className="flex-[1_1_220px]"
						value={text}
						onChange={(e) => {
							setText(e.target.value);
							if (e.target.value.trim()) setN(null);
						}}
					/>
				) : (
					<span className="flex-1" />
				)}
				{onLater ? (
					<Button className="min-h-control" onClick={onLater}>
						{h.later}
					</Button>
				) : null}
				<Button variant="primary" className="min-h-control" disabled={!choice} onClick={send}>
					{h.send}
				</Button>
			</div>
			<Failure error={error} />
		</div>
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

/**
 * The approvals that wait for one run, as one question (`spec:app-redesign#REQ-013`). One chip names
 * each effect. The main button sends exactly the effects that show, but never a push with force: that
 * one needs its own click under Each step. Reject exists only under Each step. With the box ticked,
 * the main button stores the permission of the recipe for these effects in place of the single approvals.
 */
export function ApprovalsQuestion({
	approvals,
	noRun,
	onNotYet,
}: {
	approvals: ApprovalItem[];
	/** Hide the chip of the run: the feature page already is that run. */
	noRun?: boolean;
	/** "Not yet" sends and rejects nothing: the caller moves the question away. */
	onNotYet?: () => void;
}) {
	const { t } = useI18n();
	const h = t.home;
	const act = useInboxActions();
	const { gate } = useRights();
	const { error, run } = useGuard();
	const [steps, setSteps] = useState<boolean | null>(null);
	const [recipe, setRecipe] = useState(false);
	const first = approvals[0];
	// A push that rewrites history never goes with the main button or the durable permission.
	const ids = approvals.filter((a) => !a.force).map((a) => a.id);
	const reason = approvals.filter((a) => !a.force).flatMap((a) => gate(a.right).reason ?? [])[0];
	const settings = gate("project.settings").reason;
	if (!first) return null;
	const open = steps ?? ids.length === 0;
	const send = () =>
		void run(async () => {
			if (recipe) return void (await act.allowRecipe(ids));
			// Each effect has its own call: one that fails leaves the others as they went out.
			const failed: string[] = [];
			for (const id of ids)
				try {
					await act.approve(id);
				} catch (e) {
					failed.push(message(e));
				}
			if (failed.length) throw new Error(failed.join("\n"));
		});
	return (
		<Card className="*:border-b-0">
			<div className="flex flex-col gap-3 px-3 py-2">
				{noRun ? null : <RunLink run={first.run} ticket={first.key} />}
				<ul aria-label={h.approvals} className="flex flex-wrap gap-2">
					{approvals.map((a) => (
						<li
							key={a.id}
							id={`approval-${a.id}`}
							className={
								a.force
									? "rounded-full bg-danger-soft px-3 py-1 text-ui text-danger-text"
									: "rounded-full bg-n-3 px-3 py-1 text-ui text-n-12"
							}
						>
							{approvalSentence(h, a)}
						</li>
					))}
				</ul>
				{ids.length ? (
					<div className="flex flex-wrap items-center gap-2">
						<span className="inline-flex min-h-control items-center">
							<Checkbox
								label={format(h.recipe, { recipe: first.workflow })}
								checked={recipe}
								onCheckedChange={setRecipe}
								disabled={!!settings}
							/>
						</span>
						{settings ? <span className="text-12 text-n-11">{settings}</span> : null}
					</div>
				) : null}
				<div className="flex flex-wrap gap-2">
					{ids.length ? (
						<Button
							variant="primary"
							className="min-h-control"
							disabled={!!reason}
							reason={reason}
							onClick={send}
						>
							{ids.length > 1 ? h.approveAll : h.approve}
						</Button>
					) : null}
					<Button className="min-h-control" aria-expanded={open} onClick={() => setSteps(!open)}>
						{h.eachStep}
					</Button>
					{onNotYet ? (
						<Button className="min-h-control" onClick={onNotYet}>
							{h.notYet}
						</Button>
					) : null}
				</div>
				{open
					? approvals.map((a) => (
							<div key={a.id}>
								<ApprovalRow approval={a} noRun />
							</div>
						))
					: null}
				<Failure error={error} />
			</div>
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
					disabled={!note.trim()}
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
						void navigate(r.reference ? pullHref(r.reference) : { to: "/code/now" });
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
