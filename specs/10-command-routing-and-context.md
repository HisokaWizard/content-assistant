# Spec 10: Command Routing and Context Separation

## Цель

Разделить контекст для обычного чата и анализа видео.

## Маршрутизация

- В LLM отправляются:
  - обычные текстовые сообщения;
  - `/analyze <youtube_url>`;
  - сообщения с YouTube URL без команды.
- В LLM не отправляются:
  - `/interests`;
  - `/criteria`;
  - `/clear`;
  - `/start`, `/help`.

## Контекстные правила

- `interests` и `criteria` добавляются только в prompt видео-анализа.
- Для обычного текстового чата `interests` и `criteria` не добавляются.

## Очистка

- `/clear` очищает:
  - локальную историю;
  - `interests`;
  - `criteria`;
  - текущие сессии агента.

## Критерии приемки

- [ ] Команды управления не отправляются в LLM.
- [ ] Видео-анализ использует `interests/criteria`.
- [ ] Обычный чат не использует `interests/criteria`.
