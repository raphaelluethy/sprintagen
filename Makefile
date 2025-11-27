.PHONY: rebuild

rebuild:
	docker compose down -v --remove-orphans
	docker volume prune -f
	docker compose up --build