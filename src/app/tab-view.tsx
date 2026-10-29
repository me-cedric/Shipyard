import type { ComponentType } from "react";
import { Inbox } from "@/features/home";
import { Me } from "@/features/settings";
import { type SpaceId, tabLabel } from "@/features/shell";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/ui/molecules/empty-state";

/** Views that a feature owns. The other tabs show the empty state until their capability lands. */
const VIEWS: Partial<Record<string, ComponentType>> = {
	"home/inbox": Inbox,
	"settings/me": Me,
};

export function TabView({ space, tab }: { space: SpaceId; tab: string }) {
	const { t } = useI18n();
	const View = VIEWS[`${space}/${tab}`];
	if (View) return <View />;
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="sr-only">{tabLabel(t, space, tab)}</h1>
			<EmptyState action={{ label: t.noun[space], onClick: () => {} }} />
		</div>
	);
}
