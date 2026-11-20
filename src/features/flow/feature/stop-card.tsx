import { Link } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { escalationOf, stopReason } from "@/features/factory/runs/run-live";
import { webUrl } from "@/features/factory/runs/run-summary";
import { useGuard } from "@/features/work/guard";
import { useRunActions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { QuestionChoice, RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useWorkActions, useWorkContext } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { ChevronRightIcon } from "@/ui/icons";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { MenuButton } from "@/ui/molecules/menu-button";
import { Row } from "@/ui/molecules/row";
import { DEFAULT_BUDGET, doStop, type StopAction } from "../stop-action";
import { AgentAsk } from "./agent-ask";

const usd = (n: number) => `$${n.toFixed(2)}`;

type Happened = {
	open: boolean;
	setOpen: (open: boolean) => void;
	/** The card has details to show: the page then offers "What happened" in its More menu. */
	available: boolean;
	setAvailable: (available: boolean) => void;
};

/** The page that holds a stop card owns "What happened": the design shows it only on a failed card. */
export const HappenedContext = createContext<Happened | null>(null);

/** The state that the page passes to `HappenedContext`. */
export function useHappenedState(): Happened {
	const [open, setOpen] = useState(false);
	const [available, setAvailable] = useState(false);
	return { open, setOpen, available, setAvailable };
}

/** A stop that waits for no person in a hurry: a plain card, with no attention colour. */
function PlainCard({ who, title, children }: { who: string; title: string; children: ReactNode }) {
	return (
		<article className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2">
			<Badge className="self-start">{who}</Badge>
			<h3 tabIndex={-1} className="text-20 font-semibold text-n-12 outline-none">
				{title}
			</h3>
			{children}
		</article>
	);
}

/**
 * The card of a stopped run (`spec:app-redesign#REQ-014`, picture 081): the state, the fact as the
 * heading (the amount, the question or the cause), the one main action and the second control of
 * that state. The message to the agent, the last lines and what was tried are behind "What happened".
 * `answer` is the answer field of Reply.
 */
export function StopCard({
	run,
	events,
	action,
	agent,
	question,
	answer,
}: {
	run: RunView;
	events: RunLogEvent_Serialize[];
	action: StopAction;
	/** The name of the agent that stopped. */
	agent: string;
	/** The question that waits: the heading of Reply. */
	question?: string;
	/**
	 * The question that waits: one plain Answer field with Reply, and its options in a Choices menu.
	 * `onAnswer` resolves true when the answer went out: the typed text stays until then.
	 */
	answer?: {
		options: string[];
		freeText: boolean;
		/** The option that the agent recommends (1-based), 0 for none: it is picked at the start. */
		recommended: number;
		/** A reply that the agent could not read: the person decides on the card. */
		unclear: string | null;
		/** The question changed after it was asked. */
		edited: boolean;
		onAnswer: (choice: QuestionChoice) => Promise<boolean>;
	};
}) {
	const { t } = useI18n();
	const f = t.factory;
	const s = t.flow.stop;
	const x = t.flow.look.page;
	const act = useRunActions();
	const { gate } = useRights();
	const { openRef } = useShell();
	const { error, run: guard } = useGuard();
	const [note, setNote] = useState("");
	const [added, setAdded] = useState(DEFAULT_BUDGET);
	const [kept, setKept] = useState(false);
	// The option of Choices: a pick, then Reply sends it, as Send of the question card did.
	const [chosen, setChosen] = useState<number | null>(
		answer && answer.recommended >= 1 ? answer.recommended : null,
	);
	const shared = useContext(HappenedContext);
	const [own, setOwn] = useState(false);
	const happened = shared ? shared.open : own;
	const setHappened = shared ? shared.setOpen : setOwn;
	// Keep it open: a run blocked with nothing to deliver can still be unblocked.
	const view: StopAction = kept ? "unblock" : action;
	const esc = escalationOf(events);
	const budget = run.budgetUsd ?? null;
	const reason = stopReason(f.why, run, events);
	const amount =
		view === "addBudget" && budget !== null
			? format(x.spent, { spent: usd(run.costUsd ?? 0), budget: usd(budget) })
			: null;
	// The heading is the fact: the amount for the limit, the question for Reply, else the cause.
	const title = amount ?? (view === "reply" && question ? question : reason);
	const labels: Record<StopAction, string> = {
		reply: s.reply,
		unblock: f.unblock,
		addBudget: s.addBudget,
		tryAgain: s.tryAgain,
		resume: f.resume,
		closeDone: f.closeDone,
	};
	const go = () =>
		void guard(() =>
			doStop(act, run, view, { usd: added, note, open: (id) => openRef(`run:${id}`) }),
		).then((ok) => ok && setNote(""));
	// The message goes with the action. A blocked run shows it in the row: it is the answer.
	const noted = view === "addBudget" || view === "resume";
	const more = noted || !!esc || view === "tryAgain" || title !== reason;
	const setAvailable = shared?.setAvailable;
	const offered = more && view !== "tryAgain" && view !== "reply";
	useEffect(() => {
		setAvailable?.(offered);
		return () => setAvailable?.(false);
	}, [setAvailable, offered]);
	const body = (
		<>
			{/* Enter in the note sends the main action. */}
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (view !== "reply") return go();
					if (!answer) return;
					const choice: QuestionChoice | null = note.trim()
						? { kind: "text", text: note.trim() }
						: chosen !== null
							? { kind: "option", n: chosen }
							: null;
					if (choice) void answer.onAnswer(choice).then((ok) => ok && setNote(""));
				}}
			>
				{/* A reply that the agent could not read, and a question that changed: the person sees both before the answer. */}
				{view === "reply" && answer?.unclear ? (
					<p
						role="note"
						aria-label={t.home.unclear}
						className="rounded-md border border-warning px-3 py-2 text-ui"
					>
						{answer.unclear}
					</p>
				) : null}
				{view === "reply" && answer?.edited ? (
					<p className="text-13 text-warning-text">{t.home.edited}</p>
				) : null}
				<div
					className={`flex flex-wrap items-center gap-2.5${view === "addBudget" ? " mt-5" : ""}`}
				>
					{view === "unblock" ? (
						<Input
							label={format(x.blocked.answer, { agent })}
							className="flex-[1_1_200px] scroll-mt-32"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					) : null}
					{view === "reply" && answer?.freeText ? (
						<Input
							label={f.answer}
							className="flex-[1_1_200px] scroll-mt-32"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					) : null}
					{view === "reply" && answer?.options.length ? (
						<MenuButton
							label={x.choices}
							items={answer.options.map((label, i) => ({
								id: String(i),
								label: i + 1 === answer.recommended ? `${label} (${t.home.recommended})` : label,
								checked: chosen === i + 1,
								onSelect: () => setChosen(i + 1),
							}))}
						/>
					) : null}
					{view === "reply" && answer && chosen !== null && !note.trim() ? (
						<span className="text-ui text-n-11">{answer.options[chosen - 1]}</span>
					) : null}
					{view === "addBudget" ? (
						<fieldset
							aria-label={s.budgetAdd}
							className="m-0 flex items-center rounded-md border border-n-7 bg-surface-2 p-0"
						>
							<Button
								variant="ghost"
								aria-label={s.budgetLess}
								disabled={added <= 1}
								onClick={() => setAdded(added - 1)}
							>
								−
							</Button>
							<output className="min-w-10 text-center font-semibold">${added}</output>
							<Button variant="ghost" aria-label={s.budgetMore} onClick={() => setAdded(added + 1)}>
								+
							</Button>
						</fieldset>
					) : null}
					{view === "tryAgain" ? (
						<Button aria-expanded={happened} onClick={() => setHappened(!happened)}>
							{s.whatHappened}
						</Button>
					) : null}
					{view === "resume" ? (
						<ConfirmButton
							{...gate("runs.start")}
							confirm={format(f.machine.confirmStop, { name: run.title })}
							onConfirm={() => void guard(() => act.cancel(run.id))}
						>
							{s.stopIt}
						</ConfirmButton>
					) : null}
					{/* Only a blocked run can go on: a run whose pull request ended has nothing to keep open. */}
					{action === "closeDone" && !kept && run.state === "Blocked" ? (
						<Button onClick={() => setKept(true)}>{s.keepOpen}</Button>
					) : null}
					{view === "reply" ? (
						answer ? (
							<Button variant="primary" type="submit" disabled={!note.trim() && chosen === null}>
								{s.reply}
							</Button>
						) : null
					) : (
						<RightButton
							right="runs.start"
							variant="primary"
							className={
								view === "unblock" || view === "addBudget" ? undefined : "flex-[1_1_120px]"
							}
							type="submit"
						>
							{labels[view]}
						</RightButton>
					)}
				</div>
				{offered && !shared ? (
					<LinkButton aria-expanded={happened} onClick={() => setHappened(!happened)}>
						{s.whatHappened}
					</LinkButton>
				) : null}
				{happened ? (
					<div className="flex flex-col gap-2 text-n-11">
						{title === reason ? null : <p className="text-n-12">{reason}</p>}
						{esc && esc.lines.length > 0 ? (
							<details className="text-13">
								<summary className="w-fit cursor-pointer select-none rounded-sm">
									{f.why.lastLines}
								</summary>
								<pre className="overflow-x-auto font-mono text-11 whitespace-pre-wrap">
									{esc.lines.join("\n")}
								</pre>
							</details>
						) : null}
						{esc ? (
							<span>
								{f.why.tried}: {esc.tried}
							</span>
						) : null}
						{noted ? (
							<Input
								label={f.unblockNote}
								className="max-w-96 scroll-mt-32"
								value={note}
								onChange={(e) => setNote(e.target.value)}
							/>
						) : null}
					</div>
				) : null}
			</form>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
	// A blocked agent speaks for itself: its tile, and the cause as the heading (picture 026).
	if (view === "unblock")
		return (
			<AgentAsk agent={agent} who={format(x.blocked.head, { agent })} title={title}>
				{body}
			</AgentAsk>
		);
	const Frame = view === "resume" || view === "closeDone" ? PlainCard : AttentionCard;
	return (
		<Frame who={s.state[view]} title={title}>
			{body}
		</Frame>
	);
}

