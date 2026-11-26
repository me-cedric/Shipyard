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
	Squares2X2Icon,
	TrashIcon,
	XMarkIcon,
} from "../icons";
import { MENU_ITEM, MENU_POPUP } from "./menu-button";

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
 * opens a folder, clones, closes the active project and removes a project from the list. The
 * control shows the picture of the project, else the accent square, then the name. Compact (a
 * closed rail) shows the picture alone.
 */
export function ProjectSwitcher({
	projects,
	value,
	picture,
	compact,
	onChange,
	onAll,
	onOpen,
	onClone,
	onClose,
	onRemove,
	className,
}: {
	projects: SwitcherProject[];
	/** The id of the active project, or null when none is open. */
	value: string | null;
	/** The address of the picture of the active project. */
	picture?: string;
	compact?: boolean;
	onChange: (id: string) => void;
	/** Opens the page of all the projects. With none, the menu has no such entry. */
	onAll?: () => void;
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
			aria-label={active ? `${t.projects.switcher} ${active.name}` : t.projects.switcher}
			className={cn(
				"flex min-h-control w-full min-w-0 items-center gap-2.5 rounded-md font-semibold text-n-12",
				compact ? "justify-center" : "px-3",
				className,
			)}
		>
			{picture ? (
				<img src={picture} alt="" className="size-7 shrink-0 rounded-sm object-contain" />
			) : (
				<span aria-hidden="true" className="size-7 shrink-0 rounded-sm bg-accent" />
			)}
			{compact ? null : (
				<>
					<span className="min-w-0 truncate text-17 text-project-name">
						{active?.name ?? t.projects.switcher}
					</span>
					<ChevronRightIcon size={16} className="ml-auto shrink-0 rotate-90 text-n-10" />
				</>
			)}
		</Menu.Trigger>
	);
	return (
		<Menu.Root>
			{compact ? <Tooltip label={t.projects.switcher}>{trigger}</Tooltip> : trigger}
			<Menu.Portal>
				<Menu.Positioner align="start" sideOffset={4} className="z-(--z-popup)">
					<Menu.Popup className={MENU_POPUP}>
						<Menu.RadioGroup value={value ?? ""} onValueChange={(id) => onChange(String(id))}>
							{projects.map((p) => (
								<Menu.RadioItem key={p.id} value={p.id} closeOnClick className={MENU_ITEM}>
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
						{onAll ? (
							<Menu.Item className={MENU_ITEM} onClick={onAll}>
								<Entry icon={<Squares2X2Icon size={12} />}>{t.tabs.home.projects}</Entry>
							</Menu.Item>
						) : null}
						<Menu.Item className={MENU_ITEM} onClick={onOpen}>
							<Entry icon={<FolderOpenIcon size={12} />}>{t.projects.open}</Entry>
						</Menu.Item>
						<Menu.Item className={MENU_ITEM} onClick={onClone}>
							<Entry icon={<ArrowDownTrayIcon size={12} />}>{t.projects.clone}</Entry>
						</Menu.Item>
						<Menu.Item className={MENU_ITEM} disabled={!active} onClick={onClose}>
							<Entry icon={<XMarkIcon size={12} />}>{t.projects.close}</Entry>
						</Menu.Item>
						{projects.length ? (
							<Menu.SubmenuRoot>
								<Menu.SubmenuTrigger className={MENU_ITEM}>
									<Entry icon={<TrashIcon size={12} />}>
										<span className="flex-1">{t.projects.remove}</span>
									</Entry>
									<ChevronRightIcon size={12} className="text-n-10" />
								</Menu.SubmenuTrigger>
								<Menu.Portal>
									<Menu.Positioner sideOffset={4} className="z-(--z-popup)">
										<Menu.Popup className={MENU_POPUP}>
											{projects.map((p) => (
												<Menu.Item key={p.id} className={MENU_ITEM} onClick={() => onRemove(p)}>
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
