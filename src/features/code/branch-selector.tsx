import { Popover } from "@base-ui/react/popover";
import { useId, useState } from "react";
import { useBranches, useCodeActions } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/atoms/input";
import { ChevronRightIcon, PlusIcon } from "@/ui/icons";
import { useRun } from "./use-run";

type Row = { key: string; label: string; remote: boolean; create: boolean; name: string };

/**
 * The working branch in one selector. One value drives each git action of the project (REQ-011).
 * A filter box narrows the local and the remote branches; a remote one switches to a new local
 * branch that tracks it. A "New branch" row makes a branch from the working branch.
 */
export function BranchSelector() {
	const { t } = useI18n();
	const listId = useId();
	const active = useActiveProject().data;
	const branches = useBranches();
	const { switchBranch, createBranch } = useCodeActions();
	const { error, run } = useRun();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [index, setIndex] = useState(0);
	const all = branches.data ?? [];
	const locals = all.filter((b) => b.kind === "local");
	const head = locals.find((b) => b.is_head);
	if (!(active && head)) return null;
	const short = (n: string) => n.slice(n.indexOf("/") + 1);
	const needle = query.trim();
	const rows: Row[] = [
		...locals.map((b) => ({
			key: b.name,
			label: b.name,
			remote: false,
			create: false,
			name: b.name,
		})),
		// A remote branch with a local twin is the local row; `origin/HEAD` is no branch.
		...all
			.filter(
				(b) =>
					b.kind === "remote" &&
					!b.name.endsWith("/HEAD") &&
					!locals.some((l) => l.name === short(b.name)),
			)
			.map((b) => ({ key: b.name, label: b.name, remote: true, create: false, name: b.name })),
	].filter((r) => r.label.toLowerCase().includes(needle.toLowerCase()));
	if (needle && !locals.some((l) => l.name === needle))
		rows.push({
			key: "new",
			label: format(t.code.newBranch, { name: needle }),
			remote: false,
			create: true,
			name: needle,
		});
	const pick = (r: Row) => {
		setOpen(false);
		void run(() => (r.create ? createBranch(r.name) : switchBranch(r.name)));
	};
	const at = Math.min(index, rows.length - 1);
	const rowId = (i: number) => `${listId}-${i}`;
	return (
		<>
			{error ? (
				<span role="alert" className="truncate text-ui text-danger-text">
					{error}
				</span>
			) : null}
			<Popover.Root
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					setQuery("");
					setIndex(0);
				}}
			>
				<Popover.Trigger
					role="combobox"
					aria-expanded={open}
					aria-label={t.code.branch}
					className="inline-flex h-row min-w-24 shrink-0 items-center justify-between gap-2 rounded-md whitespace-nowrap border border-n-7 bg-n-1 px-2 text-ui text-n-12"
				>
					{head.name}
					<span className="rotate-90 text-n-10">
						<ChevronRightIcon size={12} />
					</span>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
						<Popover.Popup className="w-72 rounded-lg border border-n-6 bg-surface-3 p-1 text-ui shadow-3">
							<Input
								label={t.code.branchFilter}
								type="search"
								aria-controls={listId}
								aria-activedescendant={rows[at] ? rowId(at) : undefined}
								value={query}
								onChange={(e) => {
									setQuery(e.target.value);
									setIndex(0);
								}}
								onKeyDown={(e) => {
									if (e.key === "ArrowDown" || e.key === "ArrowUp") {
										e.preventDefault();
										const step = e.key === "ArrowDown" ? 1 : -1;
										setIndex(Math.min(Math.max(at + step, 0), Math.max(rows.length - 1, 0)));
									} else if (e.key === "Enter" && rows[at]) {
										e.preventDefault();
										pick(rows[at]);
									}
								}}
							/>
							<div
								id={listId}
								role="listbox"
								aria-label={t.code.branch}
								className="mt-1 max-h-64 overflow-y-auto"
							>
								{rows.map((r, i) => (
									// biome-ignore lint/a11y/useKeyWithClickEvents: the filter box owns the keys and names the row with aria-activedescendant
									<div
										key={r.key}
										id={rowId(i)}
										role="option"
										aria-selected={i === at}
										tabIndex={-1}
										onClick={() => pick(r)}
										className={cn(
											"flex h-row w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-n-12 hover:bg-n-5",
											i === at && "bg-n-5",
										)}
									>
										{r.create ? <PlusIcon size={12} /> : null}
										<span className="min-w-0 flex-1 truncate">{r.label}</span>
										{r.remote ? <span className="text-12 text-n-10">{t.code.remote}</span> : null}
									</div>
								))}
							</div>
						</Popover.Popup>
					</Popover.Positioner>
				</Popover.Portal>
			</Popover.Root>
		</>
	);
}
