import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";
import { PermissionList } from "./permissions";
import { AiPicture, ConnectPicture, LoopPicture, ProjectPicture, RunPicture } from "./pictures";
import { type SetupId, SetupList } from "./setup";
import { closeTour, openTour, useTourOpen } from "./tour-store";

export const STEPS = ["loop", "project", "connect", "ai", "permissions", "run"] as const;
type StepId = (typeof STEPS)[number];

const PICTURE: Record<StepId, () => ReactNode> = {
	loop: () => <LoopPicture />,
	project: () => <ProjectPicture />,
	connect: () => <ConnectPicture />,
	ai: () => <AiPicture />,
	permissions: () => (
		<div className="flex h-60 items-center">
			<div className="w-full">
				<PermissionList />
			</div>
		</div>
	),
	run: () => <RunPicture />,
};

/** The settings that a step offers to make in place (REQ-011). The permissions step has its own list. */
const SETUP_OF: Partial<Record<StepId, SetupId[]>> = {
	project: ["project"],
	connect: ["tracker", "forge"],
	ai: ["ai", "models"],
	run: ["team"],
};

/**
 * The onboarding tour (spec `onboarding`): six steps with a title, one sentence and a picture. It opens by
 * itself once; Close at any step ends it. The Help menu, the palette and Settings / Me open it again.
 */
export function Tour() {
	const { t } = useI18n();
	const o = t.onboarding;
	const { tourSeen, loaded, setPrefs } = usePrefs();
	const open = useTourOpen();
	const navigate = useNavigate();
	const [step, setStep] = useState(0);
	const last = step === STEPS.length - 1;
	const id = STEPS[step] ?? "loop";

	// The shell left: the next shell starts closed.
	useEffect(() => closeTour, []);
	useEffect(() => {
		if (loaded && !tourSeen) openTour();
	}, [loaded, tourSeen]);
	useEffect(() => {
		if (open) setStep(0);
	}, [open]);

	const close = () => {
		closeTour();
		if (!tourSeen) setPrefs({ tourSeen: true });
	};
	const go = (to: number) => setStep(Math.min(STEPS.length - 1, Math.max(0, to)));

	// The arrow keys turn the steps; Escape is the close of the dialog.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
			if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
		};
		// The capture phase: the dialog keeps the keys of its focused button to itself.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [open]);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => !o && close()}
			title={o.steps[id].title}
			wide
			actions={
				<>
					{step > 0 ? (
						<Button variant="ghost" onClick={() => go(step - 1)}>
							{o.back}
						</Button>
					) : null}
					{last ? (
						<>
							<Button
								onClick={() => {
									close();
									void navigate({ to: "/knowledge/manual" });
								}}
							>
								{o.manual}
							</Button>
							<Button variant="primary" onClick={close}>
								{o.done}
							</Button>
						</>
					) : (
						<Button variant="primary" onClick={() => go(step + 1)}>
							{o.next}
						</Button>
					)}
				</>
			}
		>
			<div className="flex flex-col gap-4 pt-1">
				<div
					key={id}
					className="transition-[opacity,translate] duration-(--duration-base) ease-spring starting:translate-y-1 starting:opacity-0"
				>
					{PICTURE[id]()}
				</div>
				<p className="text-14 text-n-11">{o.steps[id].body}</p>
				{SETUP_OF[id] ? <SetupList ids={SETUP_OF[id]} /> : null}
				<div className="flex items-center gap-1.5">
					<span className="sr-only" aria-live="polite">
						{format(o.step, { n: step + 1, total: STEPS.length })}
					</span>
					{STEPS.map((s, i) => (
						<span
							key={s}
							aria-hidden="true"
							className={cn(
								"h-1.5 rounded-full transition-[width,background-color] duration-(--duration-base)",
								i === step ? "w-5 bg-accent" : "w-1.5 bg-n-6",
							)}
						/>
					))}
				</div>
			</div>
		</Dialog>
	);
}
