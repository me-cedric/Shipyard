import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronRightIcon } from "../icons";
import { Caption } from "./input";

/** `hint` shows in the list only, after the label. */
export type SelectItem = { value: string; label: string; icon?: ReactNode; hint?: string };

export function Select({
	label,
	items,
	value,
	onValueChange,
	disabled,
	caption,
	className,
	placeholder,
}: {
	label: string;
	items: SelectItem[];
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	/** Show the name above the select. */
	caption?: boolean;
	className?: string;
	/** Shown while no item matches `value`. */
	placeholder?: string;
}) {
	const select = (
		<BaseSelect.Root
			items={items}
			disabled={disabled}
			value={value}
			onValueChange={(v) => {
				if (v !== null) onValueChange(v);
			}}
		>
			<BaseSelect.Trigger
				aria-label={label}
				className={cn(
					"inline-flex h-row min-w-24 shrink-0 items-center justify-between gap-2 rounded-md whitespace-nowrap border border-n-7 bg-n-1 px-2 text-ui text-n-12",
					className,
				)}
			>
				<BaseSelect.Value className="min-w-0 truncate" placeholder={placeholder} />
				<BaseSelect.Icon className="rotate-90 text-n-10">
					<ChevronRightIcon size={12} />
				</BaseSelect.Icon>
			</BaseSelect.Trigger>
			<BaseSelect.Portal>
				<BaseSelect.Positioner sideOffset={4} className="z-50">
					<BaseSelect.Popup className="min-w-(--anchor-width) rounded-lg border border-n-6 bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring origin-(--transform-origin) data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 p-1 text-ui">
						<BaseSelect.List>
							{items.map((item) => (
								<BaseSelect.Item
									key={item.value}
									value={item.value}
									className="flex h-row cursor-pointer items-center gap-2 rounded-sm px-2 text-n-12 data-[highlighted]:bg-n-5"
								>
									<BaseSelect.ItemIndicator className="w-3">
										<CheckIcon size={12} />
									</BaseSelect.ItemIndicator>
									{item.icon}
									<BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
									{item.hint ? (
										<span className="ml-auto text-12 text-n-11">{item.hint}</span>
									) : null}
								</BaseSelect.Item>
							))}
						</BaseSelect.List>
					</BaseSelect.Popup>
				</BaseSelect.Positioner>
			</BaseSelect.Portal>
		</BaseSelect.Root>
	);
	return caption ? <Caption label={label}>{select}</Caption> : select;
}
