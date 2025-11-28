.PHONY: rebuild down

rebuild:
	docker compose down -v --remove-orphans
	docker volume prune -f
	docker compose up --build

down:
	docker compose down -v --remove-orphans
	docker volume prune -f
