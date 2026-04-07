# Hidden Rabbit Roadmap (план дальнейшей разработки)

Операционный приоритет на ближайший цикл:
`docs/tz-priority-autosetup-cascades-then-mtproto.ru.md`

## Этап 0 — Стабилизация и ребренд (приоритет: критический)
Цель: зафиксировать надежную базу перед крупной миграцией UI.

### Задачи
1. Полный ребренд `C³ CELERITY` -> `Hidden Rabbit` (кроме лицензионного тела MIT).
2. Унификация названий пакета/образов/README/документации.
3. Регресс-проверка всех текущих сценариев setup (Xray/Hysteria/Hybrid).
4. Формализация smoke-check и чек-листа релиза.

### Критерии готовности
- Ни одного старого брендового упоминания в runtime/UI/доках (кроме LICENSE и требуемой атрибуции).
- Успешная автонастройка на чистых серверах по матрице ОС.

## Этап 1 — Надежность каскадов и setup
Цель: сделать каскад/установку предсказуемыми в production.

Текущий фактический статус:
- live-стенд milestone подтвержден;
- следующий обязательный gate: повторяемый clean-install rerun;
- только после этого этап считается закрытым для перехода к `Sing-box PoC`.

### Задачи
1. E2E тест-контур установки нод:
   - Ubuntu 22/24
   - Debian 12
2. Retry policy и fallback для внешних загрузок (Xray/Hysteria/agent) с телеметрией причин отказа.
3. Улучшенный health model по нодам:
   - статус сервиса
   - overlay marker
   - рабочий SOCKS sidecar
4. Диагностический report после setup в UI (чек-лист PASS/FAIL по шагам).

### Критерии готовности
- P95 успешных setup >= 95% на чистых ВМ в тестовой матрице.
- Для всех FAIL есть нормализованный код причины.
- Повторный импорт подписки в клиент после clean-run не требует ручной починки stale-конфига.

## Этап 2 — Миграция админки на Next.js (без потери функционала)
Цель: новый UI-слой, сохранение функциональной совместимости.

### Архитектурный подход
- Backend API остаётся источником истины.
- Next.js frontend подключается поэтапно (экран за экраном).
- Старые EJS-страницы удаляются только после паритетного прохождения QA.

### Задачи
1. Спроектировать дизайн-систему Hidden Rabbit.
2. Перенести модули в порядке:
   - Auth/Session
   - Nodes list + Node form
   - Network map
   - Cascade management
   - Settings
3. Добавить e2e UI тесты на критичные user flow.

### Критерии готовности
- Функциональный паритет с текущей админкой.
- Новая UI-часть проходит smoke/e2e без регрессий.

## Этап 3 — Новые функции (ваш список)

Детальный техплан по этому этапу: `docs/protocol-expansion-and-hiddify-integration.ru.md`.

### 3.1 Sing-box как универсальный Relay
- Добавить модель и runtime для sing-box node type.
- Интегрировать в конструктор каскадов и карту сети.
- Добавить setup/deploy/restart и smoke-check.
- Начинать не с full migration, а с `PoC` под feature-flag на целевой цепочке `Xray -> Hysteria -> Hysteria -> Xray`.
- Сохранять текущую панель как control-plane на всем переходном периоде.

### 3.2 Авто-переключение каскада при блокировке ноды
- Детектор деградации (latency/loss/service down).
- Политика failover (primary/secondary path).
- Автоматический rollback после восстановления.

### 3.3 Расширенная статистика + Prometheus
- Экспонирование метрик:
  - setup outcome
  - node health
  - cascade hop latency
  - active users
  - traffic
- Endpoint `/metrics` + документация дашбордов.

### 3.4 WireGuard для внутренних туннелей
- Генерация WG-конфигов для внутренних link-сегментов.
- Ротация ключей и health-check WG peer.
- Возможность использовать WG как underlay для каскада.

### 3.5 Оптимизация под слабое железо
- Lightweight профиль сервисов (пониженные лимиты/буферы).
- Отключаемые тяжелые модули/фичи.
- Профилировка CPU/RAM и tuning presets.

### 3.6 Мультиязычность (полный русский)
- Полный audit локалей.
- Устранение «островков» английского текста в UI/логах.
- Единый глоссарий терминов.

### 3.7 ACL + GeoSite
- Расширение схемы правил (inline/file/presets).
- Поддержка GeoSite в UX и в runtime генераторе.
- Валидация правил и преднастроенные шаблоны.

### 3.8 MTProxy per-user интеграция
- Автовыдача MTProxy доступа при создании пользователя.
- Привязка к подписке и отображение в карточке подписки.
- Этапный переход от базовой к расширенной per-user статистике.
- Детальный план: `docs/mtproxy-user-integration.ru.md`.

### 3.9 Sing-box: анализ внедрения и phased migration plan
- Поэтапная модель: `PoC -> Beta (dual-runtime) -> Migration`.
- Сохранение совместимости текущего agent API на переходном периоде.
- Отдельные go/no-go критерии перед массовой миграцией.
- Детальный план: `docs/singbox-clients-ai-plan.ru.md`.

### 3.10 Клиентские приложения (Android/Windows/macOS)
- База: форк `xinggaoya/sing-box-windows` и `xinggaoya/sing-box-windows-android`.
- Сначала MVP на Windows+Android, затем вывод shared-core и подключение macOS.
- Приоритет фич: синхронизация, умный выбор нод, авто-failover, speedtest, split tunneling.
- Детальный план: `docs/singbox-clients-ai-plan.ru.md`.

### 3.11 AI-управление панелью через Telegram
- Этапы: `alerts -> stats -> controlled subscription actions`.
- Безопасная архитектура: policy-gate, RBAC, audit trail, human approval для write-операций.
- Интеграция LLM через OpenRouter на тестовом контуре (без vendor lock-in).
- Детальный план: `docs/singbox-clients-ai-plan.ru.md`.

## Этап 4 — Release Engineering

### Задачи
1. Версионирование релизов Hidden Rabbit.
2. CI pipeline:
   - lint/static checks
   - unit/integration
   - e2e setup matrix
3. Процедура безопасного обновления production.
4. Регламент upstream-sync.

### Критерии готовности
- Повторяемый релизный процесс.
- Документированные rollback сценарии.

## Предлагаемая последовательность (рекомендация)
1. Этап 0
2. Этап 1
3. Этап 2
4. Этап 3 (по модулям 3.1 -> 3.7)
5. Этап 4 (параллельно с 2/3, финализация перед публичными релизами)
