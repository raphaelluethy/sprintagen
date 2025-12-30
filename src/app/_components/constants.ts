// Priority badges with more visual distinction
export const PRIORITY_STYLES: Record<string, string> = {
	urgent:
		"bg-red-500/15 text-red-400 border border-red-500/30 dark:bg-red-500/10 dark:text-red-400",
	high: "bg-orange-500/15 text-orange-400 border border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400",
	medium:
		"bg-amber-500/15 text-amber-500 border border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400",
	low: "bg-slate-500/15 text-slate-500 border border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-400",
};

// Priority icons for inline display
export const PRIORITY_ICONS: Record<string, string> = {
	urgent: "▲▲",
	high: "▲",
	medium: "●",
	low: "○",
};

// Status badges with color coding for quick scanning
export const STATUS_STYLES: Record<string, string> = {
	open: "bg-blue-500/15 text-blue-400 border border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400",
	in_progress:
		"bg-violet-500/15 text-violet-400 border border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400",
	review:
		"bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-400",
	done: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
	closed:
		"bg-slate-500/15 text-slate-500 border border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-400",
};

// Status icons for inline display
export const STATUS_ICONS: Record<string, string> = {
	open: "○",
	in_progress: "◐",
	review: "◑",
	done: "●",
	closed: "◌",
};

// Provider colors for visual distinction
export const PROVIDER_STYLES: Record<string, string> = {
	jira: "text-blue-400",
	linear: "text-violet-400",
	docker: "text-cyan-400",
	manual: "text-slate-400",
};
