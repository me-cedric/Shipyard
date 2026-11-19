import { format, useI18n } from "@/lib/i18n";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { IconButton } from "@/ui/atoms/icon-button";
import { BookOpenIcon, XMarkIcon } from "@/ui/icons";
import { RefChip } from "@/ui/molecules/ref-chip";
import type { Assistant } from "./use-assistant";

/** The view, the selected entity and the added refs. A person removes each one before the send. */
export function ContextBar({
	a,
	onOpenRef,
	full,
	onAdd,
}: {
	a: Assistant;
	onOpenRef: (ref: string) => void;
	/** The chips of the Ask page: "This screen" in plain words, and Add. Explain is in the tools column. */
	full?: boolean;
	onAdd?: () => void;
}) {
	const { t } = useI18n();
	const refs = a.current?.thread.context.refs ?? [];
	const selected = a.dropped.selected ? null : a.selected;
	const target = selected ?? refs.at(-1) ?? null;
	const remove = (name: string, onClick: () => void) => (
		<IconButton label={format(t.assistant.remove, { name })} onClick={onClick}>
			<XMarkIcon size={12} />
		</IconButton>
	);
	return (
		<div className={full ? "flex" : "flex items-start gap-1 px-3 pt-2 pb-2"}>
			<ul
				aria-label={full ? t.assistant.page.sees : t.assistant.context}
				className={
					full
						? "flex min-w-0 flex-1 flex-wrap items-center gap-2"
						: "flex min-w-0 flex-1 flex-wrap items-center gap-1"
				}
			>
				{a.view && !a.dropped.view ? (
					<li className="inline-flex min-w-0 max-w-full items-center">
						{full ? (
							// Pressed, the screen is in the context: a press takes it out.
							<Chip selected onClick={() => a.dropContext("view")}>
								{t.assistant.page.thisScreen}
							</Chip>
						) : (
							<>
								<Badge>
									{t.assistant.view} {a.view}
								</Badge>
								{remove(a.view, () => a.dropContext("view"))}
							</>
						)}
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
				{full ? (
					<li>
						<Chip disabled={!a.current || a.busy} onClick={onAdd}>
							{t.assistant.page.add}
						</Chip>
					</li>
				) : null}
			</ul>
			{full ? null : (
				<Button
					variant="ghost"
					className="h-6 px-2 text-12"
					disabled={!target || a.busy}
					onClick={() => target && void a.explain(target)}
				>
					<BookOpenIcon size={14} />
					{t.assistant.explain}
				</Button>
			)}
		</div>
	);
}
