/** After an action that unmounts the control that had the focus, the focus goes to the title of the feature page. */
export const focusPullTitle = () =>
	void setTimeout(() => document.querySelector<HTMLElement>("[data-run-title]")?.focus(), 0);
