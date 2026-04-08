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

### 4.4 Новый подтвержденный milestone
- На clean-run стенде подтверждена чистая установка панели и чистый 4-hop baseline.
- Все 3 links в целевой схеме были `online`.
- После привязки тестового пользователя к `Portal` подписка отдавала `200` и `vless://`.
- Для bridge same-host исправлен UI-хвост в колонке “Информация о ноде”.
- `e2e harness` обновлен так, чтобы bridge в same-host схеме не давал ложный false-negative только из-за старого unit/path.
- Для same-host panel+node сценария `nodeSetup` теперь должен сравнивать `node.ip` с реальным IP панели, чтобы не запускать `Xray` на `443/80` рядом с панелью и не получать ложный success/unknown.
- Дополнительно подтверждено на живом same-host сервере:
  - после фикса post-setup warmup нода больше не требует второго `auto-setup`;
  - один запуск setup теперь дотягивает same-host Xray-ноду до `agentStatus=online`;
  - в setup logs фиксируется маркер `[Xray] CC Agent is online after setup ...`.
- По `Hysteria 2` уточнена same-host модель:
  - основной listener `Hysteria 2` у нас идёт по `UDP/QUIC`, поэтому базовый `:443` не конфликтует с панелью на `TCP 443`;
  - auto-fallback порта как у `Xray` для этого случая не нужен;
  - вместо этого добавлен узкий preflight на реальные TCP-конфликты same-host:
    - `masquerade.listenHTTP=80`
    - `masquerade.listenHTTPS=443`

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

## 6.1 Что сейчас считается baseline
- Панель устанавливается на чистом сервере.
- Автонастройка `Xray` работает.
- Автонастройка `Hysteria` работает.
- Целевая цепочка `Portal (Xray) -> Relay1 (Hy2) -> Relay2 (Hy2) -> Bridge (Xray)` поднималась на clean-run стенде.
- Подписка после корректной привязки пользователя к entry-node работает.

## 6.2 Что сейчас считается следующим этапом
- Не `MTProto`, не `Next.js`, не полный rebrand в коде, а именно `Sing-box PoC`.
- По `Sing-box` выбран путь:
  - `PoC -> dual-runtime beta -> migration waves`
- Полный переход допускается только после parity с baseline.
- Ведется отдельная живая документация по реализации PoC:
  - `singbox-poc-status-2026-04-07.ru.md`
  - там фиксируются: ветка, сделано, не сделано, риски, тестовый статус и следующий шаг.
- Первый реальный `Sing-box single-node` server-run уже подтвержден на отдельном сервере через `setupSingboxNode(...)`.
- Первый реальный баг PoC уже пойман и исправлен:
  - код жёстко ожидал бинарь `sing-box` в `/usr/local/bin`
  - после пакетной установки бинарь оказался в `/usr/bin`
  - fix: переход на `command -v sing-box`
- Последний зафиксированный вывод по следующему шагу:
  - локального backend/dev прогона недостаточно для честного `panel-managed` e2e;
  - удалённая нода должна ходить обратно в панель по публичному `https://{PANEL_DOMAIN}/api/auth`;
  - значит следующий практический этап для PoC — staging-панель с публичным HTTPS.
- Для тестового домена `Sing-box PoC` зафиксирован:
  - `sing-box.hiddenrabbit.net.ru`
- Агентами отдельно подтверждено:
  - backend-path уже в целом доведён до single-node PoC;
  - главный хвост перед staging-run — Xray-centric UI/manage path и runtime-aware отображение `Sing-box`.
- После этого уже внесены локальные правки:
  - runtime-aware карточка `Информация о ноде` для `Sing-box`;
  - runtime-aware refresh/edit-manage path;
  - отдельный auto-setup confirm для `Sing-box`;
  - badge `runtimeVersion + singbox` в списке нод.
- Локально подтверждено:
  - JS syntax ok;
  - locale JSON ok;
  - затронутые EJS шаблоны компилируются без ошибок.
