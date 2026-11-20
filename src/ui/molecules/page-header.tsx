import { Menu } from "@base-ui/react/menu";
import { createContext, type ReactNode, useContext, useLayoutEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Tooltip } from "../atoms/tooltip";
import { MENU_ITEM, MENU_POPUP } from "./menu-button";

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
		<div data-page-header className="flex shrink-0 flex-col px-4 pb-3">
			{back}
			<div className="flex flex-wrap items-center gap-4">
				<h1 className="text-44 font-semibold text-n-12">{title}</h1>
				{count === undefined ? null : <span className="text-17 text-n-11">{count}</span>}
				{chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
				<span className="flex-1" />
				{slot?.node}
				{action}
				{menu?.length ? (
					<Menu.Root>
						<Tooltip label={t.ui.more}>
							<Menu.Trigger
								aria-label={t.ui.more}
								className="inline-flex size-(--control-h) items-center justify-center rounded-md text-n-11 hover:bg-n-3 hover:text-n-12"
							>
								<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
									<circle cx="3" cy="8" r="1.25" />
									<circle cx="8" cy="8" r="1.25" />
									<circle cx="13" cy="8" r="1.25" />
								</svg>
							</Menu.Trigger>
						</Tooltip>
						<Menu.Portal>
							<Menu.Positioner align="end" sideOffset={4} className="z-50">
								<Menu.Popup className={MENU_POPUP}>
									{menu.map((m) => (
										<Menu.Item
											key={m.label}
											className={MENU_ITEM}
											disabled={m.disabled}
											title={m.disabled ? m.reason : undefined}
											aria-description={m.disabled ? m.reason : undefined}
											onClick={m.onClick}
										>
											{m.icon ? (
												<span aria-hidden="true" className="flex text-n-10">
													{m.icon}
												</span>
											) : null}
											{m.label}
										</Menu.Item>
									))}
								</Menu.Popup>
							</Menu.Positioner>
						</Menu.Portal>
					</Menu.Root>
				) : null}
			</div>
		</div>
	);
}
