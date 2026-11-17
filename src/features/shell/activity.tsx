import { Link } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useGuard } from "@/features/work/guard";
import { useRunActions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { runHref } from "@/lib/shell";
import { Leave } from "@/ui/atoms/leave";
import { ConfirmButton } from "@/ui/molecules/confirm-button";

const heading = "flex min-h-row items-center border-b px-3 text-12 font-medium text-n-11";

/** The Runs part: each live run with its stop, as on Today. */
export function RunsPart({ live }: { live: { id: string; key: string; title: string }[] }) {
	const { t } = useI18n();
	const { cancel } = useRunActions();
	const { error, run } = useGuard();
	const stopGate = useRights().gate("runs.start");
	const title = format(t.count, { name: t.shell.runs, count: live.length });
	return (
		<section aria-label={t.shell.runs}>
			<Link to="/flow/flow" className={`${heading} text-accent-text hover:underline`}>
				{title}
			</Link>
			{error ? (
				<p role="alert" className="px-3 py-2 text-danger-text">
					{error}
				</p>
			) : null}
			{/* The list stays mounted so the last row can leave; the empty text sits after it. */}
			<ul
				aria-label={t.shell.runs}
				tabIndex={-1}
				className="max-h-60 overflow-y-auto py-1 empty:hidden"
			>
				<AnimatePresence initial={false}>
					{live.map((r) => (
						<Leave as="li" key={r.id} className="flex items-center gap-2.5 px-3 py-1.5">
							<Link
								{...runHref(r.id)}
								className="flex min-w-0 flex-1 items-center gap-2.5 hover:underline"
							>
								<span className="font-mono text-12 text-n-11">{r.key}</span>
								<span className="min-w-0 flex-1 truncate">{r.title}</span>
							</Link>
							<ConfirmButton
								variant="ghost"
								{...stopGate}
								confirm={format(t.factory.machine.confirmStop, { name: r.key })}
								onConfirm={() => void run(() => cancel(r.id))}
							>
								{format(t.factory.machine.stop, { name: r.key })}
							</ConfirmButton>
						</Leave>
					))}
				</AnimatePresence>
			</ul>
			{live.length === 0 ? <p className="px-3 py-3 text-n-10">{t.shell.runsNone}</p> : null}
		</section>
	);
}
