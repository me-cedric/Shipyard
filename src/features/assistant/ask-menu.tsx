import { Menu } from "@base-ui/react/menu";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	cannedPrompt,
	type ItemType,
	itemTypeOf,
	PROMPT_KINDS,
	pageItemType,
} from "@/lib/assistant/prompts";
import { type Lang, useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { ChatBubbleIcon } from "@/ui/icons";

/** The language of the prompts: the preference, else the language of the interface. */
function usePromptLang(): Lang {
	const { lang } = useI18n();
	const { promptLang } = usePrefs();
	return promptLang === "en" || promptLang === "fr" ? promptLang : lang;
}

const popup =
	"min-w-40 origin-(--transform-origin) rounded-lg border border-n-6 bg-surface-3 p-1 text-ui shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none";
const item =
	"flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-n-12 data-[highlighted]:bg-n-5";

/** The canned prompts of a type. A click puts one in the draft of the assistant: the person reads it and sends it. */
function Items({ type, subject }: { type: ItemType; subject: string | null }) {
	const { t } = useI18n();
	const { ask } = useShell();
	const lang = usePromptLang();
	return PROMPT_KINDS[type].map((kind) => (
		<Menu.Item
			key={kind}
			className={item}
			onClick={() => ask(cannedPrompt(lang, type, kind, subject))}
		>
			{t.assistant.ask[kind]}
		</Menu.Item>
	));
}

/** The Ask menu of the top bar. It follows the page: its prompts cover the items that the page lists. */
export function AskMenu() {
	const { t } = useI18n();
	const { selectedRef } = useShell();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const type = pageItemType(pathname);
	if (!type) return null;
	// The item that the inspector shows, when it is of the page type.
	const subject = selectedRef && itemTypeOf(selectedRef) === type ? selectedRef : null;
	return (
		<Menu.Root>
			<Menu.Trigger render={<Button variant="ghost" aria-label={t.assistant.ask.menu} />}>
				<ChatBubbleIcon size={14} />
				{t.assistant.ask.label}
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner align="end" sideOffset={4} className="z-50">
					<Menu.Popup className={popup}>
						<Items type={type} subject={subject} />
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}

/**
 * Shift+F10 on a focused item opens the Ask menu next to it. An item says what it is in
 * `data-ask`, a ref such as `adr:0007`.
 */
export function AskOnItem() {
	const { t } = useI18n();
	const [target, setTarget] = useState<{ el: HTMLElement; ref: string } | null>(null);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.key === "F10" && e.shiftKey)) return;
			const el = document.activeElement?.closest<HTMLElement>("[data-ask]");
			const ref = el?.dataset.ask;
			if (!el || !ref || !itemTypeOf(ref)) return;
			// The menu of the row stays closed: this key opens the Ask menu.
			e.preventDefault();
			e.stopPropagation();
			setTarget({ el, ref });
		};
		document.addEventListener("keydown", onKey, true);
		return () => document.removeEventListener("keydown", onKey, true);
	}, []);
	const type = target ? itemTypeOf(target.ref) : null;
	if (!target || !type) return null;
	return (
		<Menu.Root
			open
			onOpenChange={(open) => {
				if (!open) {
					target.el.focus();
					setTarget(null);
				}
			}}
		>
			<Menu.Portal>
				<Menu.Positioner anchor={target.el} sideOffset={4} className="z-50">
					<Menu.Popup aria-label={t.assistant.ask.menu} className={popup}>
						<Items type={type} subject={target.ref} />
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}
