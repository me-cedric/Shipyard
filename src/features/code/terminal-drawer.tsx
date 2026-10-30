import { useEffect, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { IconButton } from "@/ui/atoms/icon-button";
import { CommandLineIcon, PlusIcon, XMarkIcon } from "@/ui/icons";
import { TerminalScreen } from "./terminal";

/**
 * The terminals under every view, in tabs (Q-088). Hiding the drawer keeps the shells; closing a
 * tab ends its shell. The first open starts one shell. Legacy source:
 * `src/components/terminal-panel.tsx`; Shipyard keeps one shell per tab and the Code / Terminal tab.
 */
export function TerminalDrawer({ open, onHide }: { open: boolean; onHide: () => void }) {
	const { t } = useI18n();
	const d = t.panels.terminal;
	const [tabs, setTabs] = useState<number[]>([]);
	const [current, setCurrent] = useState(0);
	const [next, setNext] = useState(1);
	const add = () => {
		setTabs((all) => [...all, next]);
		setCurrent(next);
		setNext(next + 1);
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: only the first open starts a shell
	useEffect(() => {
		if (open && tabs.length === 0) add();
	}, [open]);
	const close = (n: number) => {
		const rest = tabs.filter((x) => x !== n);
		setTabs(rest);
		if (current === n) setCurrent(rest.at(-1) ?? 0);
		if (rest.length === 0) onHide();
	};
	const name = (n: number) => format(d.tab, { n });
	return (
		<section
			aria-label={d.title}
			hidden={!open}
			className="mx-2 mb-2 flex h-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-2"
		>
			<div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
				<span className="flex text-n-10">
					<CommandLineIcon size={14} />
				</span>
				<div
					role="tablist"
					aria-label={d.title}
					className="flex min-w-0 flex-1 items-center gap-0.5"
				>
					{tabs.map((n) => (
						<span
							key={n}
							className={cn(
								"inline-flex h-7 items-center rounded-md text-ui",
								n === current ? "bg-surface-3 text-n-12 shadow-1" : "text-n-11 hover:bg-n-3",
							)}
						>
							<button
								type="button"
								role="tab"
								aria-selected={n === current}
								onClick={() => setCurrent(n)}
								className="h-7 px-2.5"
							>
								{name(n)}
							</button>
							<IconButton
								label={format(d.close, { name: name(n) })}
								onClick={() => close(n)}
								className="size-6"
							>
								<XMarkIcon size={12} />
							</IconButton>
						</span>
					))}
					<IconButton label={d.add} onClick={add} className="size-7">
						<PlusIcon size={14} />
					</IconButton>
				</div>
				<IconButton label={d.hide} onClick={onHide}>
					<XMarkIcon size={14} />
				</IconButton>
			</div>
			<div className="flex min-h-0 flex-1 flex-col p-2">
				{tabs.map((n) => (
					<div
						key={n}
						role="tabpanel"
						aria-label={name(n)}
						hidden={n !== current}
						className="flex min-h-0 flex-1 flex-col"
					>
						<TerminalScreen />
					</div>
				))}
			</div>
		</section>
	);
}