- На staging с публичным HTTPS уже подтверждено:
  - login в панель работает;
  - panel-managed create/edit `Sing-box` node работает;
  - preview/setup/logs/restart/get-config работают;
  - список нод показывает `runtimeVersion + singbox`.
- На staging уже подтвержден user/subscription path:
  - через group-based routing;
  - `uri` и `singbox` subscription formats отдают `200`;
  - конфиг указывает на staging-ноду `91.210.171.11:8443`.
- После panel-managed staging проверки выявлен и закрыт важный Sing-box хвост:
  - симптом: в приложении при добавлении подписки появлялось `сервер закрыл соединение`;
  - root cause: новый пользователь попадал в subscription output, но не сразу попадал в live `/etc/sing-box/config.json`;
  - фикс: user mutations в panel/API/MCP переведены на runtime-aware reconcile;
  - дополнительно `runtime=singbox` исключён из Xray-only user reconcile;
  - staging-проверка после фикса подтвердила, что новый пользователь уже реально попадает в live `Sing-box` конфиг и совпадает с UUID в subscription output.
- Следующий Sing-box хвост по клиентскому импортy тоже локализован:
  - симптом: `TLS handshake error`;
  - journal сервера: `REALITY: processed invalid connection`;
  - корень: staging `vless://` URI для Xray/Happ-клиента был неполным:
    - без `encryption=none`;
    - без `headerType=none`;
    - без default `flow=xtls-rprx-vision`;
  - дополнительный фактор: Redis subscription cache продолжал отдавать старую версию профиля после обновления backend-кода;
  - staging исправлен: код генератора обновлён, cache очищен, новый URI уже отдаётся корректно.
- После следующей итерации выяснилось, что этого было недостаточно:
  - ошибка воспроизводилась и в отдельном временном `Sing-box` клиенте, не только в `Happ`;
  - значит это был не только client-import issue, а реальный server-side `Reality` runtime defect.
- Подтверждённый runtime root cause:
  - в server-side `Sing-box` config для `security=reality` отсутствовал `tls.server_name`;
  - без него временный self-test давал:
    - client: `reality verification failed`
    - server: `REALITY: processed invalid connection`
  - после добавления `tls.server_name = first(realitySni) || handshake.host` тот же тест начал проходить.
- Что уже подтверждено после фикса:
  - staging backend пересобран;
  - staging node config обновлён через panel/API;
  - временный `Sing-box` клиент успешно подключается к живому `91.210.171.11:8443`;
  - значит текущий незакрытый хвост уже не в runtime `Reality`, а только в повторной ручной проверке через `Happ`.
- Ручная проверка через `Happ` после этого прошла успешно:
  - рабочей оказалась обычная универсальная ссылка из карточки подписки;
  - временно добавленные отдельные ссылки `Happ / Xray` и `Sing-box` признаны лишними и убраны из UI.
- По export path дополнительно зафиксировано:
  - `format=singbox` приведён к совместимому формату `sing-box 1.13`;
  - `Sing-box add/import error` со стороны export schema считается закрытым.
- Новый фактический next step по PoC:
  - не single-node, а `Iteration 2` с `relay/bridge` ролями и первой `Sing-box` цепочкой.
- По `Iteration 2` уже внесён локальный минимальный срез:
  - отдельный `Sing-box` forward-hop renderer;
  - runtime-aware deploy для `relay/hop`;
  - role-aware setup/finalize/sync/preview/get-config path для `bridge/relay`;
  - это ещё не end-to-end chain milestone, а подготовленный relay/hop слой перед серверным smoke-check.
- Первый серверный шаг по PoC уже выполнен:
  - тестовая нода `212.22.82.145`;
  - прямой runtime smoke через `cascadeService._deployForwardHopConfig(...)`.
- Что уже подтверждено по этому шагу:
  - `sing-box.service` active;
  - `/etc/sing-box/config.json` существует;
  - listener на `10086` поднят;
  - пойман и исправлен compatibility bug `sing-box 1.13.6` с legacy inbound sniff fields в hop-config.
