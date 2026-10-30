import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Badge } from "../atoms/badge";
import { Tooltip } from "../atoms/tooltip";

export type PageMenuItem = {
	label: string;
	icon?: ReactNode;
	onClick: () => void;
	disabled?: boolean;
};

const ITEM =
	"flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-n-12 data-[disabled]:opacity-50 data-[highlighted]:bg-n-5";

/** The head of a tab: icon, title, count, context chips, one primary action and an overflow menu. */
export function PageHeader({
	icon,
	title,
	count,
	chips,
	action,
	menu,
}: {
	icon?: ReactNode;
	title: string;
	count?: number;
	/** Context chips: a ref, a path, a branch. */
	chips?: ReactNode;
	/** The one primary action. */
	action?: ReactNode;
	menu?: PageMenuItem[];
}) {
	const { t } = useI18n();
	return (
		<div className="flex min-h-14 flex-wrap items-center gap-3 px-4 pt-3 pb-1">
			{icon ? (
				<span
					aria-hidden="true"
					className="relative flex size-8 items-center justify-center rounded-md bg-accent-gradient text-accent-fg shadow-glow"
				>
					{icon}
				</span>
			) : null}
			<h1 className="text-20 font-semibold text-n-12">{title}</h1>
			{count === undefined ? null : (
				<Badge variant="accent" className="font-mono">
					{count}
				</Badge>
			)}
			{chips ? <div className="flex flex-wrap items-center gap-1.5">{chips}</div> : null}
			<span className="flex-1" />
			{action}
			{menu?.length ? (
				<Menu.Root>
					<Tooltip label={t.ui.more}>
						<Menu.Trigger
							aria-label={t.ui.more}
							className="inline-flex size-(--row-h) items-center justify-center rounded-md text-n-11 hover:bg-n-3 hover:text-n-12"
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
							<Menu.Popup className="min-w-40 origin-(--transform-origin) rounded-lg border border-n-6 bg-surface-3 p-1 text-ui shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
								{menu.map((m) => (
									<Menu.Item
										key={m.label}
										className={ITEM}
										disabled={m.disabled}
										onClick={m.onClick}
									>
										<span aria-hidden="true" className="flex w-3 justify-center text-n-10">
											{m.icon}
										</span>
										{m.label}
									</Menu.Item>
								))}
							</Menu.Popup>
						</Menu.Positioner>
					</Menu.Portal>
				</Menu.Root>
			) : null}
		</div>
	);
}
