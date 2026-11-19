import { useEffect, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { closeWhatsNew, resetWhatsNew, useWhatsNew } from "@/lib/updates/whats-new";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";
import { MarkdownView } from "@/ui/organisms/markdown-view";

// The changelog ships inside the app, in English and in French. It loads on the first ask.
const CHANGELOG = import.meta.glob("/CHANGELOG*.md", {
	query: "?raw",
	import: "default",
}) as Record<string, () => Promise<string>>;

/** One row for each bullet of the changelog sections: a fix when the bullet or its heading says so. */
export function noteRows(notes: string): { fixed: boolean; text: string }[] {
	let fixed = false;
	const rows: { fixed: boolean; text: string }[] = [];
	for (const line of notes.split("\n")) {
		const heading = /^#{1,6}\s+(.+)$/.exec(line);
		if (heading) fixed = /^(fix|corr)/i.test(heading[1] ?? "");
		const text = /^\s*[-*]\s+(.+)$/.exec(line)?.[1];
		if (text) rows.push({ fixed: fixed || /^(fix|corr)/i.test(text), text });
	}
	return rows;
}

/** The changelog sections of the update, one row for each note, in a dialog. Escape and Close shut it. */
export function WhatsNew() {
	const { t, lang } = useI18n();
	const { current, notes, open } = useWhatsNew();
	useEffect(() => resetWhatsNew, []);
	const rows = noteRows(notes);
	// The text of every version, once the person asks for it.
	const [all, setAll] = useState<string | null>(null);
	const title = format(t.shell.whatsNew.title, { version: current });
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (o) return;
				closeWhatsNew();
				setAll(null);
			}}
			title={title}
		>
			{all ? (
				<div className="max-h-96 overflow-auto">
					<MarkdownView source={all} label={t.shell.whatsNew.all} refs={false} />
				</div>
			) : rows.length ? (
				<ul className="flex max-h-96 flex-col overflow-auto">
					{rows.map((r, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: the notes do not change while the dialog shows
							key={i}
							className="flex min-h-15 items-center gap-3 border-n-6 py-2 [&+&]:border-t"
						>
							<Badge variant={r.fixed ? "neutral" : "accent"}>
								{r.fixed ? t.shell.whatsNew.fixed : t.shell.whatsNew.added}
							</Badge>
							<span className="min-w-0 font-semibold">{r.text}</span>
						</li>
					))}
				</ul>
			) : (
				<p className="text-ui text-n-11">{t.shell.whatsNew.none}</p>
			)}
			<div className="flex min-h-15 items-center gap-3">
				<span className="mr-auto text-n-11">{format(t.shell.version, { version: current })}</span>
				{all ? null : (
					<Button
						onClick={() =>
							void CHANGELOG[lang === "fr" ? "/CHANGELOG.fr.md" : "/CHANGELOG.md"]?.().then(setAll)
						}
					>
						{t.shell.whatsNew.all}
					</Button>
				)}
			</div>
		</Dialog>
	);
}
