import { type FocusEventHandler, type Ref, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Input } from "../atoms/input";

/** The one bar of the app. It only takes the text: the caller answers. */
export function AskBar({
	onSubmit,
	onFocus,
	inputRef,
}: {
	onSubmit: (text: string) => void;
	onFocus?: FocusEventHandler<HTMLInputElement>;
	/** A shortcut focuses the field through this ref. */
	inputRef?: Ref<HTMLInputElement>;
}) {
	const { t } = useI18n();
	const [text, setText] = useState("");
	return (
		<search>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					const v = text.trim();
					if (!v) return;
					onSubmit(v);
					setText("");
				}}
			>
				<Input
					ref={inputRef}
					label={t.ui.ask}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onFocus={onFocus}
					className="min-h-control rounded-lg bg-surface-2 px-4 text-14 shadow-1"
				/>
			</form>
		</search>
	);
}
