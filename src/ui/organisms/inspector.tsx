import { type ReactNode, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { IconButton } from "../atoms/icon-button";
import { XMarkIcon } from "../icons";

/** 320 px side panel. The width change takes 200 ms. */
export function Inspector({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const ref = useRef<HTMLElement>(null);
	// The panel turns inert on close: move the focus out first, so it does not drop to <body>.
	const close = () => {
		if (ref.current?.contains(document.activeElement)) document.querySelector("main")?.focus();
		onClose();
	};
	return (
		<aside
			ref={ref}
			aria-label={title}
			inert={!open}
			data-open={open}
			onKeyDown={(e) => {
				if (e.key === "Escape") close();
			}}
			className="shrink-0 overflow-hidden border-l transition-[width,border-color] duration-(--duration-base) ease-standard data-[open=false]:w-0 data-[open=false]:border-transparent data-[open=true]:w-80"
		>
			<div className="flex h-full w-80 flex-col">
				<div className="flex h-9 items-center justify-between border-b pr-1 pl-3">
					<h2 className="text-ui font-medium">{title}</h2>
					<IconButton label={t.common.close} shortcut="Esc" onClick={close}>
						<XMarkIcon size={14} />
					</IconButton>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
			</div>
		</aside>
	);
}
