# Cascade Builder — Mixed-Run Чеклист (боевой)

Цель: быстро и одинаково проверять сценарий, где в одном `Commit + Deploy` есть и успешные, и упавшие цепочки.

## 1) Что проверяем

- корректность UI-фильтра в блоке execution:
  - `All`
  - `Failed`
  - `Success`
- корректность экспортов:
  - `Copy TXT` (полный)
  - `Failed only` (компактный TXT)
  - `Failed JSON` (компактный JSON)
  - `Copy JSON` (полный JSON)

## 2) Предусловия

- Стенд: `https://tunnel.hiddenrabbit.net.ru/panel`
- В builder есть минимум 2 chain:
  - хотя бы 1 гарантированно успешный;
  - хотя бы 1 гарантированно провальный (например, порт/роль/маршрут с ожидаемым фейлом).
- На нодах доступен live статус для проверки фактического результата.

## 3) Быстрый сценарий прогона

1. Открыть `/panel/cascades/builder`.
2. Нажать `Commit + Deploy`.
3. Дождаться заполнения `Result of last execution`.
4. Переключить фильтры:
   - `All` — видим все chain cards.
   - `Failed` — видим только failed.
   - `Success` — видим только success.
5. Проверить все 4 экспорта (через буфер обмена).

## 4) Ожидания по фильтру

### `All`
- Количество карточек равно `deployment.results.length`.

### `Failed`
- Каждая карточка содержит `success=false`.
- Количество карточек равно числу `failedChains` (или реальному числу failed в `results`).
- Если нет failed — показывается `executionFilterEmpty`.

### `Success`
- Каждая карточка содержит `success=true`.
- Если нет success — показывается `executionFilterEmpty`.

## 5) Ожидания по экспортам

## `Copy TXT` (полный)
- Включает commit/deploy summary + все chain results.
- Для failed цепочек присутствуют текстовые причины ошибок.

## `Failed only` (компактный TXT)
- Содержит только failed chains.
- Для каждой failed chain минимум:
  - имя chain;
  - первая ошибка.
- При отсутствии failed: `No failed chains...` / локализованный эквивалент.

## `Failed JSON` (компактный JSON)

Минимально ожидаемая структура:

```json
{
  "exportType": "cascade-execution-failed-only",
  "exportedAt": "ISO-8601",
  "hasExecution": true,
  "hasFailedChains": true,
  "execution": {
    "type": "commit-deploy|commit-only",
    "createdAt": "ISO-8601|null",
    "committed": 0,
    "failed": 0,
    "chains": 0,
    "failedChains": 0
  },
  "failedChains": [
    {
      "chainName": "string",
      "chainId": "string|null",
      "startNodeName": "string|null",
      "startNodeId": "string|null",
      "mode": "reverse|forward|mixed|null",
      "liveHopCount": 0,
      "draftHopCount": 0,
      "hopNames": [],
      "errors": [],
      "warnings": [],
      "nodeActions": []
    }
  ]
}
```

Проверка:
- В `failedChains` нет успешных chain.
- `failedChains.length` совпадает с фактическим failed из `results`.
- Ошибки не пустые для реально упавших chain (или есть fallback текст ошибки).

## `Copy JSON` (полный JSON)
- Содержит полный execution snapshot, включая `deployment.results` целиком.

## 6) Критерии PASS / FAIL

PASS:
- фильтр корректно разделяет карточки без рассинхрона;
- failed-only TXT и failed JSON содержат только failed chains;
- числа в summary и в exported payload не конфликтуют между собой.

FAIL:
- фильтр показывает карточки “не своего” статуса;
- failed-only экспорт включает success chain;
- mismatch по количеству failed между UI и JSON;
- отсутствуют полезные ошибки в failed payload.

## 7) Что приложить к баг-репорту

- скрин execution-блока с выбранным фильтром;
- скопированный payload (`Failed JSON`);
- commit hash стенда;
- 1-2 строки из live setup/deploy логов на каждый failed chain.

## 8) Шаблон короткого репорта

```text
Mixed-run report
- Commit: <hash>
- Filters:
  - All: <ok/fail>
  - Failed: <ok/fail>
  - Success: <ok/fail>
- Export:
  - TXT(full): <ok/fail>
  - TXT(failed): <ok/fail>
  - JSON(failed): <ok/fail>
  - JSON(full): <ok/fail>
- Mismatch:
  - failed UI: <n>
  - failed JSON: <n>
- Notes:
  - <коротко>
```

