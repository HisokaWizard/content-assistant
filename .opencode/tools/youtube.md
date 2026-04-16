# Tool: analyze_youtube_video

Анализирует YouTube видео по URL и возвращает структурированный результат.

## Алгоритм

### Шаг 1: Получить metadata видео
Использовать webfetch для получения страницы видео:
```
https://yewtu.be/api/v1/videos/${videoId}
```
или напрямую из YouTube через oembed:
```
https://www.youtube.com/oembed?url=${youtubeUrl}&format=json
```

### Шаг 2: Получить transcript
Если есть бесплатный API (invidious instances):
```
https://yewtu.be/api/v1/captions?videoId=${videoId}
```

Если не получилось - использовать yt-dlp:
```
!yt-dlp --write-auto-sub --skip-download "${youtubeUrl}" -o /tmp/youtube_transcript
```

### Шаг 3: Определить язык
Проверить язык transcript в metadata

### Шаг 4: Перевести если нужно
Если язык не русский - перевести summary на русский используя LLM

### Шаг 5: Сгенерировать структурированный ответ

## Input

- `youtubeUrl`: обязательно - полная ссылка на YouTube видео

## Output

```
📹 <Название видео>
📺 <Название канала>
⏱ <Длительность>

📝 Summary (2-3 предложения)

🔑 Ключевые тезисы:
1. ...
2. ...
3. ...

👍 Рекомендация: Смотреть / Не смотреть
📊 Оценка: X/10
```

## Важно

- ВСЕГДА использовать этот tool при запросе анализа YouTube видео
- Не пытаться получить transcript через YouTube API напрямую (требует ключ)
- Если transcript недоступен - использовать yt-dlp для скачивания субтитров
- Сохранять результат в памяти, НЕ на диске