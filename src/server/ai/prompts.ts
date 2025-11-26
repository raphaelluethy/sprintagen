import dedent from "dedent";
import type { ticketMessages, tickets } from "@/server/db/schema";

type Ticket = typeof tickets.$inferSelect;
type TicketMessage = typeof ticketMessages.$inferSelect;

/**
 * Build system prompt for ticket chat assistant
 */
export function buildChatSystemPrompt(ticket: Ticket): string {
	return dedent`
    You are a helpful AI assistant helping developers understand and work on tickets.
    You have access to the following ticket information:

    **Ticket: ${ticket.title}**
    - ID: ${ticket.id}
    - Status: ${ticket.status}
    - Priority: ${ticket.priority}
    - Assignee: ${ticket.assignee ?? "Unassigned"}
    - Labels: ${ticket.labels?.join(", ") || "None"}
    - Provider: ${ticket.provider}

    **Description:**
    ${ticket.description || "No description provided."}

    Help the user understand this ticket, provide implementation suggestions,
    identify potential issues, and answer questions about the work involved.
    Be concise but thorough. Use code examples when helpful.
  `;
}

/**
 * Build user prompt from chat history
 */
export function buildChatUserPrompt(
	messages: Pick<TicketMessage, "role" | "content">[],
	newMessage: string,
): string {
	const history = messages
		.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
		.join("\n\n");

	if (history) {
		return dedent`
      Previous conversation:
      ${history}

      User: ${newMessage}
    `;
	}

	return newMessage;
}

/**
 * Build prompt for generating recommended steps
 */
export function buildRecommendedStepsPrompt(ticket: Ticket): {
	system: string;
	user: string;
} {
	const system = dedent`
    You are an expert software developer helping to break down tickets into actionable steps.
    Analyze the ticket and provide clear, specific implementation steps.
    Consider best practices, potential edge cases, and testing requirements.
    Format your response as a numbered list of steps.
  `;

	const user = dedent`
    Please provide recommended implementation steps for the following ticket:

    **Title:** ${ticket.title}
    **Priority:** ${ticket.priority}
    **Status:** ${ticket.status}

    **Description:**
    ${ticket.description || "No description provided."}

    **Labels:** ${ticket.labels?.join(", ") || "None"}

    Provide a clear, step-by-step implementation guide including:
    1. Initial setup or prerequisites
    2. Core implementation steps
    3. Testing considerations
    4. Documentation updates if needed
  `;

	return { system, user };
}

/**
 * Build prompt for recommending a programmer
 */
export function buildRecommendedProgrammerPrompt(
	ticket: Ticket,
	availableProgrammers: string[],
): {
	system: string;
	user: string;
} {
	const system = dedent`
    You are a team lead helping to assign tickets to the right developer.
    Based on the ticket requirements and the available team members,
    recommend the most suitable person for the job.
    Consider technical skills, domain knowledge, and workload.
  `;

	const user = dedent`
    Please recommend a programmer for the following ticket:

    **Title:** ${ticket.title}
    **Priority:** ${ticket.priority}
    **Labels:** ${ticket.labels?.join(", ") || "None"}

    **Description:**
    ${ticket.description || "No description provided."}

    **Available team members:**
    ${availableProgrammers.map((p) => `- ${p}`).join("\n")}

    Provide your recommendation and brief reasoning.
    Format: "Recommended: [Name] - [Brief reasoning]"
  `;

	return { system, user };
}

/**
 * Build prompt for ranking/scoring tickets
 */
export function buildRankingPrompt(ticketsToRank: Ticket[]): {
	system: string;
	user: string;
} {
	const system = dedent`
    You are an AI assistant that helps prioritize software development tickets.
    Analyze each ticket and provide scores for urgency, impact, and complexity.
    
    Scoring guidelines:
    - Urgency (0-10): How soon does this need to be addressed? Consider deadlines, blockers.
    - Impact (0-10): How much value does completing this provide? Consider users affected, business value.
    - Complexity (0-10): How difficult is this to implement? Higher = more complex.
    - Overall (0-10): Combined priority score for ordering the backlog.

    Return your analysis as a JSON array with the following structure:
    [
      {
        "ticketId": "uuid",
        "urgencyScore": 8,
        "impactScore": 7,
        "complexityScore": 5,
        "overallScore": 7.5,
        "reasoning": "Brief explanation"
      }
    ]
  `;

	const ticketSummaries = ticketsToRank.map(
		(t) => dedent`
    ---
    ID: ${t.id}
    Title: ${t.title}
    Priority: ${t.priority}
    Status: ${t.status}
    Labels: ${t.labels?.join(", ") || "None"}
    Description: ${(t.description || "No description").slice(0, 300)}...
  `,
	);

	const user = dedent`
    Please analyze and score the following tickets for prioritization:

    ${ticketSummaries.join("\n")}

    Provide your analysis as a JSON array. Consider the relative importance
    of each ticket compared to the others in this batch.
  `;

	return { system, user };
}

/**
 * Build prompt for analyzing ticket with repo context (future use)
 */
export function buildRepoContextPrompt(
	ticket: Ticket,
	repoContext?: {
		files?: string[];
		summary?: string;
		stackInfo?: string;
	},
): {
	system: string;
	user: string;
} {
	const system = dedent`
    You are an AI assistant with access to repository context.
    Help analyze how a ticket relates to the codebase and suggest
    which files or components might need changes.
  `;

	const repoSection = repoContext
		? dedent`
      **Repository Context:**
      ${repoContext.summary || ""}
      
      **Stack:** ${repoContext.stackInfo || "Unknown"}
      
      **Relevant Files:**
      ${repoContext.files?.slice(0, 20).join("\n") || "No files available"}
    `
		: "Repository context not available.";

	const user = dedent`
    Analyze this ticket in the context of the repository:

    **Ticket:** ${ticket.title}
    **Description:** ${ticket.description || "No description"}

    ${repoSection}

    Please identify:
    1. Which files/components are likely affected
    2. Potential implementation approach
    3. Any risks or considerations
  `;

	return { system, user };
}
