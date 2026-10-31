import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { PencilIcon, PlusIcon, TrashIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";
import type { Assistant } from "./use-assistant";

/** The threads of the project: switch, create, and rename or delete the open one. */
export function Threads({ a }: { a: Assistant }) {
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
	return (
		<div className="flex flex-col gap-1 border-b p-2">
			<div className="flex items-center gap-1">
				{renaming === null ? (
					<h2 className="min-w-0 flex-1 truncate text-ui font-medium">{title}</h2>
				) : (
					<Input
						label={t.assistant.rename}
						value={renaming}
						onChange={(e) => setRenaming(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void commit();
							if (e.key === "Escape") setRenaming(null);
						}}
						onBlur={() => void commit()}
						autoFocus
					/>
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
		</div>
	);
}
