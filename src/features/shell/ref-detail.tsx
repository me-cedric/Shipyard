import { useI18n } from "@/lib/i18n";
import { openDefault, openUrl, revealPath, useCopy, useMenus } from "@/lib/menus";
import { useBacklinks, useResolvedRef } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { CheckIcon } from "@/ui/icons";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ItemFacts, OpenActions } from "./item-facts";
import { docTarget } from "./ref-page";

/**
 * The inspector content of every ref, one shape: the chip, the title, the path with its preview and
 * last change, the actions, and the backlinks or "Nothing links here".
 */
export function RefDetail({ refId, onOpen }: { refId: string; onOpen: (ref: string) => void }) {
	const resolved = useResolvedRef(refId).data;
	const backlinks = useBacklinks(refId).data ?? [];
	const { refActions } = useShell();
	const { t } = useI18n();
	// A document is its path. Another item shows the place that the index holds, when it has one.
	const place = resolved?.location ?? (refId.startsWith("doc:") ? refId.slice(4) : null);
	const url = place && /^https?:\/\//.test(place) ? place : null;
	const path = url ? null : place;
	const menu = useMenus();
	const { copied, copy } = useCopy();
	// The same table as the right-click menu. Open is the button of `OpenActions`.
	const actions = menu("ref", {
		"open-browser": url ? () => openUrl(url) : undefined,
		reveal: path ? () => revealPath(path) : undefined,
		"open-default": path ? () => openDefault(path) : undefined,
		"copy-ref": () => void copy(refId),
	});
	return (
		<div className="flex flex-col gap-4">
			<RefChip
				refId={refId}
				state={resolved?.state ?? "unresolved"}
				title={resolved?.title ?? undefined}
			/>
			{resolved?.title ? <p className="text-ui font-medium">{resolved.title}</p> : null}
			{path ? (
				<ItemFacts
					path={path}
					docs={docTarget(refId) !== undefined}
					title={resolved?.title ?? undefined}
				/>
			) : null}
			<OpenActions refId={refId} />
			<div className="flex flex-wrap gap-2">
				{actions.map((a) => (
					<Button key={a.id} variant="ghost" onClick={a.onSelect}>
						{a.id === "copy-ref" && copied ? <CheckIcon size={14} /> : null}
						{a.id === "copy-ref" && copied ? t.ui.item.copied : a.label}
					</Button>
				))}
			</div>
			{refActions?.(refId, resolved?.title ?? refId)}
			<BacklinkList
				groups={backlinks.map((g) => ({
					kind: g.kind,
					items: g.items.map((i) => ({ ref: i.source, title: i.title })),
				}))}
				onOpen={onOpen}
			/>
		</div>
	);
}
