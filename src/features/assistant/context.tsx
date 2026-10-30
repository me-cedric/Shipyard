import { format, useI18n } from "@/lib/i18n";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { BookOpenIcon, XMarkIcon } from "@/ui/icons";
import { RefChip } from "@/ui/molecules/ref-chip";
import type { Assistant } from "./use-assistant";

/** The view, the selected entity and the added refs. A person removes each one before the send. */
export function ContextBar({ a, onOpenRef }: { a: Assistant; onOpenRef: (ref: string) => void }) {
	const { t } = useI18n();
	const refs = a.current?.thread.context.refs ?? [];
	const selected = a.dropped.selected ? null : a.selected;
	const target = selected ?? refs.at(-1) ?? null;
	const remove = (name: string, onClick: () => void) => (
		<IconButton label={format(t.assistant.remove, { name })} className="size-5" onClick={onClick}>
			<XMarkIcon size={12} />
		</IconButton>
	);
	return (
		<div className="flex items-start gap-1 px-3 pt-2 pb-2">
			<ul
				aria-label={t.assistant.context}
				className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
			>
				{a.view && !a.dropped.view ? (
					<li className="inline-flex min-w-0 max-w-full items-center">
						<Badge>
							{t.assistant.view} {a.view}
						</Badge>
						{remove(a.view, () => a.dropContext("view"))}
					</li>
				) : null}
				{selected ? (
					<li className="inline-flex min-w-0 max-w-full items-center">
						<RefChip refId={selected} state="resolved" onOpen={onOpenRef} />
						{remove(selected, () => a.dropContext("selected"))}
					</li>
				) : null}
				{refs.map((r) => (
					<li key={r} className="inline-flex min-w-0 max-w-full items-center">
						<RefChip refId={r} state="resolved" onOpen={onOpenRef} />
						{remove(r, () => void a.removeRef(r))}
					</li>
				))}
			</ul>
			<Button
				variant="ghost"
				className="h-6 px-2 text-12"
				disabled={!target || a.busy}
				onClick={() => target && void a.explain(target)}
			>
				<BookOpenIcon size={14} />
				{t.assistant.explain}
			</Button>
		</div>
	);
}
