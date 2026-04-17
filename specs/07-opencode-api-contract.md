# Spec 07: OpenCode API Contract for Telegram Bot

## Цель

Перевести интеграцию бота на корректные HTTP API OpenCode для сессий и сообщений, без использования `/tui`.

## Контракт API

- `GET /session` — получить список сессий.
- `POST /session` — создать сессию (`{ title? }`).
- `DELETE /session/:id` — удалить сессию.
- `POST /session/:id/message` — отправить сообщение в конкретную сессию.

## Нормализация ответов

- Ответ `POST /session/:id/message` парсится из `parts`.
- Бот извлекает текстовый ответ LLM и отправляет его в Telegram как plain text.

## Ограничения

- `/tui` endpoint не используется как чат-API.
- Все запросы к OpenCode идут через `OPENCODE_URL`.

## Критерии приемки

- [ ] В коде нет вызовов `/tui` как prompt endpoint.
- [ ] Все сообщения отправляются в `/session/:id/message`.
- [ ] Сессии создаются/удаляются через `/session` API.
