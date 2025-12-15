import type {
	AssistantMessageInfo,
	MessageInfo,
	MessagePart,
	ReasoningPart,
	TextPart,
	ToolPart,
	ToolState,
	UserMessageInfo,
} from "./_types";

const DEBUG = process.env.NODE_ENV === "development";

export const log = {
	info: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.log(
				`%c[Chat] %c${label}`,
				"color: #10b981; font-weight: bold",
				"color: #a1a1aa",
				...args,
			);
	},
	success: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.log(
				`%c[Chat] %c✓ ${label}`,
				"color: #10b981; font-weight: bold",
				"color: #22c55e",
				...args,
			);
	},
	warn: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.warn(
				`%c[Chat] %c⚠ ${label}`,
				"color: #10b981; font-weight: bold",
				"color: #eab308",
				...args,
			);
	},
	error: (label: string, ...args: unknown[]) => {
		if (DEBUG)
			console.error(
				`%c[Chat] %c✗ ${label}`,
				"color: #10b981; font-weight: bold",
				"color: #ef4444",
				...args,
			);
	},
	debug: (label: string, data: unknown) => {
		if (DEBUG) {
			console.groupCollapsed(
				`%c[Chat] %c${label}`,
				"color: #10b981; font-weight: bold",
				"color: #6366f1",
			);
			console.log(data);
			console.groupEnd();
		}
	},
};

export function getTextContent(parts: MessagePart[]): string {
	return parts
		.filter((p): p is TextPart => p.type === "text")
		.map((p) => p.text)
		.join("")
		.trim();
}

export function getReasoningContent(parts: MessagePart[]): string {
	return parts
		.filter((p): p is ReasoningPart => p.type === "reasoning")
		.map((p) => p.text)
		.join("")
		.trim();
}

export function getToolCalls(parts: MessagePart[]): ToolPart[] {
	return parts.filter((p): p is ToolPart => p.type === "tool");
}

export function getToolTitle(state: ToolState): string | undefined {
	if (state.status === "completed" || state.status === "running") {
		return state.title;
	}
	return undefined;
}

export function getToolOutput(state: ToolState): string | undefined {
	if (state.status === "completed") {
		return state.output;
	}
	if (state.status === "error") {
		return state.error;
	}
	return undefined;
}

export function getToolPreview(state: ToolState): string | undefined {
	if (state.status === "completed" && state.metadata?.preview) {
		return state.metadata.preview as string;
	}
	return undefined;
}

export function isUserMessage(info: MessageInfo): info is UserMessageInfo {
	return info.role === "user";
}

export function isAssistantMessage(
	info: MessageInfo,
): info is AssistantMessageInfo {
	return info.role === "assistant";
}

export function renderMarkdown(text: string): React.ReactNode {
	const parts = text.split(/(\*\*[^*]+\*\*|\n- |\n\*\*[^*]+:\*\*)/g);

	return parts.map((part, i) => {
		const key = `${i}-${part.slice(0, 10)}`;
		if (part.startsWith("**") && part.endsWith("**")) {
			return (
				<strong className="text-foreground" key={key}>
					{part.slice(2, -2)}
				</strong>
			);
		}
		if (part === "\n- ") {
			return <span key={key}>{"\n• "}</span>;
		}
		return <span key={key}>{part}</span>;
	});
}

export function formatTimestamp(timestamp?: string): string {
	if (!timestamp) return "";
	try {
		return new Date(timestamp).toLocaleString();
	} catch {
		return timestamp;
	}
}
