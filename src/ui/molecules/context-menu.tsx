import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { type ReactNode, useRef } from "react";
import { Kbd } from "../atoms/kbd";

export type MenuItem = {
	id: string;
	label: string;
	icon?: ReactNode;
	shortcut?: string;
	onSelect: () => void;
};

/**
 * The context menu of a row. It opens on a secondary click and on the context-menu key of the
 * focused row. Each item shows its label and its shortcut, and no other text. Escape closes it and
 * puts the focus back on the row.
 */
export function ContextMenu({ items, children }: { items?: MenuItem[]; children: ReactNode }) {
	const area = useRef<HTMLDivElement>(null);
	const back = useRef<HTMLElement | null>(null);
	if (!items?.length) return <>{children}</>;
	return (
		<BaseContextMenu.Root
			onOpenChange={(open) => {
				if (open) {
					// The focused row, or the first control of the row that the pointer hit.
					const now = document.activeElement;
					back.current =
						now instanceof HTMLElement && area.current?.contains(now)
							? now
							: (area.current?.querySelector<HTMLElement>("button, a, input, [tabindex]") ?? null);
				} else back.current?.focus();
			}}
		>
			<BaseContextMenu.Trigger render={<div ref={area} className="contents" />}>
				{children}
			</BaseContextMenu.Trigger>
			<BaseContextMenu.Portal>
				<BaseContextMenu.Positioner className="z-50">
					<BaseContextMenu.Popup className="min-w-40 rounded-lg border border-n-6 bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring origin-(--transform-origin) data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 p-1 text-ui">
						{items.map((item) => (
							<BaseContextMenu.Item
								key={item.id}
								onClick={item.onSelect}
								className="flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-n-12 data-[highlighted]:bg-n-5"
							>
								{item.icon ? (
									<span aria-hidden="true" className="text-n-10">
										{item.icon}
									</span>
								) : null}
								<span className="flex-1">{item.label}</span>
								{item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
							</BaseContextMenu.Item>
						))}
					</BaseContextMenu.Popup>
				</BaseContextMenu.Positioner>
			</BaseContextMenu.Portal>
		</BaseContextMenu.Root>
	);
}
