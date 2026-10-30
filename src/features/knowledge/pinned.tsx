import { useI18n } from "@/lib/i18n";
import { TILE_KINDS, usePins } from "@/lib/knowledge";
import { PlusIcon } from "@/ui/icons";
import { GroupSection } from "@/ui/molecules/group-section";
import { MenuButton } from "@/ui/molecules/menu-button";
import { Tile } from "./dashboards";

/** The slug of the tiles that a person adds on Home, outside any dashboard. */
const HOME = "home";

/**
 * The tiles that the person pinned or added, on Home / My work and Home / Activity (REQ-024). Add
 * tile puts a tile of the catalogue on Home. The pin of a tile removes it.
 */
export function PinnedTiles() {
	const { t } = useI18n();
	const k = t.knowledge.dashboards;
	const { pins, pinned, toggle } = usePins();
	const add = (
		<MenuButton
			label={k.add}
			icon={<PlusIcon size={14} />}
			items={TILE_KINDS.filter((kind) => !pinned({ slug: HOME, id: kind, kind })).map((kind) => ({
				id: kind,
				label: (k.kind as Record<string, string>)[kind] ?? kind,
				onSelect: () => toggle({ slug: HOME, id: kind, kind }),
			}))}
		/>
	);
	if (pins.length === 0) return <div className="px-3 pt-2">{add}</div>;
	return (
		<GroupSection name={k.pinned} count={pins.length}>
			<div className="px-3">{add}</div>
			<ul className="grid grid-cols-3 gap-2 p-3">
				{pins.map((p) => (
					<li key={`${p.slug}/${p.id}`} className="min-w-0">
						<Tile kind={p.kind} person={p.person} pin={{ slug: p.slug, id: p.id }} />
					</li>
				))}
			</ul>
		</GroupSection>
	);
}
