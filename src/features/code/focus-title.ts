/** After an action that unmounts the control that had the focus, the focus goes to the page title. */
export const focusPullTitle = () =>
	void setTimeout(() => document.querySelector<HTMLElement>("h1[data-pull-title]")?.focus(), 0);
