import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Status, StatusDot } from "../atoms/status-dot";
import { Tooltip } from "../atoms/tooltip";
import {
	ArrowDownTrayIcon,
	CheckIcon,
	ChevronRightIcon,
	FolderOpenIcon,
	TrashIcon,
	XMarkIcon,
} from "../icons";

export type ProjectState = "clean" | "changed" | "behind" | "ahead" | "missing";

// One shape for each state of a working copy.
export const STATE_DOT: Record<ProjectState, Status> = {
	clean: "success",
	changed: "warning",
	behind: "info",
	ahead: "active",
	missing: "danger",
};

export type SwitcherProject = { id: string; name: string; state: ProjectState };

const ITEM =
	"flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-n-12 data-[disabled]:opacity-50 data-[highlighted]:bg-n-4";

function Entry({ icon, children }: { icon: ReactNode; children: ReactNode }) {
	return (
		<>
			<span aria-hidden="true" className="flex w-3 justify-center text-n-10">
				{icon}
			</span>
			{children}
		</>
	);
}

/**
 * One control for the projects. Its menu lists them with the state of each working copy, then
 * opens a folder, clones, closes the active project and removes a project from the list. Compact
 * (a collapsed sidebar) shows an icon button that opens the same menu.
 */
export function ProjectSwitcher({
	projects,
	value,
	compact,
	onChange,
	onOpen,
	onClone,
	onClose,
	onRemove,
	className,
}: {
	projects: SwitcherProject[];
	/** The id of the active project, or null when none is open. */
	value: string | null;
	compact?: boolean;
	onChange: (id: string) => void;
	onOpen: () => void;
	onClone: () => void;
	onClose: () => void;
	onRemove: (project: SwitcherProject) => void;
	className?: string;
}) {
	const { t } = useI18n();
	const active = projects.find((p) => p.id === value);
	const trigger = (
		<Menu.Trigger
			// The name holds the visible text, so a voice-control command matches it.
			aria-label={
				compact || !active ? t.projects.switcher : `${t.projects.switcher} ${active.name}`
			}
			className={cn(
				"inline-flex h-row shrink-0 items-center gap-2 rounded-md border border-n-7 bg-n-1 text-ui text-n-12",
				compact ? "w-8 justify-center" : "min-w-24 justify-between px-2",
				className,
			)}
		>
			{compact ? (
				<FolderOpenIcon size={16} />
			) : (
				<>
					<span className="flex min-w-0 items-center gap-2">
						{active ? (
							<StatusDot status={STATE_DOT[active.state]} label={t.projects.state[active.state]} />
						) : null}
						<span className="truncate">{active?.name ?? t.projects.switcher}</span>
					</span>
					<ChevronRightIcon size={12} className="rotate-90 text-n-10" />
				</>
			)}
		</Menu.Trigger>
	);
	return (
		<Menu.Root>
			{compact ? <Tooltip label={t.projects.switcher}>{trigger}</Tooltip> : trigger}
			<Menu.Portal>
				<Menu.Positioner sideOffset={4} className="z-50">
					<Menu.Popup className="min-w-48 rounded-md border border-n-7 bg-n-2 p-1 text-ui transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
						<Menu.RadioGroup value={value ?? ""} onValueChange={(id) => onChange(String(id))}>
							{projects.map((p) => (
								<Menu.RadioItem key={p.id} value={p.id} closeOnClick className={ITEM}>
									<Menu.RadioItemIndicator className="w-3">
										<CheckIcon size={12} />
									</Menu.RadioItemIndicator>
									{p.id === value ? null : <span className="w-3" />}
									<StatusDot status={STATE_DOT[p.state]} label={t.projects.state[p.state]} />
									{p.name}
								</Menu.RadioItem>
							))}
						</Menu.RadioGroup>
						{projects.length ? <Menu.Separator className="my-1 h-px bg-n-6" /> : null}
						<Menu.Item className={ITEM} onClick={onOpen}>
							<Entry icon={<FolderOpenIcon size={12} />}>{t.projects.open}</Entry>
						</Menu.Item>
						<Menu.Item className={ITEM} onClick={onClone}>
							<Entry icon={<ArrowDownTrayIcon size={12} />}>{t.projects.clone}</Entry>
						</Menu.Item>
						<Menu.Item className={ITEM} disabled={!active} onClick={onClose}>
							<Entry icon={<XMarkIcon size={12} />}>{t.projects.close}</Entry>
						</Menu.Item>
						{projects.length ? (
							<Menu.SubmenuRoot>
								<Menu.SubmenuTrigger className={ITEM}>
									<Entry icon={<TrashIcon size={12} />}>
										<span className="flex-1">{t.projects.remove}</span>
									</Entry>
									<ChevronRightIcon size={12} className="text-n-10" />
								</Menu.SubmenuTrigger>
								<Menu.Portal>
									<Menu.Positioner sideOffset={4} className="z-50">
										<Menu.Popup className="min-w-40 rounded-md border border-n-7 bg-n-2 p-1 text-ui">
											{projects.map((p) => (
												<Menu.Item key={p.id} className={ITEM} onClick={() => onRemove(p)}>
													{p.name}
												</Menu.Item>
											))}
										</Menu.Popup>
									</Menu.Positioner>
								</Menu.Portal>
							</Menu.SubmenuRoot>
						) : null}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}
