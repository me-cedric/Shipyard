import { useRouterState } from "@tanstack/react-router";
import { cannedPrompt, itemTypeOf, PROMPT_KINDS, pageItemType } from "@/lib/assistant/prompts";
import { LANGS, useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useShell } from "@/lib/shell";
import { ChatBubbleIcon } from "@/ui/icons";
import { SplitButton } from "@/ui/molecules/split-button";
import type { Action } from "./actions";

/**
 * The one Ask button of the top bar. The main part toggles the assistant panel. The arrow opens the
 * canned prompts of the page: they follow the page, so the arrow stays off on a page with no items.
 */
export function AskSplit({ assistant }: { assistant: Action }) {
	const { t, lang } = useI18n();
	const { promptLang } = usePrefs();
	const { selectedRef, ask, assistantOpen } = useShell();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const type = pageItemType(pathname);
	// The item that the inspector shows, when it is of the page type.
	const subject = type && selectedRef && itemTypeOf(selectedRef) === type ? selectedRef : null;
	const promptLanguage = LANGS.find((l) => l === promptLang) ?? lang;
	return (
		<SplitButton
			label={t.assistant.ask.label}
			icon={<ChatBubbleIcon size={14} />}
			onClick={assistant.run}
			pressed={assistantOpen}
			shortcut={assistant.shortcut}
			moreLabel={t.assistant.ask.menu}
			moreDisabled={!type}
			items={(type ? PROMPT_KINDS[type] : []).map((kind) => ({
				id: kind,
				label: t.assistant.ask[kind],
				onSelect: () =>
					ask(cannedPrompt(promptLanguage, type as NonNullable<typeof type>, kind, subject)),
			}))}
		/>
	);
}
