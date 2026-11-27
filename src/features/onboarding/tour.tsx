import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { StepBar } from "@/ui/atoms/step-bar";
import { Terms } from "@/ui/molecules/term";
import { ChecklistList, type ItemId } from "./checklist";
import { PermissionList } from "./permissions";
import { closeTour, openTour, useTourOpen } from "./tour-store";

export const STEPS = ["loop", "project", "connect", "ai", "permissions", "run"] as const;
type StepId = (typeof STEPS)[number];

/** The pill style of each stage of a feature, as in Flow: done, current, to do, ready. */
const STAGE_PILL = [
	"bg-n-3 text-n-11",
	"bg-n-3 text-n-11",
	"bg-accent-soft text-accent-text",
	"bg-n-3 text-n-11",
	"bg-success-soft text-success-text",
];

/** The settings that a step offers to make in place (REQ-011). The permissions step has its own list. */
const SETUP_OF: Partial<Record<StepId, ItemId[]>> = {
	project: ["project"],
	connect: ["tracker", "forge"],
	ai: ["ai", "models"],
	run: ["team"],
};

/**
 * The onboarding tour (spec `onboarding`): six steps with a title, one sentence and a picture. It opens by
 * itself once, when the first project is open. Each way to leave it marks it as seen. The Help menu, the
 * palette and Settings / Me open it again.
 */
export function Tour() {
	const { t } = useI18n();
	const o = t.onboarding;
	const f = t.ui.flow;
	const { tourSeen, loaded, setPrefs } = usePrefs();
	const open = useTourOpen();
	const hasProject = Boolean(useActiveProject().data);
	const navigate = useNavigate();
	const [step, setStep] = useState(0);
	const primary = useRef<HTMLButtonElement>(null);
	const path = useRouterState({ select: (s) => s.location.pathname });
	const last = step === STEPS.length - 1;
	const id = STEPS[step] ?? "loop";

	// The shell left: the next shell starts closed.
	useEffect(() => closeTour, []);
	// A link inside the tour (a glossary Manual link) goes to another page: the modal must not stay on top.
	// Before the auto-open effect, so that the first render does not close what it opens.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the route is the trigger
	useEffect(() => closeTour(), [path]);
	useEffect(() => {
		if (loaded && !tourSeen && hasProject) openTour();
	}, [loaded, tourSeen, hasProject]);
	useEffect(() => {
		if (open) setStep(0);
	}, [open]);

	// Skip, Escape, Done and a setup action that calls `closeTour()` all end here.
	const wasOpen = useRef(false);
	useEffect(() => {
		if (wasOpen.current && !open && !tourSeen) setPrefs({ tourSeen: true });
		wasOpen.current = open;
	}, [open, tourSeen, setPrefs]);
	const close = closeTour;
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
		<BaseDialog.Root open={open} onOpenChange={(o) => !o && close()}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="fixed inset-0 z-40 bg-n-1/60 backdrop-blur-sm transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<BaseDialog.Popup
					initialFocus={primary}
					className="fixed top-20 left-1/2 z-50 w-[44rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border-2 border-accent bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
				>
					<div className="flex min-h-95 flex-col gap-5 p-8">
						<span className="sr-only" aria-live="polite">
							{format(o.step, { n: step + 1, total: STEPS.length })}
						</span>
						<StepBar
							total={STEPS.length}
							current={step + 1}
							label={format(o.step, { n: step + 1, total: STEPS.length })}
						/>
						<BaseDialog.Title className="text-30 font-semibold text-n-12">
							{o.steps[id].title}
						</BaseDialog.Title>
						{id === "run" ? (
							<ul className="flex flex-wrap gap-2">
								{[f.idea, f.spec, f.build, f.review, f.ready].map((label, i) => (
									<li
										key={label}
										className={cn(
											"inline-flex h-6.5 items-center rounded-full px-2.5 text-13 font-semibold",
											STAGE_PILL[i],
										)}
									>
										{label}
									</li>
								))}
							</ul>
						) : null}
						<p className="text-17 text-n-12">
							<Terms>{o.steps[id].body}</Terms>
						</p>
						{id === "permissions" ? <PermissionList /> : null}
						{SETUP_OF[id] ? <ChecklistList ids={SETUP_OF[id]} /> : null}
						<div className="mt-auto flex flex-wrap gap-2.5">
							{/* Skip is the way out; Escape does the same. */}
							<BaseDialog.Close render={<Button className="min-h-control" />}>
								{o.skip}
							</BaseDialog.Close>
							{step > 0 ? (
								<Button className="min-h-control" onClick={() => go(step - 1)}>
									{o.back}
								</Button>
							) : null}
							{last ? (
								<>
									<Button
										className="min-h-control"
										onClick={() => {
											close();
											void navigate({ to: "/library/manual" });
										}}
									>
										{o.manual}
									</Button>
									<Button ref={primary} variant="primary" className="min-h-control" onClick={close}>
										{o.done}
									</Button>
								</>
							) : (
								<Button
									ref={primary}
									variant="primary"
									className="min-h-control"
									onClick={() => go(step + 1)}
								>
									{o.next}
								</Button>
							)}
						</div>
					</div>
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
