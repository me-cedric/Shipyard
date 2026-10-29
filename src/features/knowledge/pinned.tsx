import { useI18n } from "@/lib/i18n";
import { usePins } from "@/lib/knowledge";
import { GroupSection } from "@/ui/molecules/group-section";
import { Tile } from "./dashboards";

/** The tiles that the person pinned, on Home / My work and Home / Activity (REQ-024). Nothing pinned shows nothing. */
export function PinnedTiles() {
	const { t } = useI18n();
	const { pins } = usePins();
	if (pins.length === 0) return null;
	return (
		<GroupSection name={t.knowledge.dashboards.pinned} count={pins.length}>
			<ul className="grid grid-cols-3 gap-2 p-3">
				{pins.map((p) => (
					<li key={`${p.slug}/${p.id}`} className="min-w-0">
						<Tile kind={p.kind} pin={{ slug: p.slug, id: p.id }} />
					</li>
				))}
			</ul>
		</GroupSection>
	);
}
