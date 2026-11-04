import { useBacklinks, useResolvedRef } from "@/lib/refs";
import { useShell } from "@/lib/shell";
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
	// A document is its path. Another item shows the place that the index holds, when it has one.
	const path = resolved?.location ?? (refId.startsWith("doc:") ? refId.slice(4) : null);
	return (
		<div className="flex flex-col gap-4">
			<RefChip
				refId={refId}
				state={resolved?.state ?? "unresolved"}
				title={resolved?.title ?? undefined}
			/>
			{resolved?.title ? <p className="text-ui font-medium">{resolved.title}</p> : null}
			{path ? <ItemFacts path={path} docs={docTarget(refId) !== undefined} /> : null}
			<OpenActions refId={refId} />
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
