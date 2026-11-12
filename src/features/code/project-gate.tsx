import type { ComponentType } from "react";
import { WithProject } from "@/features/shell/no-project";
import { tabIcon, tabLabel } from "@/features/shell/spaces";
import { useI18n } from "@/lib/i18n";

/** A Code view needs an active project. Without one it shows the shared no-project page, headed by the tab. */
export function withProject(View: ComponentType, tab: string): ComponentType {
	return function Gated() {
		const { t } = useI18n();
		const Icon = tabIcon("code", tab);
		return (
			<WithProject title={tabLabel(t, "code", tab)} icon={Icon && <Icon size={16} />}>
				<View />
			</WithProject>
		);
	};
}

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
