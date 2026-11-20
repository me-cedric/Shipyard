import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useChanges, useCodeActions, useOrigin } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { type ChainWarning_Serialize, commands, unwrap } from "@/lib/ipc";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { DocsUpdate } from "./docs-update";
import { OriginPanel } from "./origin-panel";
import { useRun } from "./use-run";

const BOX = "flex flex-wrap items-center gap-2.5 rounded-md bg-n-2 p-3.5";

/** The files that wait for a commit, and the branch that is behind its remote: what to do before the push. */
function BeforePush() {
	const { t } = useI18n();
	const x = t.flow.look.pulls;
	const w = t.workspace.gate;
	const changes = useChanges().data;
	const code = useCodeActions();
	const { failure, busy, run } = useRun();
	const [left, setLeft] = useState(false);
	// The push target of today: a warning, never a block.
	const target = useQuery({
		queryKey: ["code", "push-target"],
		queryFn: () => unwrap(commands.codePushTarget()),
		retry: false,
	}).data;
	const files = changes
		? changes.staged.length +
			changes.unstaged.length +
			changes.untracked.length +
			changes.conflicted.length
		: 0;
	const behind = changes?.behind ?? 0;
	const warnings = [
		...(target?.canPush === false ? [format(w.cannotPush, { remote: target.remote })] : []),
		...(target?.onDefault
			? [format(w.onDefault, { branch: target.branch ?? "", remote: target.remote })]
			: []),
	];
	const showFiles = files > 0 && !left;
	const showBranch = behind > 0 || (changes?.ahead ?? 0) > 0;
	if (!showFiles && !showBranch && warnings.length === 0) return null;
	return (
		<Card pad className={`flex flex-col gap-3 ${ATTENTION_FRAME}`}>
			<h2 className="text-20 font-semibold text-n-12">{x.beforePush}</h2>
			{warnings.map((m) => (
				// The design shows no line under the heading: the warning stays for a screen reader.
				<p key={m} role="status" className="sr-only">
					{m}
				</p>
			))}
			{showFiles ? (
				<div className={BOX}>
					<span className="flex-[1_1_160px]">
						{files === 1 ? x.uncommittedOne : format(x.uncommittedMany, { count: files })}
					</span>
					<Link to="/code/now" className={buttonVariants({ variant: "secondary" })}>
						{x.commitThem}
					</Link>
					<Button onClick={() => setLeft(true)}>{x.leaveThem}</Button>
				</div>
			) : null}
			{showBranch ? (
				<div className={BOX}>
					<span className="flex-[1_1_160px]">
						{behind > 0
							? format(x.baseAhead, {
									base: (changes?.upstream ?? "").replace(/^origin\//, ""),
									count: behind,
								})
							: null}
					</span>
					{behind > 0 ? (
						<Button busy={busy} onClick={() => void run(() => code.pull())}>
							{x.updateBranch}
						</Button>
					) : null}
					<Button busy={busy} onClick={() => void run(() => code.push())}>
						{x.pushAsIs}
					</Button>
				</div>
			) : null}
			<ErrorNotice error={failure} />
		</Card>
	);
}

/** One stale doc: Update it with an agent, or Leave it with a reason. */
/** The Library page of each doc kind that has one. */
const DOC_PAGE = {
	decisions: "/library/decisions",
	questions: "/library/questions",
	diagrams: "/library/diagrams",
	"test-plans": "/library/test-plans",
	flows: "/library/flows",
	models: "/library/architecture",
} as const;

function StaleDoc({ c }: { c: ChainWarning_Serialize }) {
	const { t } = useI18n();
	const x = t.flow.look.pulls;
	const qc = useQueryClient();
	const { failure, run } = useRun();
	const [reason, setReason] = useState("");
	const name = t.projects.path[c.to as "specs"] ?? c.to;
	const leave = () =>
		void run(async () => {
			await unwrap(commands.codeChainAck(null, c.from, c.to, reason.trim(), true));
			await qc.invalidateQueries({ queryKey: ["code"] });
		});
	return (
		<div className="flex flex-col gap-3">
			{c.to in DOC_PAGE ? (
				<Link
					to={DOC_PAGE[c.to as keyof typeof DOC_PAGE]}
					className="min-h-control self-start font-semibold text-accent-text underline"
				>
					{name}
				</Link>
			) : (
				<span className="font-semibold">{name}</span>
			)}
			<form
				className="flex items-end gap-2.5"
				onSubmit={(e) => {
					e.preventDefault();
					if (reason.trim()) leave();
				}}
			>
				<div className="min-w-0 flex-1">
					<Input
						caption
						label={x.leaveBecause}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</div>
				<DocsUpdate to={c.to} name={name} range="unpushed" primary={x.updateIt} />
				<Button type="submit" disabled={!reason.trim()}>
					{x.leaveIt}
				</Button>
			</form>
			<ErrorNotice error={failure} />
		</div>
	);
}

/** The docs that this push leaves behind (the docs chain of today). */
function StaleDocs() {
	const { t } = useI18n();
	const x = t.flow.look.pulls;
	const chain =
		useQuery({
			queryKey: ["code", "chain-gate", true],
			queryFn: () => unwrap(commands.codeChainGate(true)),
			retry: false,
		}).data ?? [];
	if (chain.length === 0) return null;
	return (
		<Card pad className={`flex flex-col gap-3 ${ATTENTION_FRAME}`}>
			<h2 className="text-20 font-semibold text-n-12">
				{chain.length === 1 ? x.staleOne : format(x.staleMany, { count: chain.length })}
			</h2>
			{chain.map((c) => (
				<StaleDoc key={`${c.from}:${c.to}`} c={c} />
			))}
		</Card>
	);
}

/** A project with no origin: the origin panel of today publishes it. */
function LocalOnly() {
	const { t } = useI18n();
	const origin = useOrigin().data;
	const [open, setOpen] = useState(false);
	if (origin !== null) return null;
	return (
		<Card pad className="flex flex-col gap-3">
			<h2 className="text-20 font-semibold text-n-12">{t.flow.look.pulls.localOnly}</h2>
			<Button className="w-full" aria-expanded={open} onClick={() => setOpen(!open)}>
				{t.flow.look.pulls.publishHost}
			</Button>
			{open ? <OriginPanel /> : null}
		</Card>
	);
}

/** The right column of New pull request. */
export function OpenPullCards() {
	return (
		<>
			<BeforePush />
			<StaleDocs />
			<LocalOnly />
		</>
	);
}
