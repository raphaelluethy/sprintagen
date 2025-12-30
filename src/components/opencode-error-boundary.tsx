"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class OpencodeErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("[OpencodeErrorBoundary] Caught error:", error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<Card className="border-destructive/50">
					<CardContent className="flex flex-col items-center gap-4 py-8">
						<div className="rounded-full bg-destructive/10 p-3">
							<svg
								aria-hidden="true"
								className="h-6 w-6 text-destructive"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
						</div>
						<div className="text-center">
							<h3 className="font-semibold text-lg">Agent Connection Error</h3>
							<p className="text-muted-foreground text-sm">
								{this.state.error?.message ?? "Failed to connect to OpenCode"}
							</p>
						</div>
						<Button
							onClick={() => this.setState({ hasError: false, error: null })}
							variant="outline"
						>
							Try Again
						</Button>
					</CardContent>
				</Card>
			);
		}

		return this.props.children;
	}
}
