import type { ComponentType } from "react";
import { useI18n } from "@/lib/i18n";
import { useActiveProject, useProjectActions } from "@/lib/projects";
import { FolderOpenIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";

/** A Code view needs an active project. Without one it shows the empty state with one action. */
export function withProject(View: ComponentType): ComponentType {
	return function Gated() {
		const { t } = useI18n();
		const active = useActiveProject().data;
		const { openFolder } = useProjectActions();
		if (active === undefined) return null;
		if (active) return <View />;
		return (
			<div className="p-4">
				<EmptyState
					action={{
						label: t.projects.open,
						icon: <FolderOpenIcon size={14} />,
						onClick: () => void openFolder(),
					}}
				/>
			</div>
		);
	};
}

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
