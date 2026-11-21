import { useEffect } from "react";
import { format, useI18n } from "@/lib/i18n";
import { dropProjectCloseAsk, useProjectCloseAsk } from "@/lib/projects/close-ask";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";

/** The question of a project close while agents work: Cancel, Stop them and close, Keep them working. */
export function ProjectCloseAsk() {
	const { t } = useI18n();
	const m = t.shellFn.close;
	const ask = useProjectCloseAsk();
	// The shell goes away with a question open: the close is cancelled, not left hanging.
	useEffect(() => dropProjectCloseAsk, []);
	return (
		<Dialog
			open={ask !== null}
			onOpenChange={(open) => {
				if (!open) ask?.answer("cancel");
			}}
			title={ask?.count === 1 ? m.titleOne : format(m.title, { count: ask?.count ?? 0 })}
			closeLabel={m.cancel}
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
			{null}
		</Dialog>
	);
}
