import { type FocusEventHandler, type KeyboardEventHandler, type Ref, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Input, type InputProps } from "../atoms/input";
import { Kbd } from "../atoms/kbd";

/**
 * The one bar of the app. It takes the text: the caller answers. `onSubmit` returns `false` to keep
 * the text (an answer shows for it); any other result clears the bar. With `value` the caller owns
 * the text.
 */
export function AskBar({
	onSubmit,
	onFocus,
	onKeyDown,
	inputRef,
	value,
	onValueChange,
	shortcut,
	inputProps,
}: {
	onSubmit: (text: string) => unknown;
	onFocus?: FocusEventHandler<HTMLInputElement>;
	onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
	/** A shortcut focuses the field through this ref. */
	inputRef?: Ref<HTMLInputElement>;
	value?: string;
	onValueChange?: (text: string) => void;
	/** The text of the shortcut that focuses the bar. */
	shortcut?: string;
	/** Extra attributes of the field, such as the combobox attributes of a list. */
	inputProps?: Partial<InputProps>;
}) {
	const { t } = useI18n();
	const [own, setOwn] = useState("");
	const text = value ?? own;
	const set = (v: string) => {
		setOwn(v);
		onValueChange?.(v);
	};
	return (
		<search className="relative">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					const v = text.trim();
					if (!v) return;
					if (onSubmit(v) !== false) set("");
				}}
			>
				<Input
					ref={inputRef}
					label={t.ui.ask}
					value={text}
					onChange={(e) => set(e.target.value)}
					onFocus={onFocus}
					onKeyDown={onKeyDown}
					aria-keyshortcuts={shortcut ? "Meta+K Control+K" : undefined}
					{...inputProps}
					className="min-h-control rounded-lg bg-surface-2 px-4 pr-14 text-14 shadow-1"
				/>
			</form>
			{shortcut ? (
				<Kbd
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
				>
					{shortcut}
				</Kbd>
			) : null}
		</search>
	);
}
