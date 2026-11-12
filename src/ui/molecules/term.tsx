import { Popover } from "@base-ui/react/popover";
import { Fragment, type ReactNode, useId, useRef, useState } from "react";
import { useOpenSetting } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import type { glossaryEn } from "@/lib/i18n/glossary";

export type TermId = keyof typeof glossaryEn.terms;

/**
 * A word of the glossary: a dotted underline, a place in the tab order, and on hover, focus or click
 * one plain sentence with a link to the manual. A popover with a button trigger: the link stays
 * reachable by keyboard (Tab from the word goes to it) and by pointer. The sentence is also the
 * description of the word for a screen reader.
 */
export function Term({ id, children }: { id: TermId; children: ReactNode }) {
	const { t } = useI18n();
	const open = useOpenSetting();
	const [shown, setShown] = useState(false);
	const popup = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const link = useRef<HTMLAnchorElement>(null);
	const sentence = useId();
	// Focus that moves out of the word and of its popup closes it.
	const leave = (next: EventTarget | null) => {
		if (!(popup.current?.contains(next as Node) || trigger.current?.contains(next as Node)))
			setShown(false);
	};
	return (
		<Popover.Root open={shown} onOpenChange={setShown}>
			<Popover.Trigger
				ref={trigger}
				openOnHover
				delay={150}
				aria-describedby={sentence}
				onFocus={() => setShown(true)}
				onBlur={(e) => leave(e.relatedTarget)}
				// The popup sits at the end of the page: Tab from the word goes to its link, by hand.
				onKeyDown={(e) => {
					if (e.key !== "Tab" || e.shiftKey || !link.current) return;
					e.preventDefault();
					link.current.focus();
				}}
				className="cursor-help rounded-sm underline decoration-dotted underline-offset-4"
			>
				{children}
			</Popover.Trigger>
			<span id={sentence} hidden>
				{t.glossary.terms[id]}
			</span>
			<Popover.Portal>
				<Popover.Positioner sideOffset={6} className="z-50">
					<Popover.Popup
						ref={popup}
						initialFocus={false}
						onBlur={(e) => leave(e.relatedTarget)}
						className="flex max-w-64 flex-col gap-1 rounded-md border border-n-6 bg-surface-3 px-2 py-1 text-11 font-normal text-n-12 shadow-2 transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
					>
						<p>{t.glossary.terms[id]}</p>
						<a
							ref={link}
							// Shift+Tab goes back to the word.
							onKeyDown={(e) => {
								if (e.key !== "Tab" || !e.shiftKey) return;
								e.preventDefault();
								trigger.current?.focus();
							}}
							href="/knowledge/manual"
							className="self-start rounded-sm text-accent-text hover:underline"
							onClick={(e) => {
								e.preventDefault();
								open("/knowledge/manual");
							}}
						>
							{t.glossary.manual}
						</a>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}

/** A text with each glossary word marked as a `Term`: the word of the language, with its ending. */
export function Terms({ children }: { children: string }) {
	const { t } = useI18n();
	const w = t.glossary.words;
	const quote = (word: string) =>
		word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]");
	// Longest word first. A word starts a word and takes up to three letters of ending.
	const ids = (Object.keys(w) as TermId[]).sort((a, b) => w[b].length - w[a].length);
	const rule = new RegExp(
		`(?<!\\p{L})((?:${ids.map((id) => quote(w[id])).join("|")})\\p{L}{0,3})(?!\\p{L})`,
		"iu",
	);
	// `split` with one group alternates the text and the word that matched.
	return (
		<>
			{children.split(rule).map((part, i) => {
				const id =
					i % 2 ? ids.find((x) => new RegExp(`^${quote(w[x])}`, "iu").test(part)) : undefined;
				const key = `${i}-${part}`;
				return id ? (
					<Term key={key} id={id}>
						{part}
					</Term>
				) : (
					<Fragment key={key}>{part}</Fragment>
				);
			})}
		</>
	);
}
