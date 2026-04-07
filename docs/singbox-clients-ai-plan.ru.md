# План: Sing-box Runtime + Клиенты (Android/Windows/macOS) + AI Telegram

Дата: 2026-04-07

## 1) Цели ближайших циклов
1. Оценить и внедрить Sing-box как runtime без ломки текущего production-пути.
2. Запустить клиентский контур под Android/Windows/macOS с единым управлением из панели.
3. Добавить AI-агента в Telegram для автоматизации операционных задач панели.

## 2) Направление Sing-box (server/runtime)

### 2.0 Короткий вывод по текущему обсуждению
- Да, `Sing-box` потенциально может убрать часть проблем каскадов, потому что вместо гибрида `Xray + Hysteria + sidecar` можно получить единый runtime для `VLESS/Reality + Hysteria2 + chain`.
- Нет, это не “магическая кнопка”: TLS, сертификаты, редиректы, клиентские кэши и подписки всё равно останутся критичными зонами.
- Реальный плюс: меньше сервисного зоопарка на ноде и проще единая схема deploy/chain config.
- Реальная цена: придется переписать часть Deploy Engine, agent/runtime sync и миграционный слой.

### 2.1 Оценка сложности
- Backend адаптация (runtime selector и совместимость API): `Medium`.
- Setup/deploy/sync для Sing-box: `Medium-High`.
- Метрики/наблюдаемость и сохранение текущего monitoring UX: `Medium`.
- Каскады/hybrid совместимость на переходном периоде: `High` (если делать сразу).

### 2.2 Рекомендованная стратегия
`PoC -> Beta dual-runtime -> Migration waves`.

### 2.2.1 Безрисковый путь
1. Оставить текущую панель как `control-plane`.
2. Добавить `node.type = singbox` или `runtime = singbox` под feature-flag.
3. Сделать PoC только для целевой каскадной схемы, а не для всей системы сразу.
4. Сравнить:
- стабильность deploy;
- стабильность user sync;
- частоту handshake/TLS ошибок;
- ресурсы на ноде;
- сложность rollback.
5. Только после сравнения принимать решение о полном переходе.

### 2.3 Этапы
1. PoC:
- добавить runtime-флаг `xray|singbox` в модель ноды;
- поднять один рабочий setup+sync path на Sing-box;
- сохранить текущий контракт panel-agent API.
- использовать в PoC именно текущую целевую цепочку `Portal (Xray VLESS) -> Relay1 (Hy2) -> Relay2 (Hy2) -> Bridge (Xray VLESS)` как baseline для сравнения;
- не ломать действующий Xray/Hysteria production-path.
2. Beta:
- dual-runtime без отключения Xray;
- feature-flag для ограниченной группы админов;
- сравнение стабильности Xray vs Sing-box в метриках.
3. Migration:
- волны миграции нод (canary 5-10%);
- rollback runbook на каждый батч.

### 2.4 Go/No-Go
- Go: синхронизация пользователей и метрики не хуже baseline Xray.
- No-Go: частые расхождения runtime users/stats, отсутствие безопасного rollback.

## 3) Клиентские приложения (Android + Windows + macOS)

