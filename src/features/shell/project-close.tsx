import { useEffect } from "react";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { dropProjectCloseAsk, useProjectCloseAsk } from "@/lib/projects/close-ask";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";

/** The question of a project close while agents work: Cancel, Stop them and close, Keep them working. */
export function ProjectCloseAsk() {
	const { t } = useI18n();
	const m = t.shellFn.close;
	const ask = useProjectCloseAsk();
	const runs = useRuns().data ?? [];
	const keys = ask?.keys ?? [];
	const title = ask?.count === 1 ? m.titleOne : format(m.title, { count: ask?.count ?? 0 });
	// The shell goes away with a question open: the close is cancelled, not left hanging.
	useEffect(() => dropProjectCloseAsk, []);
	return (
		<Dialog
			open={ask !== null}
			onOpenChange={(open) => {
				if (!open) ask?.answer("cancel");
			}}
			title={title}
			closeLabel={m.cancel}
			wide
			actions={
				<>
					<Button className="min-h-control" onClick={() => ask?.answer("stop")}>
						{m.stop}
					</Button>
					<Button variant="primary" className="min-h-control" onClick={() => ask?.answer("keep")}>
						{m.keep}
					</Button>
				</>
			}
		>
			<ul aria-label={title} className="divide-y divide-n-6 rounded-lg border bg-surface-2">
				{keys.slice(0, 5).map((key) => {
					const title = runs.find((r) => r.key === key)?.title;
					return (
						<li key={key} className="px-4 py-3 text-ui font-semibold">
							<span className="font-mono text-12 font-normal text-n-11">{key}</span> {title}
						</li>
					);
				})}
				{keys.length > 5 ? (
					<li className="px-4 py-3 text-ui text-n-11">
						{format(t.home.queueMore, { count: keys.length - 5 })}
					</li>
				) : null}
			</ul>
		</Dialog>
	);
}
