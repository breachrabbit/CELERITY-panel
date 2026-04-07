# Hidden Rabbit: Файл Памяти Проекта

## 1) Контекст
- Проект: форк `CELERITY-panel` под собственный продукт `Hidden Rabbit`.
- Лицензия базового проекта: MIT (с сохранением оригинального attribution).
- Главная текущая цель: стабильная автонастройка нод и рабочие каскады `Xray + Hysteria 2`.

## 2) Зафиксированные продуктовые решения
- Поддерживать каскады не только Xray, но и Hysteria 2, включая гибрид.
- Целевая тестовая схема: `Portal (Xray) -> Relay1 (Hy2) -> Relay2 (Hy2) -> Bridge (Xray)`.
- Сетевую карту/топологию держать консистентной с реальным статусом связей.
- Добавить управление feature-флагом гибридного каскада и из админки.
- Подготовить быстрый установщик панели с подтягиванием зависимостей.

## 3) Что уже обсуждено как следующий этап (после стабилизации setup/cascade)
- MTProto per-user (привязка к пользователю/подписке + статистика в карточке).
- Полный ребренд в `Hidden Rabbit` (кроме условий лицензии).
- Перенос frontend/admin UI на Next.js с сохранением текущего backend функционала.
- Расширение протоколов (включая возможный единый runtime-подход).
- Глубокий анализ варианта Sing-box как runtime-платформы (поэтапно, через PoC).
- Клиентские приложения под Android/Windows/macOS с максимально общим shared-core.
- В качестве практической базы для клиента рассматриваются форки:
  - `https://github.com/xinggaoya/sing-box-windows/`
  - `https://github.com/xinggaoya/sing-box-windows-android`
- AI-управление панелью через Telegram (подписки, статистика, алерты) с безопасным policy-gate.
- Тестовая LLM-интеграция через OpenRouter (например `Qwen3.6 Plus (free)`), без жесткой привязки к одному провайдеру.

## 4) Техническая память по инцидентам

### 4.1 Повторяющиеся симптомы
- Setup может выглядеть успешным при неполной готовности runtime.
- У Xray встречался пустой runtime `clients[]` и `invalid request user id`.
- Скачивание бинарей (Xray/agent) может падать на плохих каналах.
- Ошибки SSH: auth fail / handshake timeout / banner timeout.
- В клиенте `Happ` ошибка `TLS handshake` может быть следствием устаревшей подписки/старого UUID, даже если сам каскад уже исправен.

### 4.2 Что уже помогло
- Ретраи + зеркала на скачивание.
- Жесткий HTTP->HTTPS redirect `308`.
- Усиление post-setup sync/reconcile.
- Отдельный smoke-check для гибридного sidecar.
- `no-store/no-cache` заголовки на subscription endpoint.
- Исключение `bridge/relay` Xray-нод из обычного user-reconcile.
- Единый `displayStatus` для bridge-ноды в списке нод и dashboard.

### 4.3 Подтвержденный milestone
- На рабочем стенде подтверждена живая цепочка `Portal (Xray) -> Relay1 (Hy2) -> Relay2 (Hy2) -> Bridge (Xray)`.
- Повторное добавление подписки в `Happ` прошло успешно.
- Трафик реально проходил через все 3 сервера.
- Этот milestone считается `validated on live stand`, но не финальным `clean-install complete`.

## 5) Рабочая модель разработки
- Основной цикл: `orchestrator -> build -> reviewer -> qa`.
- Для сложных/архитектурных задач: `cloud-researcher` сначала анализ и план, без immediate rewrite.
- Для аварий: STOP feature-work -> audit -> targeted fixes -> review -> qa.

## 6) Правила продолжения работ (чтобы не ходить по кругу)
1. Перед каждым новым большим шагом проверять текущий STATUS-документ.
2. Любую новую гипотезу по багу фиксировать как воспроизводимый сценарий + критерий PASS/FAIL.
3. Не считать setup успешным, если runtime sync/agent path не подтвержден.
4. Каждую итерацию завершать обновлением документации (`STATUS`, `MEMORY`, `ROADMAP`).
5. Разделять статусы:
   - `validated on live stand` — работает на текущем стенде;
   - `clean-install complete` — подтверждено на полностью чистых серверах;
   - `release-ready` — есть repeatable clean-run и rollback path.

## 7) Ссылки на ключевые документы в `docs/`
- `STATUS-2026-04-07.ru.md` — текущий статус «сделано/работает/не закрыто».
- `AGENTS-OPERATING-MODEL.ru.md` — роли агентов и flow.
- `hidden-rabbit-roadmap.ru.md` — дорожная карта.
- `tz-priority-autosetup-cascades-then-mtproto.ru.md` — приоритетное ТЗ.
- `protocol-expansion-and-hiddify-integration.ru.md` — расширение протоколов/интеграции.
- `singbox-clients-ai-plan.ru.md` — план по Sing-box, клиентам и AI Telegram.
- `clean-install-smoke-check.ru.md` — runbook для повторного прогона на чистых серверах.

## 8) Важное по безопасности памяти
- Секреты, пароли и токены не хранить в git-документации.
- В документах хранить только структуру окружений и процесс, без чувствительных данных.
