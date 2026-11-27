import { useState } from "react";
import { ApprovalRow } from "@/features/home/inbox/inbox";
import { message, useGuard } from "@/features/work/guard";
import { type ApprovalItem, useInboxActions } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { LinkButton } from "@/ui/atoms/link-button";
import { approvalSentence } from "@/ui/molecules/approval-bar";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { AgentAsk } from "./agent-ask";

/**
 * The approvals that wait for the run of the feature, as one decision (`spec:app-redesign#REQ-013`,
 * picture 003). The rules are those of `ApprovalsQuestion` of the Inbox: the main button sends exactly
 * the effects that show, never a push with force; the box is never remembered; Reject exists only
 * under Each step; each right gate stays.
 */
export function DecisionCard({
	approvals,
	agent,
	summary,
	onNotYet,
}: {
	approvals: ApprovalItem[];
	/** The name of the agent that asks. */
	agent: string;
	/** What the agent did, in one line. */
	summary?: string;
	/** "Not yet" sends and rejects nothing: the caller folds the decision. */
	onNotYet: () => void;
}) {
	const { t } = useI18n();
	const h = t.home;
	const x = t.flow.look.page;
	const act = useInboxActions();
	const { gate } = useRights();
	const { failure, run } = useGuard();
	const [steps, setSteps] = useState<boolean | null>(null);
	const [recipe, setRecipe] = useState(false);
	const first = approvals[0];
	// A push that rewrites history never goes with the main button or the durable permission.
	const plain = approvals.filter((a) => !a.force);
	const ids = plain.map((a) => a.id);
	const reason = plain.flatMap((a) => gate(a.right).reason ?? [])[0];
	const settings = gate("project.settings").reason;
	if (!first) return null;
	const open = steps ?? ids.length === 0;
	const pull = plain.find((a) => a.kind === "open_pr");
	const review = pull !== undefined;
	// What the agent did, in one line: the plan, else the first sentence of the pull request text.
	const said = summary || pull?.detail.split("\n").find((l) => l.trim() && !l.startsWith("#"));
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
		<AgentAsk
			agent={agent}
			who={format(x.ready, { agent })}
			title={review ? x.sendAsk : x.approveAsk}
			lead={
				<>
					{said ? (
						<div className="text-16 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-16 [&_p]:text-16">
							<MarkdownView source={said} label={h.details} refs={false} />
						</div>
					) : null}
					<ul aria-label={h.approvals} className="flex flex-wrap gap-2">
						{approvals.map((a) => (
							<li
								key={a.id}
								id={`approval-${a.id}`}
								className={
									a.force
										? "rounded-full bg-danger-subtle px-2.5 py-0.5 text-13 font-semibold text-danger-text"
										: "rounded-full bg-n-3 px-2.5 py-0.5 text-13 font-semibold text-n-11"
								}
							>
								{approvalSentence(h, a)}
							</li>
						))}
					</ul>
				</>
			}
			actions={
				<>
					<Button onClick={onNotYet}>{h.notYet}</Button>
					{ids.length ? (
						<Button
							id="decision-send"
							variant="primary"
							disabled={!!reason}
							reason={reason}
							onClick={send}
						>
							{review ? x.send : ids.length > 1 ? h.approveAll : h.approve}
						</Button>
					) : null}
				</>
			}
		>
			<div className="-mx-6 flex flex-wrap items-center gap-x-4 border-t border-n-6 px-6 pt-3">
				{ids.length ? (
					<span className="inline-flex min-h-control flex-[1_1_280px] flex-wrap items-center gap-2">
						<Checkbox
							label={format(h.recipe, { recipe: first.workflow })}
							checked={recipe}
							onCheckedChange={setRecipe}
							disabled={!!settings}
						/>
						{settings ? <span className="text-13 text-n-11">{settings}</span> : null}
					</span>
				) : (
					<span className="flex-1" />
				)}
				<LinkButton aria-expanded={open} onClick={() => setSteps(!open)}>
					{h.eachStep}
				</LinkButton>
			</div>
			{open
				? approvals.map((a) => (
						<div key={a.id}>
							<ApprovalRow approval={a} noRun />
						</div>
					))
				: null}
			<ErrorNotice error={failure} />
		</AgentAsk>
	);
}
