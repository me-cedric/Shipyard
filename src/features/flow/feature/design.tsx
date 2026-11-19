import { useI18n } from "@/lib/i18n";
import { useBacklinks } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { EmptyState } from "@/ui/molecules/empty-state";
import type { Parts } from "./use-feature";

/** What the design kinds are: the things that a feature can cite. */
const DESIGN = ["adr", "diagram", "model", "api", "data", "flow", "screen"];

/** Design: the decisions, diagrams, screens, API and data that cite the parts of the feature. */
export function Design({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const { openRef } = useShell();
	const found = [
		useBacklinks(parts.ticket ?? null).data,
		useBacklinks(parts.change ?? null).data,
		useBacklinks(parts.run ?? null).data,
		useBacklinks(parts.pr ?? null).data,
	];
	const groups = DESIGN.flatMap((kind) => {
		const items = found.flatMap((g) => g?.find((x) => x.kind === kind)?.items ?? []);
		const seen = [...new Map(items.map((i) => [i.source, i])).values()];
		return seen.length
			? [{ kind, items: seen.map((i) => ({ ref: i.source, title: i.title })) }]
			: [];
	});
	if (!groups.length) return <EmptyState title={t.flow.feature.noDesign} />;
	return <BacklinkList groups={groups} onOpen={openRef} />;
}
