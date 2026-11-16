import { Command } from "cmdk";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Kbd } from "../atoms/kbd";
import { AskBar } from "../molecules/ask-bar";

export type PaletteItem = {
	id: string;
	label: string;
	icon?: ReactNode;
	shortcut?: string;
	/** A line under the label, such as the snippet of a search hit. */
	detail?: ReactNode;
	/** The host chose this item for the text, so the label filter does not apply. */
	listed?: boolean;
	onSelect: () => void;
};
export type PaletteGroup = { id: string; heading: string; items: PaletteItem[] };

/**
 * The Ask bar and the one panel under it: the answer, then the lists (Go to, Do). The bar is the
 * input of the list. Arrow keys move in the list and Enter runs the item that an arrow chose. With
 * no chosen item, Enter sends the text to `onSubmit`. adr:0023 spec:app-redesign#REQ-004
 */
export function CommandPalette({
	open,
	onOpenChange,
	groups,
	answer,
	answered,
	text,
	onTextChange,
	onSubmit,
	inputRef,
	shortcut,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	groups: PaletteGroup[];
	/** The answer part, above the lists. */
	answer?: ReactNode;
	/** The answer part names a result: the list shows no empty text under it. */
	answered?: boolean;
	text: string;
	onTextChange: (text: string) => void;
	onSubmit: (text: string) => unknown;
	inputRef: RefObject<HTMLInputElement | null>;
	shortcut?: string;
}) {
	const { t } = useI18n();
	// The list picks its first item alone: it shows and runs only after an arrow key.
	const [arrowed, setArrowed] = useState(false);
	const [picked, setPicked] = useState("");
	const from = useRef<Element | null>(null);
	const q = text.trim().toLowerCase();
	// We filter here so each heading counts the items that are visible.
	const visible = groups
		.map((g) => ({
			...g,
			items: g.items.filter((i) => i.listed || i.label.toLowerCase().includes(q)),
		}))
		.filter((g) => g.items.length > 0);
	// The list does not search by itself, so we keep the pick on a visible item.
	const ids = visible.flatMap((g) => g.items.map((i) => i.id));
	const current = ids.includes(picked) ? picked : (ids[0] ?? "");
	// cmdk makes the ids of the list and of each item: the bar points at them (combobox pattern).
	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		const list = el.closest("[cmdk-root]")?.querySelector("[cmdk-list]")?.id;
		const item = el.closest("[cmdk-root]")?.querySelector('[cmdk-item][data-selected="true"]')?.id;
		if (open && arrowed && list) el.setAttribute("aria-controls", list);
		else el.removeAttribute("aria-controls");
		if (open && arrowed && item) el.setAttribute("aria-activedescendant", item);
		else el.removeAttribute("aria-activedescendant");
	});
	const close = () => {
		onTextChange("");
		setArrowed(false);
		onOpenChange(false);
	};

	return (
		<Command
			shouldFilter={false}
			label={t.palette.title}
			value={current}
			onValueChange={setPicked}
			className="relative w-80 max-w-[40vw] shrink"
			onBlur={(e) => {
				// A click inside the panel keeps the focus in the bar: a blur out of it closes the panel.
				if (!e.currentTarget.contains(e.relatedTarget)) {
					setArrowed(false);
					onOpenChange(false);
				}
			}}
		>
			<AskBar
				inputRef={inputRef}
				value={text}
				shortcut={shortcut}
				inputProps={{ role: "combobox", "aria-expanded": open, "aria-autocomplete": "list" }}
				onValueChange={(v) => {
					setArrowed(false);
					setPicked("");
					// Typing opens the panel again after an action closed it.
					onOpenChange(true);
					onTextChange(v);
				}}
				onFocus={(e) => {
					if (e.relatedTarget && !e.currentTarget.parentElement?.contains(e.relatedTarget))
						from.current = e.relatedTarget;
					onOpenChange(true);
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						close();
						const back = from.current;
						if (back instanceof HTMLElement && back.isConnected) back.focus();
						else e.currentTarget.blur();
					} else if (!arrowed && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
						// The first arrow shows the item that the list picked: it does not move.
						e.preventDefault();
						e.stopPropagation();
						setArrowed(true);
						onOpenChange(true);
					} else if (e.key === "Enter" && !arrowed) e.stopPropagation();
				}}
				onSubmit={onSubmit}
			/>
			{open ? (
				// The panel keeps the focus in the bar when a pointer presses it.
				// biome-ignore lint/a11y/noStaticElementInteractions: the keys stay in the bar
				<div
					onMouseDown={(e) => e.preventDefault()}
					className="absolute top-full right-0 z-50 mt-2 flex w-[32rem] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-hidden rounded-xl border border-n-6 bg-surface-3 p-2 shadow-3"
				>
					{answer}
					<Command.List className="max-h-80 overflow-y-auto">
						{answered ? null : (
							<Command.Empty className="px-3 py-4 text-ui text-n-10">
								{t.palette.empty}
							</Command.Empty>
						)}
						{visible.map((g) => (
							<Command.Group
								key={g.id}
								heading={g.heading}
								className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-11 [&_[cmdk-group-heading]]:text-n-10"
							>
								{g.items.map((item) => (
									<Command.Item
										key={item.id}
										value={item.id}
										onSelect={() => {
											item.onSelect();
											close();
											inputRef.current?.blur();
										}}
										className={`flex min-h-control cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-ui text-n-12 hover:bg-n-4 ${arrowed ? "data-[selected=true]:bg-n-5" : ""}`}
									>
										<span aria-hidden="true" className="text-n-10">
											{item.icon}
										</span>
										<span className="flex min-w-0 flex-1 flex-col">
											<span>{item.label}</span>
											{item.detail ? (
												<span className="truncate text-12 text-n-11">{item.detail}</span>
											) : null}
										</span>
										{item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
									</Command.Item>
								))}
							</Command.Group>
						))}
					</Command.List>
				</div>
			) : null}
		</Command>
	);
}