/**
 * "Reply on the ticket" (picture 081): a comment that goes to the issue tracker, with the comment
 * command of the ticket. It shows only for a ticket of an issue tracker that takes comments.
 */
export function TicketReply({ run }: { run: Pick<RunView, "key" | "url"> }) {
	const { t } = useI18n();
	const x = t.flow.look.page.stop;
	const caps = useWorkContext().data?.capabilities;
	const act = useWorkActions();
	const { error, run: guard } = useGuard();
	const [body, setBody] = useState("");
	if (!(caps?.comments && webUrl(run.url))) return null;
	return (
		<Card pad className="flex flex-col gap-3">
			<h2 className="text-17 font-semibold text-n-12">{t.factory.replyOnTicket}</h2>
			<form
				className="flex flex-wrap items-center gap-2.5"
				onSubmit={async (e) => {
					e.preventDefault();
					if (body.trim() === "") return;
					if (await guard(() => act.comment(run.key, body))) setBody("");
				}}
			>
				<Input
					label={t.factory.replyOnTicket}
					caption={false}
					placeholder=""
					className="flex-[1_1_240px]"
					value={body}
					onChange={(e) => setBody(e.target.value)}
				/>
				<Badge>{x.toTracker}</Badge>
				<Button type="submit">{x.send}</Button>
			</form>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Card>
	);
}

/** The two ways on from a stopped run (picture 081): the features that need a person, and the ended ones. */
export function StopLinks() {
	const { t } = useI18n();
	const x = t.flow.look.page.stop;
	const end = <ChevronRightIcon size={20} className="ml-auto text-n-10" />;
	return (
		<Card className="py-2">
			<Row
				render={(p) => (
					<Link to="/flow/flow" search={{ filter: "needs" }} {...p}>
						<span className="font-semibold">{x.blockedRow}</span>
						{end}
					</Link>
				)}
			>
				{null}
			</Row>
			<Row
				render={(p) => (
					<Link to="/flow/done" {...p}>
						<span className="font-semibold">{x.stoppedRow}</span>
						{end}
					</Link>
				)}
			>
				{null}
			</Row>
		</Card>
	);
}
