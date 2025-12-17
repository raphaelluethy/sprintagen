.PHONY: rebuild rebuild-web down

rebuild:
	docker compose down -v --remove-orphans
	docker volume prune -f
	docker compose up --build

# Rebuild only the web service (keeps opencode container and cloned repo intact)
rebuild-web:
	docker compose up --build web

down:
	docker compose down -v --remove-orphans
	docker volume prune -f
