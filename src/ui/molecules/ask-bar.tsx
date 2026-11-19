import { type FocusEventHandler, type KeyboardEventHandler, type Ref, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Input, type InputProps } from "../atoms/input";
import { MagnifyingGlassIcon } from "../icons";

/**
 * The one bar of the app. It takes the text: the caller answers. `onSubmit` returns `false` to keep
 * the text (an answer shows for it); any other result clears the bar. With `value` the caller owns
 * the text. `large` is the open bar: 64 px, an accent outline and the hint of the Escape key.
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
	large,
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
	large?: boolean;
}) {
	const { t } = useI18n();
	const [own, setOwn] = useState("");
	const text = value ?? own;
	const set = (v: string) => {
		setOwn(v);
		onValueChange?.(v);
	};
	const hint = large ? t.palette.esc : shortcut;
	return (
		<search
			className={`flex items-center gap-2.5 rounded-field bg-surface-1 px-4 text-n-11 shadow-1 ${
				large
					? "min-h-16 text-20 outline-2 outline-accent"
					: "min-h-12 focus-within:outline-2 focus-within:outline-accent"
			}`}
		>
			<MagnifyingGlassIcon size={20} aria-hidden="true" className="shrink-0" />
			<form
				className="flex min-w-0 flex-1 self-stretch"
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
					// The bar shows the focus: the field has no border and no outline of its own.
					className="flex-1 rounded-none border-0 bg-transparent px-0 outline-none"
				/>
			</form>
			{hint ? (
				<span aria-hidden="true" className="shrink-0 font-semibold text-13">
					{hint}
				</span>
			) : null}
		</search>
	);
}
