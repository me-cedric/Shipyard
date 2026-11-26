import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { useDay } from "@/lib/prefs";
import { useDeliveryNotes } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { MarkdownView } from "@/ui/organisms/markdown-view";

/** The notes of `docs/delivery/impacts` of the project: one card, the open note and a Copy button. */
export function DeliveryNotes() {
	const { t } = useI18n();
	const day = useDay();
	const notes = useDeliveryNotes().data ?? [];
	const [path, setPath] = useState<string | null>(null);
	const open = path ?? notes[0]?.path ?? null;
	const text = useQuery({
		queryKey: ["code", "delivery-note", open],
		queryFn: () => unwrap(commands.codeFileRead(open ?? "", null)),
		enabled: open !== null,
	}).data?.text;
	if (notes.length === 0) return null;
	return (
		<section
			aria-label={t.workspace.notes.title}
			className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface-2 p-5 shadow-2"
		>
			<div className="flex items-center gap-3">
				<h2 className="flex-1 text-13 font-semibold text-n-11">{t.workspace.notes.title}</h2>
				<Button disabled={!text} onClick={() => copyText(text ?? "")}>
					{t.flow.look.impact.copy}
				</Button>
			</div>
			{notes.map((n) => {
				const name = n.date ? `${n.title} · ${day(n.date)}` : n.title;
				return (
					<Button
						key={n.path}
						variant="ghost"
						className="-ml-4.5 self-start"
						// The name holds the visible text.
						aria-label={format(t.workspace.notes.open, { title: name })}
						aria-pressed={n.path === open}
						onClick={() => setPath(n.path)}
					>
						{name}
					</Button>
				);
			})}
			{text ? <MarkdownView source={text} label={t.workspace.notes.title} /> : null}
		</section>
	);
}
