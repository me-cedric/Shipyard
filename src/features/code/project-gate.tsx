import type { ComponentType } from "react";
import { WithProject } from "@/features/shell/no-project";
import { useI18n } from "@/lib/i18n";

/** A Code view needs an active project. Without one it shows the shared no-project page. */
export function withProject(View: ComponentType): ComponentType {
	return function Gated() {
		const { t } = useI18n();
		return (
			<WithProject title={t.space.code}>
				<View />
			</WithProject>
		);
	};
}

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
