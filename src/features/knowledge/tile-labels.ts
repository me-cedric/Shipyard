import { useI18n } from "@/lib/i18n";
import type { TileLabels } from "@/ui/organisms/tile-card";

export function useTileLabels(): TileLabels {
	const { t } = useI18n();
	const k = t.knowledge.dashboards;
	return {
		table: k.showTable,
		chart: k.showChart,
		pin: k.pin,
		unpin: k.unpin,
		cut: k.cut,
		empty: t.empty.nothing,
		more: t.ui.more,
		charts: t.library.fn.charts,
	};
}

export function useTileName(kind: string): string {
	return (useI18n().t.knowledge.dashboards.kind as Record<string, string>)[kind] ?? kind;
}