- Следующий фактический шаг:
  - не отдельный hop-runtime, а следующий слой orchestration:
    - сначала двухузловая схема `Sing-box portal -> Sing-box bridge/hop`
    - затем middle-relay.
- Для этого уже внесён локальный срез:
  - `generateSingboxPortalConfig(...)`
  - runtime-aware `Sing-box portal` deploy/sync/preview/get-config path
  - middle-relay на `Sing-box` пока сознательно не включался, чтобы сначала подтвердить минимальную двухузловую цепочку.
- Двухузловый серверный milestone уже закрыт:
  - отдельный reproducible smoke добавлен в:
    - `scripts/e2e/run-singbox-two-hop.js`
  - схема:
    - `91.210.171.11` — `Sing-box portal`
    - `212.22.82.145` — `Sing-box bridge/hop`
- Что подтверждено этим smoke:
  - `setupSingboxNode(...)` проходит и для `portal`, и для `bridge`;
  - `cascadeService._deployNodeInChain(...)` реально применяет forward-chain deploy path;
  - `portal` слушает `8443`;
  - `bridge/hop` слушает `10086`;
  - оба `sing-box.service` активны;
  - самый сильный критерий PASS:
    - временный `Sing-box` client на `portal` смог выйти в интернет;
    - внешний IP совпал с IP `bridge` (`212.22.82.145`);
    - то есть подтверждён не только listener/service, а реальный egress через bridge.
- Во время этого smoke пойман и исправлен отдельный баг уже в e2e harness:
  - временный client запускался shell-строкой с некорректным `&;`;
  - из-за этого локальный SOCKS listener не поднимался, что давало ложный fail;
  - harness обновлён:
    - ждёт появления SOCKS listener;
    - печатает client log/process state до cleanup;
    - явно закрывает `SSHPool`, чтобы локальный smoke не зависал после завершения.
- Новый фактический next step по PoC:
  - не `portal -> bridge`, потому что он уже подтверждён;
  - и не `middle-relay` отдельно, потому что он уже вошёл в подтверждённый three-hop smoke;
  - а panel-managed `Sing-box` chain deploy из UI/API и затем сравнение с baseline.
- Для этого уже внесён следующий локальный срез:
  - `generateSingboxForwardRelayConfig(upstreamLinks, downstreamLinks)`;
  - `cascadeService._deployNodeInChain(...)` больше не блокирует `Sing-box relay` как `not implemented`;
  - `setupSingboxNode(...)` и `updateSingboxNodeConfig(...)` стали relay-aware;
  - panel/API preview path различает `bridge`, `relay` и `portal` для `runtime=singbox`.
- Локально подтверждено:
  - syntax-check проходит;
  - sanity-check relay generator проходит:
    - upstream inbound создаётся;
    - downstream chain outbounds собираются;
    - routing rule отправляет relay inbound в downstream chain.
- Следующий серверный milestone уже закрыт:
  - отдельный reproducible smoke добавлен в:
    - `scripts/e2e/run-singbox-three-hop.js`
  - схема:
    - `91.210.171.11` — `Sing-box portal`
    - `188.225.82.219` — `Sing-box relay`
    - `212.22.82.145` — `Sing-box bridge`
- Что подтверждено этим smoke:
  - `setupSingboxNode(...)` проходит для всех трёх ролей;
  - `cascadeService._deployNodeInChain(...)` реально применяет portal/relay/bridge runtime path;
  - `portal` слушает `8443`;
  - `relay` слушает `10086`;
  - `bridge` слушает `10087`;
  - все три `sing-box.service` активны;
  - самый сильный критерий PASS:
    - временный `Sing-box` client на `portal` смог выйти в интернет;
    - внешний IP совпал с IP `bridge` (`212.22.82.145`);
    - значит подтверждён реальный egress по полной цепочке `portal -> relay -> bridge`.
- Важное ограничение после этого этапа:
  - server-smoke full chain уже есть;
  - следующий честный шаг теперь не новый harness, а panel-managed orchestration path из UI/API.
