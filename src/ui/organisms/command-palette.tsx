import { Dialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { type ReactNode, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { Kbd } from "../atoms/kbd";
import { MagnifyingGlassIcon } from "../icons";

export type PaletteItem = {
	id: string;
	label: string;
	icon?: ReactNode;
	shortcut?: string;
	onSelect: () => void;
};
export type PaletteGroup = { id: string; heading: string; items: PaletteItem[] };

export function CommandPalette({
	open,
	onOpenChange,
	groups,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	groups: PaletteGroup[];
}) {
	const { t } = useI18n();
	const [search, setSearch] = useState("");
	const q = search.trim().toLowerCase();
	// We filter here so each heading counts the items that are visible.
	const visible = groups
		.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
		.filter((g) => g.items.length > 0);

	return (
		<Dialog.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) setSearch("");
				onOpenChange(next);
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-n-1/60 backdrop-blur-sm transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<Dialog.Popup className="fixed top-24 left-1/2 z-50 w-[32rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-n-6 bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
					<Dialog.Title className="sr-only">{t.palette.title}</Dialog.Title>
					<Command shouldFilter={false} label={t.palette.title}>
						<div className="flex items-center gap-2 border-b px-3">
							<span aria-hidden="true" className="text-n-10">
								<MagnifyingGlassIcon size={14} />
							</span>
							<Command.Input
								value={search}
								onValueChange={setSearch}
								placeholder={t.palette.placeholder}
								aria-label={t.palette.placeholder}
								className="h-9 flex-1 bg-transparent text-ui text-n-12 placeholder:text-n-10 focus:outline-none"
							/>
						</div>
						<Command.List className="max-h-80 overflow-y-auto p-1">
							<Command.Empty className="px-3 py-4 text-ui text-n-10">
								{t.palette.empty}
							</Command.Empty>
							{visible.map((g) => (
								<Command.Group
									key={g.id}
									heading={format(t.count, { name: g.heading, count: g.items.length })}
									className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-11 [&_[cmdk-group-heading]]:text-n-10"
								>
									{g.items.map((item) => (
										<Command.Item
											key={item.id}
											value={item.id}
											onSelect={() => {
												item.onSelect();
												setSearch("");
												onOpenChange(false);
											}}
											className="flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-ui text-n-12 data-[selected=true]:bg-n-5"
										>
											<span aria-hidden="true" className="text-n-10">
												{item.icon}
											</span>
											<span className="flex-1">{item.label}</span>
											{item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
										</Command.Item>
									))}
								</Command.Group>
							))}
						</Command.List>
					</Command>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
