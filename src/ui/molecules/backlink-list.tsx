import { format, useI18n } from "@/lib/i18n";
import { Skeleton } from "../atoms/skeleton";
import { RefChip } from "./ref-chip";

export type BacklinkItem = { ref: string; title?: string | null };
export type BacklinkGroup = { kind: string; items: BacklinkItem[] };

const GHOST_ROWS = [0, 1, 2];

/** The entities that cite an entity, grouped by kind. Each heading shows a count. No citation shows ghost rows. */
export function BacklinkList({
	groups,
	onOpen,
}: {
	groups: BacklinkGroup[];
	onOpen: (ref: string) => void;
}) {
	const { t } = useI18n();
	if (groups.length === 0)
		return (
			<div aria-hidden="true" className="flex flex-col gap-1">
				{GHOST_ROWS.map((i) => (
					<Skeleton key={i} className="h-row" style={{ opacity: 1 - i * 0.25 }} />
				))}
			</div>
		);
	return (
		<div className="flex flex-col gap-3">
			{groups.map((g) => {
				const name = (t.refKind as Record<string, string>)[g.kind] ?? g.kind;
				return (
					<section key={g.kind} aria-label={name}>
						<h3 className="py-1 text-12 font-medium text-n-11">
							{format(t.count, { name, count: g.items.length })}
						</h3>
						<ul className="flex flex-col gap-1">
							{g.items.map((i) => (
								<li key={i.ref}>
									<RefChip
										refId={i.ref}
										state="resolved"
										title={i.title ?? undefined}
										onOpen={onOpen}
									/>
								</li>
							))}
						</ul>
					</section>
				);
			})}
		</div>
	);
}