- Для этого уже внесён первый практический guardrail:
  - `cascadeService.preflightChain(startNodeId)`;
  - API endpoint `POST /api/cascade/chain/preflight`;
  - topology UI теперь делает preflight перед chain deploy;
  - цель: не допускать ложный deploy при битой runtime/role/topology state.
  - после добавления этого слоя повторный three-hop smoke снова прошёл без регресса.

## 6.3 Важная продуктовая договорённость по клиентам
- Нужны клиенты под `Android + Windows + macOS`.
- Реалистичный путь:
  - старт с форков готовых `Sing-box` клиентов;
  - затем выделение shared-core;
  - `macOS` подключать после стабилизации `Android + Windows`.
- По “скрытности”:
  - можно сделать клиент менее заметным;
  - нельзя честно обещать полную невидимость для ОС/EDR/DPI.

## 7) Ссылки на ключевые документы в `docs/`
- `STATUS-2026-04-07.ru.md` — текущий статус «сделано/работает/не закрыто».
- `AGENTS-OPERATING-MODEL.ru.md` — роли агентов и flow.
- `hidden-rabbit-roadmap.ru.md` — дорожная карта.
- `tz-priority-autosetup-cascades-then-mtproto.ru.md` — приоритетное ТЗ.
- `protocol-expansion-and-hiddify-integration.ru.md` — расширение протоколов/интеграции.
- `singbox-clients-ai-plan.ru.md` — план по Sing-box, клиентам и AI Telegram.
- `singbox-execution-plan-2026-04-07.ru.md` — прикладной execution plan по миграции на Sing-box, тест-матрице, клиентам и оптимизации панели под слабое железо.
- `singbox-poc-status-2026-04-07.ru.md` — рабочий status-log по реализации Sing-box PoC.
- `SESSION-HANDOFF-2026-04-07.ru.md` — единая сводка по сессии: done/current/open/next.
- `clean-install-smoke-check.ru.md` — runbook для повторного прогона на чистых серверах.

## 8) Важное по безопасности памяти
- Секреты, пароли и токены не хранить в git-документации.
- В документах хранить только структуру окружений и процесс, без чувствительных данных.

## Update: 2026-04-07 — panel-managed Sing-box chain подтверждён

Новый зафиксированный milestone:
- `Sing-box PoC / panel-managed chain milestone` уже закрыт.

Подтверждённый контур:
- `91.210.171.11` — staging panel + `portal`
- `188.225.82.219` — `relay`
- `212.22.82.145` — `bridge`

Через panel/API подтверждено:
- создание 3 нод `runtime=singbox`;
- `setup` всех 3 нод;
- создание 2 `forward` links;
- `preflight success`;
- `chain deploy success (deployed=3)`;
- topology целиком `online`.

Через host-level проверки подтверждено:
- `91` слушает `8443`;
- `188` слушает `10086`;
- `212` слушает `10087`;
- на всех трёх нодах `sing-box.service = active`.

Дополнительно закрыты два узких panel-managed бага:
1. `agent-info` для `Sing-box` давал `502` из-за отсутствующего import `nodeSetup` в `src/routes/nodes.js`.
2. Subscription для enabled-user без групп возвращала `# No servers available`, потому что `subscription.js` не повторял case `user.groups=[] -> node.groups=[]`, уже реализованный в `syncService`.

После этих фиксов подтверждено:
- `agent-info` на всех трёх нодах отдаёт корректный runtime metadata response;
- универсальная subscription link снова рабочая;
- `format=uri` и `format=singbox` отдают `200`.

Самый важный новый факт:
- реальный egress-test через subscription-derived client profile уже выполнен успешно;
- внешний IP пользователя вернулся как `212.22.82.145`;
- значит panel-managed `Sing-box` chain считается подтверждённым end-to-end, а не только по topology/UI.

Фактическая точка продолжения теперь такая:
- не “доделать chain”, а выбрать следующий этап после PoC milestone:
  1. performance baseline под `1 vCPU / 1 GB`;
  2. сравнение baseline `Xray/Hysteria` vs `Sing-box`;
  3. rollout / feature-flag plan;
  4. решение о полном переходе или dual-runtime phase.
