"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/trpc/react";

interface CreateTicketDialogProps {
	onSuccess?: () => void;
}

export function CreateTicketDialog({ onSuccess }: CreateTicketDialogProps) {
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<
		"low" | "medium" | "high" | "urgent"
	>("medium");
	const [assignee, setAssignee] = useState("");

	const utils = api.useUtils();

	const createMutation = api.ticket.create.useMutation({
		onSuccess: () => {
			setOpen(false);
			setTitle("");
			setDescription("");
			setPriority("medium");
			setAssignee("");
			void utils.ticket.list.invalidate();
			onSuccess?.();
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;

		createMutation.mutate({
			title: title.trim(),
			description: description.trim() || undefined,
			priority,
			assignee: assignee.trim() || undefined,
		});
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm">New Ticket</Button>
			</DialogTrigger>
			<DialogContent className="border-border/40 bg-background sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="font-semibold text-lg">
						Create New Ticket
					</DialogTitle>
				</DialogHeader>
				<form className="mt-4 space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<label
							className="text-muted-foreground text-xs uppercase tracking-wider"
							htmlFor="title"
						>
							Title
						</label>
						<Input
							className="h-10"
							id="title"
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Enter ticket title..."
							required
							value={title}
						/>
					</div>

					<div className="space-y-2">
						<label
							className="text-muted-foreground text-xs uppercase tracking-wider"
							htmlFor="description"
						>
							Description
						</label>
						<Textarea
							className="min-h-[100px] resize-none"
							id="description"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Describe the ticket..."
							value={description}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label
								className="text-muted-foreground text-xs uppercase tracking-wider"
								htmlFor="priority"
							>
								Priority
							</label>
							<Select
								onValueChange={(v) => setPriority(v as typeof priority)}
								value={priority}
							>
								<SelectTrigger className="h-10">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="low">Low</SelectItem>
									<SelectItem value="medium">Medium</SelectItem>
									<SelectItem value="high">High</SelectItem>
									<SelectItem value="urgent">Urgent</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<label
								className="text-muted-foreground text-xs uppercase tracking-wider"
								htmlFor="assignee"
							>
								Assignee
							</label>
							<Input
								className="h-10"
								id="assignee"
								onChange={(e) => setAssignee(e.target.value)}
								placeholder="Assignee name..."
								value={assignee}
							/>
						</div>
					</div>

					<div className="flex justify-end gap-2 pt-4">
						<Button
							onClick={() => setOpen(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={!title.trim() || createMutation.isPending}
							type="submit"
						>
							{createMutation.isPending ? "Creating..." : "Create Ticket"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
