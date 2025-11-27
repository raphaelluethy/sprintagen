"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// Avoid hydration mismatch
	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return (
			<Button className="h-8 w-8" size="sm" variant="ghost">
				<span className="sr-only">Toggle theme</span>
			</Button>
		);
	}

	return (
		<Button
			className="h-8 w-8"
			onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
			size="sm"
			variant="ghost"
		>
			{theme === "dark" ? (
				<svg
					aria-hidden="true"
					className="h-4 w-4"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<path
						d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			) : (
				<svg
					aria-hidden="true"
					className="h-4 w-4"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<path
						d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
