import { type FormEvent, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { PlusIcon } from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/page-header";
import { TerminalScreen } from "./terminal";
import { TerminalFiles } from "./terminal-files";
import type { ShellHandle } from "./use-terminal";

const TAB =
	"rounded-lg px-3.5 font-medium text-n-11 hover:text-n-12 aria-pressed:bg-surface-3 aria-pressed:text-n-12";

/**
 * Code / Terminal: the files of the project at the left, the shells at the right in tabs, and a
 * command bar. Run types the command into the open shell; Ask an agent hands it to the assistant.
 */
export function TerminalPage() {
	const { t } = useI18n();
	const tp = t.forge.terminalPage;
	const d = t.panels.terminal;
	const { ask } = useShell();
	const [tabs, setTabs] = useState<number[]>([1]);
	const [current, setCurrent] = useState(1);
	const [next, setNext] = useState(2);
	const [command, setCommand] = useState("");
	const handles = useRef(new Map<number, { current: ShellHandle | null }>());
	const handleOf = (n: number) => {
		let h = handles.current.get(n);
		if (!h) {
			h = { current: null };
			handles.current.set(n, h);
		}
		return h;
	};
	const name = (n: number) => format(d.tab, { n });
	const add = () => {
		setTabs([...tabs, next]);
		setCurrent(next);
		setNext(next + 1);
	};
	const close = () => {
		const rest = tabs.filter((n) => n !== current);
		handles.current.delete(current);
		// The last tab never closes empty: a new shell takes its place.
		if (rest.length === 0) {
			setTabs([next]);
			setCurrent(next);
			setNext(next + 1);
		} else {
			setTabs(rest);
			setCurrent(rest.at(-1) ?? 1);
		}
	};
	const run = (e: FormEvent) => {
		e.preventDefault();
		const line = command.trim();
		if (!line) return;
		handleOf(current).current?.run(line);
		setCommand("");
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={t.tabs.code.terminal} />
			<div className="flex flex-wrap items-stretch gap-6 px-4 pb-10">
				<TerminalFiles />
				<div className="canvas-dark flex h-150 min-w-0 flex-[3_1_480px] flex-col overflow-hidden rounded-lg bg-surface-0 text-n-12">
					{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
					<div
						role="group"
						aria-label={tp.tabs}
						className="flex flex-wrap items-center gap-1.5 border-b border-n-6 px-3 py-2.5"
					>
						{tabs.map((n) => (
							<Button
								key={n}
								variant="ghost"
								aria-pressed={n === current}
								className={TAB}
								onClick={() => setCurrent(n)}
							>
								{name(n)}
							</Button>
						))}
						<Button variant="ghost" aria-label={d.add} className={TAB} onClick={add}>
							<PlusIcon size={16} />
						</Button>
						<Button
							variant="ghost"
							className={`${TAB} ml-auto`}
							onClick={() => handleOf(current).current?.clear()}
						>
							{tp.clear}
						</Button>
						<Button variant="ghost" className={TAB} onClick={close}>
							{tp.closeTab}
						</Button>
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
								<TerminalScreen handle={handleOf(n)} />
							</div>
						))}
					</div>
					<form
						onSubmit={run}
						className="flex flex-wrap items-center gap-2.5 border-t border-n-6 p-3"
					>
						<Input
							label={tp.command}
							value={command}
							onChange={(e) => setCommand(e.target.value)}
							className="min-w-40 flex-[1_1_200px] font-mono placeholder:font-sans"
						/>
						<Button type="submit">{tp.run}</Button>
						<Button
							variant="primary"
							onClick={() => {
								if (!command.trim()) return;
								ask(format(tp.askRun, { command: command.trim() }));
								setCommand("");
							}}
						>
							{tp.askAgent}
						</Button>
					</form>
				</div>
			</div>
		</div>
	);
}
