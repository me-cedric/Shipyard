import type { ComponentType, ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowsRightLeftIcon,
	BookOpenIcon,
	CheckIcon,
	CodeBracketIcon,
	CpuChipIcon,
	CurrencyIcon,
	DocumentTextIcon,
	FolderOpenIcon,
	InboxIcon,
	PlusIcon,
	SwatchIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import logo from "../../../docs/assets/logo.svg";

type Icon = ComponentType<{ size?: number }>;

/**
 * A small window of the app: the pictures of the tour use the icons and the colour tokens of the
 * app, so they follow the theme and the accent. They are decoration: the sentence of the step says it.
 */
function Frame({ children }: { children: ReactNode }) {
	return (
		<div
			aria-hidden="true"
			className="flex h-60 flex-col overflow-hidden rounded-lg border bg-surface-1"
		>
			<div className="flex h-7 shrink-0 items-center gap-1.5 border-b bg-surface-2 px-3">
				{[0, 1, 2].map((i) => (
					<span key={i} className="size-2 rounded-full bg-n-5" />
				))}
			</div>
			<div className="flex min-h-0 flex-1 items-center justify-center p-6">{children}</div>
		</div>
	);
}

function Tile({ Icon, label, on }: { Icon: Icon; label: string; on?: boolean }) {
	return (
		<div className="flex flex-col items-center gap-2">
			<span
				className={cn(
					"flex size-11 items-center justify-center rounded-lg border bg-surface-2 text-n-11",
					on && "border-accent bg-accent-soft text-accent-text shadow-glow",
				)}
			>
				<Icon size={20} />
			</span>
			<span className="text-12 text-n-11">{label}</span>
		</div>
	);
}

/** The six spaces of the loop, and the arrow back to the start. */
export function LoopPicture() {
	const { t } = useI18n();
	const spaces: [Icon, string][] = [
		[SwatchIcon, t.space.design],
		[DocumentTextIcon, t.space.specs],
		[ViewColumnsIcon, t.space.work],
		[CpuChipIcon, t.space.factory],
		[CodeBracketIcon, t.space.code],
		[BookOpenIcon, t.space.knowledge],
	];
	return (
		<Frame>
			<div className="relative flex w-full max-w-xl flex-col gap-3">
				<div className="relative flex justify-between">
					<span className="absolute top-[22px] right-6 left-6 h-px bg-n-6" />
					{spaces.map(([I, label], i) => (
						<div key={label} className="relative">
							<Tile Icon={I} label={label} on={i === 3} />
						</div>
					))}
				</div>
				<div className="mx-6 flex h-6 items-end justify-center rounded-b-xl border-x border-b border-dashed border-n-7">
					<span className="-mb-2.5 flex size-5 items-center justify-center rounded-full border bg-surface-1 text-n-10">
						<ArrowPathIcon size={12} />
					</span>
				</div>
			</div>
		</Frame>
	);
}

/** The three starts of the first-run page. */
export function ProjectPicture() {
	const { t } = useI18n();
	const p = t.onboarding.picture;
	const starts: [Icon, string][] = [
		[FolderOpenIcon, p.folder],
		[ArrowDownTrayIcon, p.clone],
		[PlusIcon, p.create],
	];
	return (
		<Frame>
			<div className="grid w-full max-w-md grid-cols-3 gap-3">
				{starts.map(([I, label], i) => (
					<div
						key={label}
						className={cn(
							"flex h-24 flex-col justify-between rounded-lg border bg-surface-2 p-3",
							i === 0 && "border-accent bg-accent-soft shadow-glow",
						)}
					>
						<span
							className={cn(
								"flex size-8 items-center justify-center rounded-md bg-n-3 text-n-11",
								i === 0 && "bg-accent text-accent-fg",
							)}
						>
							<I size={16} />
						</span>
						<span className="text-12 font-medium text-n-12">{label}</span>
					</div>
				))}
			</div>
		</Frame>
	);
}

function Node({ Icon, label, chip }: { Icon: Icon; label: string; chip: string }) {
	return (
		<div className="flex w-32 flex-col items-center gap-2 rounded-lg border bg-surface-2 p-3">
			<span className="flex size-9 items-center justify-center rounded-md bg-info-soft text-info-text">
				<Icon size={18} />
			</span>
			<span className="text-12 font-medium text-n-12">{label}</span>
			<span className="rounded-sm bg-n-3 px-1.5 font-mono text-11 text-n-11">{chip}</span>
		</div>
	);
}

function Link() {
	return (
		<div className="relative flex flex-1 items-center justify-center">
			<span className="absolute inset-x-0 top-1/2 border-t border-dashed border-n-7" />
			<span className="relative flex size-6 items-center justify-center rounded-full border bg-surface-1 text-n-10">
				<ArrowsRightLeftIcon size={12} />
			</span>
		</div>
	);
}

/** The issue tracker and the code host, each linked to Shipyard. */
export function ConnectPicture() {
	const { t } = useI18n();
	const p = t.onboarding.picture;
	return (
		<Frame>
			<div className="flex w-full max-w-lg items-center">
				<Node Icon={InboxIcon} label={p.tracker} chip="wi:SHIP-12" />
				<Link />
				<span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-surface-2 shadow-glow">
					<img src={logo} alt="" className="size-9" />
				</span>
				<Link />
				<Node Icon={CodeBracketIcon} label={p.host} chip="pr:42" />
			</div>
		</Frame>
	);
}

/** The AI tools as a choice, and the budget that bounds them. */
export function AiPicture() {
	const { t } = useI18n();
	const p = t.onboarding.picture;
	return (
		<Frame>
			<div className="flex w-full max-w-sm flex-col gap-2">
				{["Claude Code", "Codex"].map((name, i) => (
					<div
						key={name}
						className={cn(
							"flex h-11 items-center gap-3 rounded-lg border bg-surface-2 px-3",
							i === 0 && "border-accent bg-accent-soft",
						)}
					>
						<span className="flex size-6 items-center justify-center rounded-md bg-n-3 text-n-11">
							<CpuChipIcon size={14} />
						</span>
						<span className="flex-1 text-ui font-medium text-n-12">{name}</span>
						{i === 0 ? (
							<span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg">
								<CheckIcon size={12} />
							</span>
						) : (
							<span className="size-5 rounded-full border border-n-7" />
						)}
					</div>
				))}
				<div className="mt-2 flex items-center gap-3 px-1">
					<span className="text-n-10">
						<CurrencyIcon size={14} />
					</span>
					<span className="text-12 text-n-11">{p.budget}</span>
					<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-n-4">
						<span className="block h-full w-2/5 rounded-full bg-success" />
					</span>
					<span className="font-mono text-11 text-n-11">$4 / $10</span>
				</div>
			</div>
		</Frame>
	);
}

/** A ticket on its way through the run states, as in Factory / Runs. */
export function RunPicture() {
	const { t } = useI18n();
	const s = t.sync.runState;
	const steps: [string, Status][] = [
		[s.Planning, "success"],
		[s.Working, "success"],
		[s.SelfReview, "active"],
		[s.PROpen, "idle"],
		[s.Merged, "idle"],
	];
	return (
		<Frame>
			<div className="flex w-full max-w-xl flex-col gap-5">
				<div className="flex items-center gap-2 self-center rounded-lg border bg-surface-2 px-3 py-2 shadow-1">
					<span className="rounded-sm bg-n-3 px-1.5 font-mono text-11 text-n-11">SHIP-12</span>
					<span className="text-ui font-medium text-n-12">{t.onboarding.picture.ticket}</span>
				</div>
				<ol className="relative flex justify-between">
					<span className="absolute top-[9px] right-8 left-8 h-px bg-n-6" />
					{steps.map(([label, status]) => (
						<li key={label} className="relative flex w-24 flex-col items-center gap-2">
							<span
								className={cn(
									"flex size-5 items-center justify-center rounded-full border bg-surface-1",
									status === "active" && "border-accent",
								)}
							>
								<StatusDot status={status} />
							</span>
							<span
								className={cn("text-center text-12", status === "idle" ? "text-n-10" : "text-n-12")}
							>
								{label}
							</span>
						</li>
					))}
				</ol>
			</div>
		</Frame>
	);
}
