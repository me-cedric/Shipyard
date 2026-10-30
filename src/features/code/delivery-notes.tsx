import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useDeliveryNotes } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { GroupSection } from "@/ui/molecules/group-section";
import { MarkdownView } from "@/ui/organisms/markdown-view";

/** The notes of `docs/delivery/impacts` that Legacy wrote: a list and the text of the one that a person opens. */
export function DeliveryNotes() {
	const { t } = useI18n();
	const notes = useDeliveryNotes().data ?? [];
	const [path, setPath] = useState<string | null>(null);
	const text = useQuery({
		queryKey: ["code", "delivery-note", path],
		queryFn: () => unwrap(commands.codeFileRead(path ?? "", null)),
		enabled: path !== null,
	}).data;
	if (notes.length === 0) return null;
	return (
		<GroupSection name={t.workspace.notes.title} count={notes.length}>
			{notes.map((n) => {
				const name = n.date ? `${n.title} · ${n.date}` : n.title;
				return (
					<Button
						key={n.path}
						variant="ghost"
						// The name holds the visible text.
						aria-label={format(t.workspace.notes.open, { title: name })}
						aria-pressed={n.path === path}
						onClick={() => setPath(n.path === path ? null : n.path)}
					>
						{name}
					</Button>
				);
			})}
			{text?.text ? (
				<div className="px-3 py-2">
					<MarkdownView source={text.text} label={t.workspace.notes.title} />
				</div>
			) : null}
		</GroupSection>
	);
}
