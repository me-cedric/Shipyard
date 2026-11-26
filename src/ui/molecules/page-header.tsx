import { createContext, type ReactNode, useContext, useLayoutEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { MenuButton } from "./menu-button";

export type PageMenuItem = {
	label: string;
	icon?: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	/** Why the item is off. */
	reason?: string;
};

/** The section switch of the place. `claim` tells the shell that a page header draws it; its result releases it. */
export type PageSwitchSlot = { node: ReactNode; claim: () => () => void };
export const PageSwitchContext = createContext<PageSwitchSlot | null>(null);

/** The title row of a page: the way back, the title, the count, context chips, the section switch, one primary action and an overflow menu. */
export function PageHeader({
	title,
	count,
	chips,
	action,
	menu,
	back,
}: {
	/** Not drawn: the title row has no icon tile. */
	icon?: ReactNode;
	title: string;
	count?: number;
	/** Context chips: a ref, a path, a branch. */
	chips?: ReactNode;
	/** The one primary action. */
	action?: ReactNode;
	menu?: PageMenuItem[];
	/** The way back of a sub-page, above the title. */
	back?: ReactNode;
}) {
	const { t } = useI18n();
	const slot = useContext(PageSwitchContext);
	const claim = slot?.claim;
	useLayoutEffect(() => claim?.(), [claim]);
	return (
		<div data-page-header className="flex shrink-0 flex-col px-4 pb-6">
			{back}
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex flex-[1_1_20rem] flex-wrap items-center gap-x-4 gap-y-1">
					<h1 className="text-44 font-semibold text-n-12">{title}</h1>
					{count === undefined ? null : <span className="text-17 text-n-11">{count}</span>}
					{chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
				</div>
				{/* The actions go below the title when the space is small; they never cover it. */}
				<div className="ml-auto flex flex-wrap items-center justify-end gap-4">
					{slot?.node}
					{action}
					{menu?.length ? (
						<MenuButton
							iconOnly
							label={t.ui.more}
							icon={
								<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
									<circle cx="3" cy="8" r="1.25" />
									<circle cx="8" cy="8" r="1.25" />
									<circle cx="13" cy="8" r="1.25" />
								</svg>
							}
							items={menu.map((m) => ({ ...m, id: m.label, onSelect: m.onClick }))}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}
