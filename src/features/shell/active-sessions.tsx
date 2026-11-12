import { Link } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useMachineSessions, useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { IconButton } from "@/ui/atoms/icon-button";
import { Leave } from "@/ui/atoms/leave";
import { LiveDot } from "@/ui/atoms/live-dot";
import { StopIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** The AI sessions that run on this computer. They are the same sessions as Factory / Sessions. */
export function useLiveSessions() {
	return (useMachineSessions().data ?? []).filter((s) => s.state !== "done");
}

/**
 * The Sessions part of the Activity panel: each session with its stop, and a link to Factory /
 * Sessions.
 */
export function SessionsPart() {
	const { t, lang } = useI18n();
	const p = t.panels.sessions;
	const m = t.factory.machine;
	const live = useLiveSessions();
	const writes = useMachineWrites();
	const [error, setError] = useState<unknown>(null);
	const compact = new Intl.NumberFormat(lang, { notation: "compact" });
	const stop = (pid: number) => {
		setError(null);
		writes.stop(pid).catch((e: unknown) => setError(e));
	};
	return (
		<section aria-label={p.title}>
			<div className="flex min-h-row items-center gap-2 border-b px-3">
				<h3 className="flex-1 text-12 font-medium text-n-11">
					{format(t.count, { name: p.title, count: live.length })}
				</h3>
				<Link
					to="/factory/sessions"
					className="rounded-sm px-1 text-12 text-accent-text hover:underline"
				>
					{p.all}
				</Link>
			</div>
			{error ? <ErrorNotice error={error} className="px-3 py-2 text-danger-text" /> : null}
			{/* The list stays mounted so the last row can leave; the empty text sits after it. */}
			<ul aria-label={p.title} tabIndex={-1} className="max-h-80 overflow-y-auto py-1 empty:hidden">
				<AnimatePresence initial={false}>
					{live.map((s) => {
						const name = `${runnerName(s.runner)} ${s.project}`;
						const pid = s.pid;
						return (
							<Leave as="li" key={s.key} className="flex items-center gap-2.5 px-3 py-1.5">
								<span className="relative flex shrink-0">
									<BrandIcon name={s.runner} size={24} />
									{s.state === "working" ? (
										<LiveDot className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-surface-3" />
									) : null}
								</span>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="flex items-center gap-1.5">
										<span className="truncate text-n-12">{s.project}</span>
										<span className="text-12 text-n-10">
											{m.state[s.state as "idle"] ?? s.state}
										</span>
									</span>
									<span className="truncate font-mono text-11 text-n-11">
										{runnerName(s.runner)} · {s.model}
									</span>
								</span>
								<span className="flex shrink-0 flex-col items-end font-mono text-11 text-n-11">
									<span>{format(p.tokens, { count: compact.format(s.tokens ?? 0) })}</span>
									<span className="text-n-12">${(s.costUsd ?? 0).toFixed(2)}</span>
								</span>
								{pid == null ? null : (
									<IconButton label={format(m.stop, { name })} onClick={() => stop(pid)}>
										<StopIcon size={14} />
									</IconButton>
								)}
							</Leave>
						);
					})}
				</AnimatePresence>
			</ul>
			{live.length === 0 ? <p className="px-3 py-3 text-n-10">{p.none}</p> : null}
		</section>
	);
}
