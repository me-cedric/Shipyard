import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ChatBubbleIcon, LinkIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { AckDialog, useWithdrawAck } from "./chain-ack";

/**
 * The docs chain over the whole branch: each artifact folder that is stale against its source, since
 * `base`. Each row asks the assistant to bring the folder up to date: a click, never a write. A clean
 * chain says so. The list stays in view and counts the whole branch.
 */
export function ChainWatch({ base }: { base: string }) {
	const { t } = useI18n();
	const { ask } = useShell();
	const w = t.personal.chain;
	const c = t.review.chain;
	const [asking, setAsking] = useState<{ from: string; to: string } | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const withdraw = useWithdrawAck();
	const watch = useQuery({
		queryKey: ["code", "chain-watch", base],
		queryFn: () => unwrap(commands.codeChainWatch(base)),
		retry: false,
	});
	const name = (k: string) => t.projects.path[k as "specs"] ?? k;
	const rows = watch.data?.warnings ?? [];
	const open = rows.filter((r) => !r.ack).length;
	return (
		<Panel
			title={w.title}
			count={open}
			icon={<LinkIcon size={14} />}
			tone={open ? "warning" : undefined}
			className="shrink-0"
			bodyClassName="py-1"
		>
			{watch.error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{String(watch.error)}
				</p>
			) : rows.length === 0 && watch.data ? (
				<p className="px-3 py-2 text-ui text-n-11">{format(w.clean, { base: watch.data.base })}</p>
			) : null}
			<ErrorNotice error={failure} className="px-3 py-2" />
			{rows.map((r) => (
				<div key={`${r.from}:${r.to}`} className="flex flex-col gap-1 px-3 py-2">
					<div className="flex items-center gap-2 text-ui">
						<Badge variant={r.ack ? "neutral" : "warning"}>{name(r.to)}</Badge>
						<span className="min-w-0 flex-1 truncate text-n-11">
							{format(w.stale, { from: name(r.from), count: r.changed.length })}
						</span>
						{r.ack ? (
							<Button
								variant="ghost"
								aria-label={format(c.withdrawName, { name: name(r.to) })}
								onClick={() => void withdraw(r.from, r.to).catch(setFailure)}
							>
								{c.withdraw}
							</Button>
						) : (
							<Button
								variant="ghost"
								aria-label={format(c.acknowledgeName, { name: name(r.to) })}
								onClick={() => setAsking({ from: r.from, to: r.to })}
							>
								{c.acknowledge}
							</Button>
						)}
						<Button
							variant="ghost"
							onClick={() =>
								ask(
									format(w.prompt, {
										to: name(r.to),
										from: name(r.from),
										base: watch.data?.base ?? base,
										paths: r.changed.join(", "),
									}),
								)
							}
						>
							<ChatBubbleIcon size={14} />
							{w.update}
						</Button>
					</div>
					{r.ack ? (
						<p className="truncate text-12 text-n-11" title={r.ack.reason}>
							{format(c.because, { reason: r.ack.reason })}
						</p>
					) : (
						<p className="truncate font-mono text-12 text-n-10" title={r.changed.join(", ")}>
							{r.changed.slice(0, 3).join(", ")}
						</p>
					)}
				</div>
			))}
			{asking ? (
				<AckDialog
					base={watch.data?.base ?? base}
					from={asking.from}
					to={asking.to}
					name={name(asking.to)}
					onClose={() => setAsking(null)}
				/>
			) : null}
		</Panel>
	);
}
