/**
 * Repository Analysis Service - stubbed for future Docker/Opencode integration.
 */

export interface RepoAnalysis {
	id: string;
	repoUrl: string;
	files: string[];
	summary: string;
	stackInfo: string;
	potentialOwners: string[];
	analyzedAt: Date;
	status: "pending" | "running" | "completed" | "failed";
	error?: string;
}

export interface RepoFile {
	path: string;
	language: string;
	summary?: string;
	complexity?: number;
}

// TODO: Implement Docker/Opencode integration
export async function startRepoScan(_repoUrl: string): Promise<string> {
	return `scan-${Date.now()}`;
}

export async function getRepoScanResult(
	jobId: string,
): Promise<RepoAnalysis | null> {
	return {
		id: jobId,
		repoUrl: "https://github.com/example/repo",
		files: [],
		summary: "Repository analysis not yet implemented",
		stackInfo: "Unknown",
		potentialOwners: [],
		analyzedAt: new Date(),
		status: "pending",
	};
}

export async function getRepoContextForTicket(_ticketId: string): Promise<
	| {
			files?: string[];
			summary?: string;
			stackInfo?: string;
	  }
	| undefined
> {
	return undefined;
}

export function isRepoAnalysisAvailable(): boolean {
	return !!process.env.DOCKER_SOCKET && !!process.env.OPENCODE_IMAGE;
}