## 3.1 Базовые репозитории для форка
- [xinggaoya/sing-box-windows](https://github.com/xinggaoya/sing-box-windows/)
- [xinggaoya/sing-box-windows-android](https://github.com/xinggaoya/sing-box-windows-android)

## 3.2 Рекомендованный маршрут
1. MVP на Windows+Android на базе форков выше.
2. Параллельно выделять shared-core (синхронизация, node scoring, failover policy).
3. После стабилизации P0/P1 подключать macOS через тот же shared-core.

## 3.3 Приоритеты функционала (из запроса)

| Фича | Приоритет | Сложность |
|---|---|---|
| Интеграция с панелью / авто-синхронизация конфигов | P0 | ⭐⭐⭐ |
| Умный выбор нод + авто-переключение при падении | P0 | ⭐⭐⭐ |
| SpeedTest (встроенный) | P1 | ⭐⭐ |
| Split Tunneling (выбор приложений) | P1 | ⭐⭐⭐⭐ |
| Темы (светлая/тёмная) | P2 | ⭐ |
| Виджет / быстрый доступ | P2 | ⭐⭐ |
| Экспорт конфигов (QR/ссылки) | P1 | ⭐⭐ |

## 3.4 Платформенная матрица
- Android: sync + smart select + failover + экспорт в MVP, split tunneling в P1.
- Windows: sync + smart select + failover + speedtest в MVP.
- macOS: подключение после shared-core (P1/P2), без дублирования бизнес-логики.

## 3.5 Как упростить мультиплатформу
1. Единый контракт данных `Profile/Node/Policy/Health`.
2. Единый sync-протокол с панелью (версионируемый schema).
3. Единый алгоритм node scoring/failover в shared-core.
4. Feature flags per-platform вместо форков логики.

## 4) Устойчивость к блокировкам и “скрытность” приложения

Практическая цель: снизить детектируемость/сигнатурность VPN-трафика в типовых сетях, без обещаний «абсолютной невидимости».

Что закладываем в план:
1. Конфиг-профили транспорта с разным уровнем маскировки и fallback.
2. Быстрый авто-failover на альтернативные ноды/профили.
3. Консервативные дефолты для DNS/маршрутов/таймаутов, чтобы уменьшать аномальные паттерны.
4. Режимы подключения по risk-profile (balanced/stealth/performance).
5. Отдельные тесты на DPI-подобные деградации в lab-стенде.

Ограничение:
- это зона операционной устойчивости, а не гарантия обхода любых ограничений;
- режимы должны применяться в рамках закона и правил юрисдикции.

## 5) AI через Telegram для управления панелью

## 5.1 Что автоматизировать сначала
1. Alerts (offline ноды/линки, ошибки setup/deploy, превышение лимитов).
2. Stats summary (суточные/недельные отчеты, состояние нод/пользователей).
3. Подписки (create/reissue/revoke) только через controlled workflow.

## 5.2 Безопасная архитектура
1. Telegram bot как интерфейс, без прямого DB/SSH доступа.
2. Policy-gate + RBAC/allowlist + обязательный audit log.
3. Human approval для write-операций.
4. Structured tool-calls вместо free-form команд.

## 5.3 Этапы
1. Shadow mode (read-only).
2. Alerts mode.
3. Stats mode.
4. Controlled write actions (подписки).
5. Ограниченный remediation набор (только whitelist action list).

## 5.4 LLM-подключение для тестов
- OpenRouter как router-слой без vendor lock-in.
- Для бесплатного теста: `qwen/qwen3.6-plus:free`.
- Прод-модель выбирать отдельно по SLA/стабильности/стоимости.

## 6) Сводный roadmap по этапам

## Phase A (критический текущий)
- Закрыть стабильность автонастройки и каскадов.
- Зафиксировать smoke и release-checklist.
- Повторить всё на полностью чистых серверах и только после этого считать P0 закрытым для перехода дальше.

## Phase B
- Sing-box PoC (1-2 ноды, dual-runtime выключен для всех).
- Приоритетный сценарий PoC: каскадный runtime и chain-deploy, а не “весь продукт сразу”.

## Phase C
- Клиентский MVP Windows+Android (sync/failover/export/speedtest baseline).

## Phase D
- Telegram AI v1 (alerts + stats), потом controlled subscription actions.

## Phase E
- Split tunneling + macOS + deep hardening + расширенные сценарии failover.

## 7) Зависимости и риски
- Риск роста сложности при параллельной миграции runtime и клиента.
- Риск регрессий в sync path при расширении agent logic.
- Риск platform-specific техдолга без раннего shared-core.
- Риск ложного “success” в setup/status без строгих gate-checks.

## 8) Definition of Done
1. Sing-box проходит PoC и beta gates без деградации baseline.
2. Клиенты на 2 платформах стабильно синхронизируются с панелью.
3. AI Telegram выполняет только разрешенные операции и оставляет полный audit trail.
4. Все критические e2e smoke сценарии проходят на чистом контуре.
