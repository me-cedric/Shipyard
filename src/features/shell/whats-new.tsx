import { useEffect } from "react";
import { format, useI18n } from "@/lib/i18n";
import { closeWhatsNew, resetWhatsNew, useWhatsNew } from "@/lib/updates/whats-new";
import { Dialog } from "@/ui/organisms/dialog";
import { MarkdownView } from "@/ui/organisms/markdown-view";

/** The changelog sections of the update, in a dialog. Escape and Close shut it. */
export function WhatsNew() {
	const { t } = useI18n();
	const { current, notes, open } = useWhatsNew();
	useEffect(() => resetWhatsNew, []);
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => !o && closeWhatsNew()}
			title={format(t.shell.whatsNew.title, { version: current })}
		>
			{notes ? (
				<div className="max-h-96 overflow-auto">
					<MarkdownView
						source={notes}
						label={format(t.shell.whatsNew.title, { version: current })}
					/>
				</div>
			) : (
				<p className="text-ui text-n-11">{t.shell.whatsNew.none}</p>
			)}
		</Dialog>
	);
}
