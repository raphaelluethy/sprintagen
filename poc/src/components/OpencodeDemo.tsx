import { useEffect } from "react";
import { useOpencode } from "../hooks/useOpencode";
import { PromptInput } from "./PromptInput";
import { MessageList } from "./MessageList";

export function OpencodeDemo() {
	const {
		session,
		messages,
		isLoading,
		error,
		sessionStatus,
		createSession,
		sendPrompt,
	} = useOpencode();

	// Create session on mount
	useEffect(() => {
		createSession();
	}, [createSession]);

	return (
		<div className="max-w-6xl mx-auto p-6">
			{/* Header */}
			<div className="mb-8">
				<h1 className="text-4xl font-bold mb-2">OpenCode AI SDK Demo</h1>
				<p className="text-gray-600">
					A POC showcasing the OpenCode SDK with real-time agent interactions
				</p>
			</div>

			{/* Session Info */}
			{session && (
				<div className="bg-gray-100 rounded-lg p-4 mb-6">
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<span className="font-medium">Session ID:</span>{" "}
							<span className="font-mono text-xs">{session.id}</span>
						</div>
						<div>
							<span className="font-medium">Status:</span>{" "}
							<span
								className={`inline-block px-2 py-0.5 rounded text-xs ${
									sessionStatus === "running"
										? "bg-blue-100 text-blue-700"
										: sessionStatus === "error"
											? "bg-red-100 text-red-700"
											: "bg-green-100 text-green-700"
								}`}
							>
								{sessionStatus}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Error Display */}
			{error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
					<div className="font-medium text-red-700 mb-1">Error</div>
					<div className="text-sm text-red-600">{error}</div>
				</div>
			)}

			{/* Prompt Input */}
			{session && <PromptInput onSubmit={sendPrompt} isLoading={isLoading} />}

			{/* Loading State */}
			{!session && !error && (
				<div className="text-center py-8">
					<div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
					<div className="text-gray-600">Initializing OpenCode session...</div>
				</div>
			)}

			{/* Messages */}
			{session && (
				<div>
					<h2 className="text-2xl font-semibold mb-4">Conversation</h2>
					<MessageList messages={messages} sessionStatus={sessionStatus} />
				</div>
			)}

			{/* Instructions */}
			{session && messages.length === 0 && (
				<div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
					<h3 className="font-semibold text-blue-900 mb-3">
						Try these example prompts:
					</h3>
					<ul className="space-y-2 text-sm text-blue-800">
						<li>• "Explain how this React app is structured"</li>
						<li>• "What files are in the src directory?"</li>
						<li>• "Read the package.json file"</li>
						<li>• "Create a simple utility function to format dates"</li>
					</ul>
				</div>
			)}
		</div>
	);
}
