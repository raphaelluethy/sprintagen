export interface Session {
	id: string;
	title?: string;
	createdAt?: string;
}

export interface UserMessageInfo {
	id: string;
	sessionID: string;
	role: "user";
	time: {
		created: number;
	};
	summary?: {
		title?: string;
		body?: string;
		diffs: Array<{
			file: string;
			before: string;
			after: string;
			additions: number;
			deletions: number;
		}>;
	};
	agent: string;
	model: {
		providerID: string;
		modelID: string;
	};
	system?: string;
	tools?: Record<string, boolean>;
}

export interface AssistantMessageInfo {
	id: string;
	sessionID: string;
	role: "assistant";
	time: {
		created: number;
		completed?: number;
	};
	error?: {
		name: string;
		data: Record<string, unknown>;
	};
	parentID: string;
	modelID: string;
	providerID: string;
	mode: string;
	path: {
		cwd: string;
		root: string;
	};
	summary?: boolean;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: {
			read: number;
			write: number;
		};
	};
	finish?: string;
}

export type MessageInfo = UserMessageInfo | AssistantMessageInfo;

export interface TextPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "text";
	text: string;
	synthetic?: boolean;
	ignored?: boolean;
	time?: {
		start: number;
		end?: number;
	};
	metadata?: Record<string, unknown>;
}

export interface ReasoningPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "reasoning";
	text: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end?: number;
	};
}

export interface ToolStatePending {
	status: "pending";
	input: Record<string, unknown>;
	raw: string;
}

export interface ToolStateRunning {
	status: "running";
	input: Record<string, unknown>;
	title?: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
	};
}

export interface ToolStateCompleted {
	status: "completed";
	input: Record<string, unknown>;
	output: string;
	title: string;
	metadata: Record<string, unknown>;
	time: {
		start: number;
		end: number;
		compacted?: number;
	};
}

export interface ToolStateError {
	status: "error";
	input: Record<string, unknown>;
	error: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end: number;
	};
}

export type ToolState =
	| ToolStatePending
	| ToolStateRunning
	| ToolStateCompleted
	| ToolStateError;

export interface ToolPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "tool";
	callID: string;
	tool: string;
	state: ToolState;
	metadata?: Record<string, unknown>;
}

export interface StepStartPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-start";
	snapshot?: string;
}

export interface StepFinishPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-finish";
	reason: string;
	snapshot?: string;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: {
			read: number;
			write: number;
		};
	};
}

export interface FilePart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "file";
	mime: string;
	filename?: string;
	url: string;
}

export type MessagePart =
	| TextPart
	| ReasoningPart
	| ToolPart
	| StepStartPart
	| StepFinishPart
	| FilePart;

export interface OpencodeMessage {
	info: MessageInfo;
	parts: MessagePart[];
}
