import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { PencilIcon, PlusIcon, TrashIcon } from "@/ui/icons";
import { Tile } from "@/ui/molecules/tile";
import { Dialog } from "@/ui/organisms/dialog";
import type { Assistant } from "./use-assistant";

/**
 * The threads of the project: switch, create, and rename or delete the open one. `full` is the
 * column of the Ask page: New thread on top, one card per thread, Rename and Delete under the open one.
 */
export function Threads({ a, full }: { a: Assistant; full?: boolean }) {
	const { t } = useI18n();
	const [renaming, setRenaming] = useState<string | null>(null);
	const [confirm, setConfirm] = useState(false);
	const id = a.current?.thread.id;
	const title = a.threads.find((x) => x.id === id)?.title || t.assistant.untitled;
	const commit = async () => {
		if (renaming === null || !id) return;
		const next = renaming.trim();
		setRenaming(null);
		if (next) await a.rename(id, next);
	};
	const field = (
		<Input
			label={t.assistant.rename}
			value={renaming ?? ""}
			onChange={(e) => setRenaming(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") void commit();
				if (e.key === "Escape") setRenaming(null);
			}}
			onBlur={() => void commit()}
			autoFocus
		/>
	);
	const dialog = (
		<Dialog
			open={confirm}
			onOpenChange={setConfirm}
			title={t.assistant.deleteThread}
			actions={
				<Button
					variant="danger"
					onClick={() => {
						setConfirm(false);
						if (id) void a.remove(id);
					}}
				>
					<TrashIcon size={14} />
					{t.assistant.delete}
				</Button>
			}
		>
			<p className="truncate text-ui">{title}</p>
		</Dialog>
	);
	if (full)
		return (
			<div className="flex flex-col gap-2.5">
				<Button variant="primary" onClick={() => void a.create()}>
					{t.assistant.newThread}
				</Button>
				<ul aria-label={t.assistant.threads} className="flex flex-col gap-2.5">
					{a.threads.map((th) => {
						const name = th.title || t.assistant.untitled;
						return (
							<li key={th.id} className="flex flex-col gap-2.5">
								{th.id === id && renaming !== null ? (
									field
								) : (
									<Tile
										label={
											th.id !== id && a.unread(th.id)
												? `${name} (${t.extras.assistant.unread})`
												: name
										}
										selected={th.id === id}
										// A thread is a row of the list, not a big choice tile: the design keeps it one line high.
										className="justify-center px-4 py-2.5 text-ui"
										aria-current={th.id === id ? "true" : undefined}
										onClick={() => void a.select(th.id)}
									/>
								)}
								{th.id === id ? (
									<div className="flex gap-2.5">
										<Button className="flex-1" onClick={() => setRenaming(title)}>
											{t.assistant.rename}
										</Button>
										<Button className="flex-1 text-danger-text" onClick={() => setConfirm(true)}>
											{t.assistant.delete}
										</Button>
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
				{dialog}
			</div>
		);
	return (
		<div className="flex flex-col gap-1 border-b p-2">
			<div className="flex items-center gap-1">
				{renaming === null ? (
					<h2 className="min-w-0 flex-1 truncate text-ui font-medium">{title}</h2>
				) : (
					field
				)}
				<IconButton label={t.assistant.rename} disabled={!id} onClick={() => setRenaming(title)}>
					<PencilIcon size={14} />
				</IconButton>
				<IconButton label={t.assistant.delete} disabled={!id} onClick={() => setConfirm(true)}>
					<TrashIcon size={14} />
				</IconButton>
				<IconButton label={t.assistant.newThread} onClick={() => void a.create()}>
					<PlusIcon size={14} />
				</IconButton>
			</div>
			{/* One thread is the heading already: the tabs show once there is a choice. */}
			{a.threads.length > 1 ? (
				<ul aria-label={t.assistant.threads} className="flex gap-1 overflow-x-auto">
					{a.threads.map((th) => (
						<li key={th.id} className="min-w-0 max-w-40 shrink-0">
							<button
								type="button"
								aria-current={th.id === id ? "true" : undefined}
								onClick={() => void a.select(th.id)}
								className={cn(
									"flex h-row w-full items-center gap-1.5 rounded-sm border border-transparent px-2 text-left text-ui text-n-11 hover:bg-n-3",
									th.id === id && "border-n-6 bg-n-3 text-n-12",
								)}
							>
								<span className="min-w-0 truncate">{th.title || t.assistant.untitled}</span>
								{th.id !== id && a.unread(th.id) ? (
									<span className="size-1.5 shrink-0 rounded-full bg-accent">
										<span className="sr-only">{t.extras.assistant.unread}</span>
									</span>
								) : null}
							</button>
						</li>
					))}
				</ul>
			) : null}
			{dialog}
		</div>
	);
}
