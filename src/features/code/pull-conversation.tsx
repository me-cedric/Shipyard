import { useState } from "react";
import { type PullDetail, useForgeActions } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { Textarea } from "@/ui/atoms/textarea";
import { ChatBubbleIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { useRun } from "./use-run";

/** The comment box with the verdicts. A request for changes needs the text: the call refuses without it. */
function Reply({ number, agent, open }: { number: number; agent: boolean; open: boolean }) {
	const { t } = useI18n();
	const { comment, verdict, close, sendBack } = useForgeActions();
	const { failure, run } = useRun();
	const [body, setBody] = useState("");
	const send = (job: () => Promise<unknown>) =>
		void run(async () => {
			await job();
			setBody("");
		});
	return (
		<div className="flex flex-col gap-2 rounded-lg border bg-surface-1 px-3 py-2 shadow-1">
			<Textarea label={t.forge.comment} value={body} onChange={(e) => setBody(e.target.value)} />
			<div className="flex flex-wrap gap-2">
				<Button onClick={() => send(() => comment(number, body))}>{t.forge.comment}</Button>
				<Button onClick={() => send(() => verdict(number, "approve", body))}>
					{t.forge.approve}
				</Button>
				<Button onClick={() => send(() => verdict(number, "request-changes", body))}>
					{t.forge.requestChanges}
				</Button>
				{agent && open ? (
					<Button onClick={() => send(() => sendBack(number, body))}>{t.forge.sendBack}</Button>
				) : null}
				{open ? (
					<Button variant="danger" onClick={() => send(() => close(number, body))}>
						{t.forge.close}
					</Button>
				) : null}
			</div>
			<ErrorNotice error={failure} className="px-3 py-2" />
		</div>
	);
}

/** The threads, then the Reply box. Wave 11 rebuilds it as a timeline: it works here as before. */
export function Conversation({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	return (
		<>
			<Panel
				title={t.forge.threads}
				count={d.threads.length}
				icon={<ChatBubbleIcon size={14} />}
				flush
			>
				{d.threads.map((th) => (
					<div
						key={th.id}
						className="flex flex-col gap-1 border-b px-3 py-2 text-ui last:border-b-0"
					>
						{th.path ? (
							<p className="font-mono text-12 text-n-11">
								{th.path}
								{th.line ? `:${th.line}` : ""}
							</p>
						) : null}
						{th.comments.map((c) => (
							<p key={c}>{c}</p>
						))}
					</div>
				))}
			</Panel>
			<Reply
				number={d.number}
				agent={d.links.some((l) => l.startsWith("run:"))}
				open={d.state === "open"}
			/>
		</>
	);
}
