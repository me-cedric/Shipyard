import { Command } from "cmdk";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Kbd } from "../atoms/kbd";
import { AskBar } from "../molecules/ask-bar";
import { Card } from "../molecules/card";
import { Row } from "../molecules/row";

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
 * The Ask bar. Closed, it is the field of the top row. Open, it covers the page area with one
 * centred column: the field, the answer, then one card with the lists (Go to, Do). The bar is the
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
			// The text of an answer is a question, not a label: each item stays under the answer.
			items: g.items.filter((i) => answered || i.listed || i.label.toLowerCase().includes(q)),
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
			data-ask-layer={open || undefined}
			// Open, the bar covers the page area: the nearest positioned parent, `[data-page-area]`.
			// shortcut: no portal, so the field keeps the focus; use a portal when a parent between the
			// bar and the page area gets a position.
			className={
				open
					? "absolute inset-0 z-20 flex flex-col items-center overflow-y-auto bg-surface-0 px-8 pt-5 pb-10"
					: "relative min-w-0 max-w-[560px] flex-[1_1_320px]"
			}
			// A press on the layer keeps the focus where it is. A field takes the focus.
			onMouseDown={(e) => {
				if (open && !(e.target instanceof HTMLInputElement)) e.preventDefault();
			}}
			onKeyDown={(e) => {
				if (e.key !== "Escape") return;
				close();
				const back = from.current;
				if (back instanceof HTMLElement && back.isConnected) back.focus();
				else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			}}
			onBlur={(e) => {
				// A blur out of the layer closes it.
				if (!e.currentTarget.contains(e.relatedTarget)) {
					setArrowed(false);
					onOpenChange(false);
				}
			}}
		>
			<div className={open ? "flex w-full max-w-[760px] flex-col gap-5" : undefined}>
				<AskBar
					inputRef={inputRef}
					value={text}
					shortcut={shortcut}
					large={open}
					inputProps={{ role: "combobox", "aria-expanded": open, "aria-autocomplete": "list" }}
					onValueChange={(v) => {
						setArrowed(false);
						setPicked("");
						// Typing opens the panel again after an action closed it.
						onOpenChange(true);
						onTextChange(v);
					}}
					onFocus={(e) => {
						// A focus from outside the bar sets the way back. With no element (a shortcut on
						// the page, a click) there is none: an earlier element must not stay.
						if (!e.currentTarget.closest("[cmdk-root]")?.contains(e.relatedTarget))
							from.current = e.relatedTarget;
						onOpenChange(true);
					}}
					onKeyDown={(e) => {
						if (!arrowed && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
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
					<>
						{/* The keys of the answer part stay in it: only Escape goes to the list. */}
						{/* biome-ignore lint/a11y/noStaticElementInteractions: the controls inside take the keys */}
						<div onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}>{answer}</div>
						<Card className="py-2">
							<Command.List>
								{answered ? null : (
									<Command.Empty className="px-6 py-4 text-n-11">{t.palette.empty}</Command.Empty>
								)}
								{visible.map((g) => (
									<Command.Group
										key={g.id}
										heading={g.heading}
										className="[&_[cmdk-group-heading]]:px-6 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-13 [&_[cmdk-group-heading]]:text-n-11"
									>
										{g.items.map((item) => (
											<Row
												key={item.id}
												render={(row) => (
													<Command.Item
														value={item.id}
														onSelect={() => {
															item.onSelect();
															close();
															inputRef.current?.blur();
														}}
														className={cn(
															row.className,
															"cursor-pointer hover:bg-n-2",
															arrowed && "data-[selected=true]:bg-n-3",
														)}
													>
														{row.children}
													</Command.Item>
												)}
											>
												<span aria-hidden="true">{item.icon}</span>
												<span className="flex min-w-0 flex-1 flex-col">
													<span className="font-semibold">{item.label}</span>
													{item.detail ? (
														<span className="truncate text-13 text-n-11">{item.detail}</span>
													) : null}
												</span>
												{item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
												{arrowed && current === item.id ? (
													<span aria-hidden="true" className="font-semibold text-13 text-n-11">
														↵
													</span>
												) : null}
											</Row>
										))}
									</Command.Group>
								))}
							</Command.List>
						</Card>
					</>
				) : null}
			</div>
		</Command>
	);
}
