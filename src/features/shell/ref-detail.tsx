import { useBacklinks, useResolvedRef } from "@/lib/refs";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { RefChip } from "@/ui/molecules/ref-chip";

/** The inspector content of a ref: the chip with its state, the title and the backlinks. */
export function RefDetail({ refId, onOpen }: { refId: string; onOpen: (ref: string) => void }) {
	const resolved = useResolvedRef(refId).data;
	const backlinks = useBacklinks(refId).data ?? [];
	return (
		<div className="flex flex-col gap-4">
			<RefChip
				refId={refId}
				state={resolved?.state ?? "unresolved"}
				title={resolved?.title ?? undefined}
			/>
			{resolved?.title ? <p className="text-ui font-medium">{resolved.title}</p> : null}
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
