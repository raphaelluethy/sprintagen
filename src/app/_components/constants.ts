export const PRIORITY_STYLES: Record<string, string> = {
	urgent: "bg-foreground text-background",
	high: "bg-foreground/80 text-background",
	medium: "bg-secondary text-secondary-foreground",
	low: "bg-secondary/60 text-muted-foreground",
};

export const STATUS_STYLES: Record<string, string> = {
	open: "bg-secondary text-secondary-foreground",
	in_progress: "bg-foreground/10 text-foreground border border-border/60",
	review: "bg-foreground/10 text-foreground border border-border/60",
	done: "bg-secondary/60 text-muted-foreground",
	closed: "bg-secondary/40 text-muted-foreground",
};
