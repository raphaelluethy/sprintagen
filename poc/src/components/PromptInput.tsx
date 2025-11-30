import { useState } from "react";

interface PromptInputProps {
	onSubmit: (text: string) => void;
	isLoading: boolean;
}

export function PromptInput({ onSubmit, isLoading }: PromptInputProps) {
	const [input, setInput] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (input.trim() && !isLoading) {
			onSubmit(input.trim());
			setInput("");
		}
	};

	return (
		<form onSubmit={handleSubmit} className="mb-6">
			<div className="flex gap-2">
				<textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ask OpenCode anything... (e.g., 'Explain how this app works')"
					className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
					rows={3}
					disabled={isLoading}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							handleSubmit(e);
						}
					}}
				/>
				<button
					type="submit"
					disabled={!input.trim() || isLoading}
					className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
				>
					{isLoading ? "Sending..." : "Send"}
				</button>
			</div>
			<div className="text-xs text-gray-500 mt-1">
				Press Cmd/Ctrl + Enter to send
			</div>
		</form>
	);
}
