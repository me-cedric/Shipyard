import { useNavigate, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PullPart } from "@/features/code/pull-page";
import { type RunScopeData, useRunScope } from "@/features/factory/runs/run-detail";
import { LiveLine, nameOf } from "@/features/factory/runs/run-live";
import { agentOf } from "@/features/factory/runs/run-summary";
import { UnitTranscript } from "@/features/factory/runs/unit-chat";
import { transcript } from "@/features/factory/runs/unit-transcript";
import { QuestionRow } from "@/features/home/inbox/inbox";
import { useGuard } from "@/features/work/guard";
import { type ApprovalItem, useInboxActions } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { memberName, useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { LinkButton } from "@/ui/atoms/link-button";
import { PlusIcon } from "@/ui/icons";
import { approvalSentence, isMove } from "@/ui/molecules/approval-bar";
import { Card } from "@/ui/molecules/card";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { stopAction } from "../stop-action";
import { Developers, DevPanel, type Open } from "./chat-developers";
import { Mark } from "./checks";
import { keyOf, StartAgent } from "./start";
import { TicketThread } from "./ticket-page";
import type { Parts } from "./use-feature";

/** A message of the agent: its tile and a bubble. */
function Bubble({
	agent,
	bare,
	children,
}: {
	agent: string;
	/** The child is a card already: no second box. */
	bare?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start gap-3">
			<Avatar agent name={agent} />
			<div
				className={cn(
					"flex min-w-0 max-w-prose flex-col gap-3 text-17 [&_article]:text-17",
					!bare && "rounded-xl bg-surface-2 px-5 py-4 shadow-1",
				)}
			>
				{children}
			</div>
		</div>
	);
}

const LONG = ["push", "open_pr"];

/** The limits of `assistant_attach`, which the command of the chat shares: text up to 200 KiB, an image up to 2 MiB. */
const MAX_TEXT = 200 * 1024;
const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/** A write that waits for a click, as a message: the sentence on its own line, Reject and Approve below it. */
function ApprovalMessage({ approval: a }: { approval: ApprovalItem }) {
	const { t } = useI18n();
	const act = useInboxActions();
	const { reason } = useRights().gate(a.right);
	const { failure, run } = useGuard();
	const sentence = approvalSentence(t.home, a);
	return (
		<section aria-label={sentence} className="flex flex-col gap-3">
			<p className={cn("font-medium", a.force && "text-danger-text")}>{sentence}</p>
			{a.detail && !isMove(a.kind) && !LONG.includes(a.kind) ? (
				<MarkdownView source={a.detail} label={t.home.details} refs={false} />
			) : null}
			{/* The command of a push and the text of a pull request stay behind Details: they are not a message. */}
			{a.detail && LONG.includes(a.kind) ? (
				<details className="text-12 text-n-11">
					<summary className="w-fit cursor-pointer select-none">{t.home.details}</summary>
					<pre className="whitespace-pre-wrap font-mono">{a.detail}</pre>
				</details>
			) : null}
			<div className="flex flex-wrap gap-2.5">
				<Button
					disabled={!!reason}
					reason={reason}
					onClick={() => void run(() => act.reject(a.id))}
				>
					{t.home.reject}
				</Button>
				<Button
					variant={a.force ? "danger" : "primary"}
					disabled={!!reason}
					reason={reason}
					onClick={() => void run(() => act.approve(a.id))}
				>
					{t.home.approve}
				</Button>
			</div>
			<ErrorNotice error={failure} />
		</section>
	);
}

/**
 * The field that sends a note to the agent, with Send and Stop. A stopped run that can go on takes the
 * note with its command (resume or unblock). While the agent works, no command takes a message: Send says so.
 */
function Composer({ scope, agent }: { scope: RunScopeData; agent: string }) {
	const { t } = useI18n();
	const c = t.flow.look.checks;
	const { gate } = useRights();
	const { run, act, guard, active } = scope;
	const [text, setText] = useState("");
	const [blocked, setBlocked] = useState(false);
	// A file joins the next turn as context (`runs-recipes` REQ-003): its name stays beside the field.
	const picker = useRef<HTMLInputElement>(null);
	const [files, setFiles] = useState<string[]>([]);
	const [refused, setRefused] = useState<string | null>(null);
	const [attachFailure, setAttachFailure] = useState<unknown>(null);
	const attach = async (list: FileList) => {
		setRefused(null);
		setAttachFailure(null);
		for (const f of Array.from(list)) {
			const image = IMAGE.test(f.name);
			if (f.size > (image ? MAX_IMAGE : MAX_TEXT)) {
				setRefused(
					format(t.factory.runsRecipes.tooLarge, {
						name: f.name,
						size: image ? "2 MiB" : "200 KiB",
					}),
				);
				continue;
			}
			try {
				const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
				const done = await act.attach(run.id, f.name, bytes);
				setFiles((x) => [...x, done.name]);
			} catch (e) {
				setAttachFailure(e);
			}
		}
	};
	const kind = stopAction(run);
	const can = kind === "resume" || kind === "unblock";
	const send = async () => {
		const note = text.trim();
		if (!note) return;
		// While the agent works, no command takes the note: say so on a click, not before.
		if (!can) return setBlocked(true);
		const ok = await guard(() =>
			kind === "resume" ? act.resume(run.id, null, note) : act.unblock(run.id, note),
		);
		if (ok) setText("");
	};
	return (
		<form
			className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface-2 p-2 shadow-2"
			onSubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<input
				ref={picker}
				type="file"
				multiple
				hidden
				data-testid="attach-input"
				onChange={(e) => {
					if (e.target.files) void attach(e.target.files);
					e.target.value = "";
				}}
			/>
			<IconButton
				label={t.doctor.attach.add}
				disabled={!active}
				onClick={() => picker.current?.click()}
			>
				<PlusIcon size={14} />
			</IconButton>
			<input
				aria-label={format(c.message, { agent })}
				placeholder={format(c.message, { agent })}
				className="min-h-control min-w-0 flex-[1_1_240px] bg-transparent px-3 text-ui text-n-12 outline-none placeholder:text-n-11 focus-visible:shadow-glow"
				value={text}
				onChange={(e) => {
					setText(e.target.value);
					setBlocked(false);
				}}
			/>
			{active ? (
				<ConfirmButton
					{...gate("runs.start")}
					confirm={format(t.factory.machine.confirmStop, { name: run.title })}
					onConfirm={() => void guard(() => act.cancel(run.id))}
				>
					{c.stop}
				</ConfirmButton>
			) : null}
			<Button type="submit" variant="primary" disabled={!text.trim()}>
				{c.send}
			</Button>
			{files.length > 0 ? (
				<ul aria-label={t.doctor.attach.add} className="flex w-full flex-wrap gap-1 px-3">
					{files.map((name, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a name can repeat, the list only grows
						<li key={`${name}${i}`}>
							<Badge variant="accent">{name}</Badge>
						</li>
					))}
				</ul>
			) : null}
			{refused ? (
				<p role="alert" className="w-full px-3 text-ui text-danger-text">
					{refused}
				</p>
			) : null}
			<ErrorNotice error={attachFailure} className="w-full px-3" />
			{blocked ? (
				<p role="alert" className="w-full px-3 text-ui text-n-11">
					{c.busy}
				</p>
			) : null}
		</form>
	);
}

const MARK = {
	done: "tick",
	running: "active",
	pending: "open",
	gate: "fail",
	failed: "fail",
} as const;

/** The Recipe card: the steps of the run, the open one first in colour. */
function Recipe({ run }: { run: RunScopeData["run"] }) {
	const { t } = useI18n();
	return (
		<Card className="py-2">
			<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">
				{t.flow.look.checks.recipe}
			</h2>
			<ul className="flex flex-col px-6 pb-2">
				{run.steps.map((s) => (
					<li
						key={s.id}
						className={cn(
							"flex min-h-8 items-center gap-2.5 text-ui",
							s.state === "running" ? "font-semibold text-accent" : "text-n-12",
						)}
					>
						<Mark kind={MARK[s.state]} label={t.factory.step[s.state]} small />
						<span className="min-w-0 flex-1 truncate">
							{s.id === "pr" ? t.refKind.pr : nameOf(s.id, t.factory.agentNames)}
						</span>
					</li>
				))}
			</ul>
		</Card>
	);
}

/**
 * Chat (`spec:app-redesign#REQ-023`, picture 023): the conversation of the session as bubbles with the tile of the
 * agent, what waits for the person inside a bubble, the field with Send and Stop, the pull request conversation and
 * the comments of the ticket. The right column has the Recipe and "For developers". The page is never blank.
 */
export function Chat({ parts }: { parts: Parts }) {
	const { person } = useRights();
	const members = useTeam().data?.team.members ?? [];
	const { t } = useI18n();
	const c = t.flow.look.checks;
	const scope = useRunScope();
	const navigate = useNavigate();
	const key = keyOf(parts.ticket);
	const [open, setOpen] = useState<Open | null>(null);
	// A link that names a session: the page draws the requests and the sessions for it.
	const search = useSearch({ strict: false }) as { unit?: string; tab?: string };
	const linked = search.unit !== undefined || search.tab === "workflow";
	const session = scope?.run.steps
		.flatMap((s) => s.units)
		.find((u) => u.state === "running" && u.runner !== "");
	const mine = scope && session ? scope.events.filter((e) => e.step === session.id) : [];
	const talk = transcript(mine).items.length > 0;
	const waits = scope ? scope.waits.questions.length + scope.waits.approvals.length : 0;
	if (!(scope || parts.pr || key))
		return <EmptyState title={t.flow.feature.noChat} extra={<StartAgent parts={parts} />} />;
	const agent = scope ? agentOf(scope.run, t.factory.agentNames) : "";
	const showChange = () =>
		void navigate({
			to: ".",
			search: ((s: Record<string, unknown>) => ({ ...s, section: "changes" })) as never,
			replace: true,
		});
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start gap-6">
				<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
					{scope && talk ? (
						<UnitTranscript
							events={mine}
							ticket={scope.run.key}
							running
							agent={agent}
							you={person?.member ? memberName(members, person.member) : c.you}
							after={
								scope.diff.length > 0 ? (
									<LinkButton onClick={showChange}>{c.showChange}</LinkButton>
								) : null
							}
						/>
					) : null}
					{scope?.waits.questions.map((q) => (
						<Bubble key={`${q.run}:${q.question.id}`} agent={agent} bare>
							<QuestionRow item={q} noRun />
						</Bubble>
					))}
					{scope?.waits.approvals.map((a) => (
						<Bubble key={a.id} agent={agent}>
							<ApprovalMessage approval={a} />
						</Bubble>
					))}
					{scope && !talk && scope.diff.length > 0 ? (
						<Bubble agent={agent}>
							<LinkButton onClick={showChange}>{c.showChange}</LinkButton>
						</Bubble>
					) : null}
					{scope?.active ? (
						<Bubble agent={agent}>
							<span className="flex items-center gap-2 [&_p]:text-17">
								<span aria-hidden="true" className="flex gap-1">
									<i className="size-1.5 rounded-full bg-accent" />
									<i className="size-1.5 rounded-full bg-n-5" />
									<i className="size-1.5 rounded-full bg-n-5" />
								</span>
								<LiveLine run={scope.run} events={scope.events} />
							</span>
						</Bubble>
					) : null}
					{scope && !talk && !waits ? <EmptyState title={t.flow.feature.noChat} /> : null}
					{scope ? <Composer scope={scope} agent={agent} /> : null}
					{!(scope || parts.pr) ? (
						<EmptyState title={t.flow.feature.noChat} extra={<StartAgent parts={parts} />} />
					) : null}
					{parts.pr ? <PullPart part="chat" /> : null}
					{key ? <TicketThread itemKey={key} /> : null}
				</div>
				{scope ? (
					<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
						<Recipe run={scope.run} />
						<Developers count={scope.events.length} open={open} linked={linked} onOpen={setOpen} />
					</div>
				) : null}
			</div>
			{scope ? <DevPanel scope={scope} open={open} /> : null}
		</div>
	);
}
