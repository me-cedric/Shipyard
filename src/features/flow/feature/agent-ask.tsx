import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";

/**
 * A decision that an agent asks of a person (pictures 003, 024 and 026): the tile of the agent with
 * what it says, the question as the heading, then the answer controls. `lead` shows under the
 * heading and `actions` at its right.
 */
export function AgentAsk({
	agent,
	who,
	soft,
	title,
	lead,
	actions,
	children,
}: {
	/** The name of the agent: its tile shows the first letter. */
	agent: string;
	/** What the agent says: "Builder is ready". */
	who: string;
	/** The agent name is bold and the rest of `who` is plain and muted (picture 024). */
	soft?: boolean;
	title: string;
	lead?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<article
			className={cn(
				"flex min-w-0 flex-col gap-4 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2",
				ATTENTION_FRAME,
			)}
		>
			<p className="flex items-center gap-3 font-semibold text-n-12">
				<Avatar agent name={agent} />
				{soft && who.startsWith(agent) ? (
					<span>
						{agent}
						<span className="ml-2 font-normal text-n-11">{who.slice(agent.length).trim()}</span>
					</span>
				) : (
					who
				)}
			</p>
			<div className="flex flex-wrap items-start gap-4">
				<div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
					{/* tabIndex -1: the focus lands here when the card changes. */}
					<h3 tabIndex={-1} className="text-30 font-semibold text-n-12 outline-none">
						{title}
					</h3>
					{lead}
				</div>
				{actions}
			</div>
			{children}
		</article>
	);
}
