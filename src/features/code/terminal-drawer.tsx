import { useEffect, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { usePanelSize, usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { IconButton } from "@/ui/atoms/icon-button";
import { CheckIcon, CommandLineIcon, PlusIcon, ViewColumnsIcon, XMarkIcon } from "@/ui/icons";
import { MenuButton } from "@/ui/molecules/menu-button";
import { Splitter } from "@/ui/molecules/splitter";
import { TerminalScreen } from "./terminal";

const DOCKS = ["bottom", "left", "right"] as const;
/** The height at the bottom and the width at a side, in pixels. */
const SIZE = { bottom: [288, 120, 800], side: [480, 240, 1000] } as const;

/**
 * The terminals under every view, in tabs (Q-088). Hiding the drawer keeps the shells; closing a
 * tab ends its shell. The first open starts one shell. One shell for each tab, and the Code / Terminal tab.
 * The drawer docks at the bottom, left or right, and a splitter resizes it. Both choices stay per person.
 */
export function TerminalDrawer({ open, onHide }: { open: boolean; onHide: () => void }) {
	const { t } = useI18n();
	const d = t.panels.terminal;
	const { terminalDock: dock, setPrefs } = usePrefs();
	const side = dock !== "bottom";
	const [fallback, min, max] = SIZE[side ? "side" : "bottom"];
	const panel = usePanelSize(side ? "terminal-width" : "terminal-height", fallback);
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
			style={side ? { width: panel.size } : { height: panel.size }}
			className={cn(
				"relative flex shrink-0 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-2",
				dock === "bottom" && "mx-2 mb-2 max-h-[70vh]",
				dock === "left" && "my-2 ml-2 max-w-[70vw]",
				dock === "right" && "my-2 mr-2 max-w-[70vw]",
			)}
		>
			<Splitter
				label={d.resize}
				value={panel.size}
				min={min}
				max={max}
				vertical={side}
				invert={dock !== "left"}
				onChange={panel.set}
				onReset={panel.reset}
				className={{ bottom: "top-0", left: "inset-y-0 right-0", right: "inset-y-0 left-0" }[dock]}
			/>
			<div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
				<span className="flex text-n-10">
					<CommandLineIcon size={14} />
				</span>
				<div
					role="tablist"
					aria-label={d.title}
					className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
				>
					{tabs.map((n) => (
						<span
							key={n}
							className={cn(
								"inline-flex h-7 min-w-0 shrink-0 items-center rounded-md text-ui",
								n === current ? "bg-surface-3 text-n-12 shadow-1" : "text-n-11 hover:bg-n-3",
							)}
						>
							<button
								type="button"
								role="tab"
								aria-selected={n === current}
								onClick={() => setCurrent(n)}
								title={name(n)}
								className="h-7 max-w-32 truncate px-2.5"
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
				</div>
				<IconButton label={d.add} onClick={add} className="size-7">
					<PlusIcon size={14} />
				</IconButton>
				<MenuButton
					iconOnly
					label={d.dock}
					icon={<ViewColumnsIcon size={14} />}
					items={DOCKS.map((x) => ({
						id: x,
						label: d.docks[x],
						icon: x === dock ? <CheckIcon size={12} /> : undefined,
						onSelect: () => setPrefs({ terminalDock: x }),
					}))}
				/>
				<IconButton label={d.hide} onClick={onHide}>
					<XMarkIcon size={14} />
				</IconButton>
			</div>
			<div className="flex min-h-0 flex-1 flex-col">
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
