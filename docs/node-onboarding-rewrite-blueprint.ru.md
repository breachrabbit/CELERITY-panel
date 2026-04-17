# Hidden Rabbit Node Onboarding Rewrite Blueprint

## Зачем это нужно

Текущий flow добавления новой ноды в форке работает, но остаётся хрупким на первом проходе. Пользователь уже несколько раз ловил типичный симптом:

- сервер добавляется;
- автоустановка вроде бы стартует;
- агент/health path поднимается не с первого раза;
- приходится запускать setup повторно, чтобы нода реально ожила.

Для рабочей версии Hidden Rabbit это неприемлемо. Добавление новой ноды должно быть:

- предсказуемым;
- идемпотентным;
- восстановимым после сбоя;
- прозрачным по шагам;
- проверяемым до и после установки.

## Что сейчас происходит в Celerity-пути

Текущее поведение разложено по нескольким независимым этапам:

1. Нода создаётся отдельно от setup.
2. Setup запускается фоновым job-раннером в памяти процесса панели.
3. Базовая установка Xray/stack и установка `cc-agent` идут разными SSH-сеансами.
4. После этого система почти сразу переходит к post-setup finalization через agent/runtime path.
5. Успех первого прохода не требует жёсткой гарантии того, что агент реально отвечает своим API.

## Ключевые архитектурные проблемы

### 1. Setup-state живёт только в памяти процесса

Сейчас очередь и статус автоустановки живут в `Map` внутри процесса панели. Если процесс перезапустится, текущее состояние setup теряется. Пользователь жмёт setup повторно поверх частично установленной ноды.

### 2. `strictAgent: false` в успешном пути

Один из самых опасных моментов: агент может установиться криво, не подняться полностью или ещё не отвечать по API, но flow не всегда падает сразу как жёсткий fail. Система пытается “долечить” это следующими шагами.

### 3. Нет одного атомарного onboarding pipeline

Сейчас это не единый install-contract, а цепочка отдельных действий:

- поставить runtime;
- потом отдельно поставить агент;
- потом почти сразу использовать агент для sync/restart/info.

Из-за этого первый проход особенно уязвим к гонкам по времени.

### 4. Проверка агента слишком слабая

Текущий sanity-check смотрит на `systemctl is-active`, но этого недостаточно. Нужна реальная проверка:

- порт слушает;
- токен валиден;
- `/info` отвечает;
- панель реально достукивается до агента;
- агент реально может поговорить с локальным runtime.

### 5. Installer агента тянет внешний `latest`

Это даёт сразу несколько нестабильностей:

- зависимость от GitHub/зеркал;
- отсутствие pinned version;
- невозможность жёстко контролировать бинарь и checksum;
- поведение меняется между прогонами без явного решения оператора.

### 6. Firewall/panel reachability завязаны на косвенное определение IP панели

Если панель стоит за прокси, CDN или с нестабильным DNS/egress, агент может быть поднят, но панель до него не дойдёт. Визуально это выглядит как “автоустановщик кривой”.

### 7. Raw shell execution вместо контролируемого installer bundle

Скрипты выполняются как строка команд через SSH, а не как загруженный файл/пакет с контролируемой оболочкой, зависимостями и проверками.

## Вывод по аудиту

Проблема не в одной строчке. Проблема в том, что текущий onboarding складывается из нескольких полуавтономных фаз, которые начинают доверять друг другу слишком рано.

Самые вероятные причины эффекта “со второго раза заработало”:

- `strictAgent: false`;
- агент скачивается и ставится внешним `latest`;
- проверка агента смотрит только на `systemctl active`;
- post-setup path начинается до полной готовности agent API;
- setup state не переживает рестарт панели.

## Что нужно сделать в нашей версии

Нужен собственный `node onboarding pipeline`, а не косметический фикс старого flow.

## Цели нового pipeline

1. Один детерминированный сценарий.
2. Отдельные шаги с явными статусами.
3. Идемпотентный resume после частичного успеха.
4. Жёсткая верификация готовности.
5. Никакого “успеха” без реального handshake панели с агентом.
6. Версионированный installer channel.
7. Нормальные логи по шагам.

## Целевая модель

### Сущности

- `NodeOnboardingJob`
  - `jobId`
  - `nodeId`
  - `type`
  - `status`
  - `currentStep`
  - `attempt`
  - `startedAt`
  - `finishedAt`
  - `lastError`
  - `stepLogs`
  - `resultSnapshot`

- `NodeOnboardingStep`
  - `preflight`
  - `prepare-host`
  - `install-runtime`
  - `write-runtime-config`
  - `verify-runtime-local`
  - `install-agent`
  - `verify-agent-local`
  - `verify-panel-to-agent`
  - `seed-node-state`
  - `final-sync`
  - `ready`

### Статусы

- `queued`
- `running`
- `blocked`
- `failed`
- `repairable`
- `completed`

## Целевой flow

### 1. Preflight

Проверяем до установки:

- SSH доступ;
- `bash`, `systemctl`, `curl`, `openssl`;
- тип ОС и пакетный менеджер;
- свободные порты;
- наличие старого Xray/agent/state;
- reachability панели и будущего agent port.

Если preflight не проходит, установка вообще не стартует.

### 2. Prepare Host

- создаём каталоги;
- фиксируем права;
- подготавливаем служебные файлы;
- открываем нужные firewall rules;
- записываем installer metadata.

### 3. Install Runtime

В зависимости от типа ноды:

- ставим Xray/Hysteria/runtime binary;
- используем pinned version;
- проверяем checksum;
- не тянем `latest` с сервера в момент setup.

### 4. Write Runtime Config

- кладём финальный config;
- проверяем его валидность до старта;
- только потом запускаем service.

### 5. Verify Runtime Local

Проверяем на самой ноде:

- service active;
- локальный API/management port отвечает;
- config loaded;
- логи не содержат явного crash-loop.

### 6. Install Agent

Наша версия должна ставить агент из контролируемого канала:

- либо upload бинаря/архива с панели;
- либо pull из pinned release URL с checksum;
- но не “что там сейчас latest”.

### 7. Verify Agent Local

На самой ноде:

- service active;
- порт слушает;
- сертификат/токен на месте;
- `/info` отвечает локально.

### 8. Verify Panel -> Agent

Это один из ключевых новых шагов.

Панель сама должна подтвердить:

- TLS handshake проходит;
- токен принимается;
- `/info` отвечает;
- agent reports expected node identity/version/runtime info.

Без этого нода не получает статус `ready`.

### 9. Seed Node State

Только после живого handshake:

- обновляем node metadata;
- фиксируем capabilities;
- записываем версию runtime/agent;
- поднимаем health baseline.

### 10. Final Sync

Только в самом конце:

- sync users/config;
- optional restart where needed;
- warm health check;
- mark onboarding as completed.

## Что нужно выкинуть или перестроить

### Выкинуть как подход

- setup-state только в process `Map`;
- зависимость от `latest`;
- успех без реального panel->agent handshake;
- смешивание install и implicit repair в одной непрозрачной фазе;
- shell-raw сценарии без жёсткого preflight и verify step.

### Можно переиспользовать частично

- существующие SSH helper'ы;
- части runtime-конфигурации Xray/Hysteria;
- уже существующие sync routines;
- существующую модель ноды и отображение прогресса в UI.

## Что должен показывать UI

На странице ноды / в списке нод:

- `Queued`
- `Preflight`
- `Installing runtime`
- `Verifying runtime`
- `Installing agent`
- `Verifying agent locally`
- `Verifying panel connection`
- `Final sync`
- `Ready`
- `Repair required`

И обязательно:

- текущий шаг;
- последний успешный шаг;
- человеческая ошибка;
- кнопка `Resume`;
- кнопка `Repair`;
- кнопка `Collect diagnostics`.

## Режимы запуска

### Fresh install

Для полностью новой ноды.

### Resume

Продолжает с последнего валидного шага, а не запускает всё заново.

### Repair

Для уже существующей ноды:

- переустановить агент;
- восстановить runtime config;
- пересобрать cert/token;
- перепроверить firewall/reachability.

## Техническое направление реализации

### V1

- отдельная job-модель в БД;
- step-runner вместо process `Map`;
- pinned installer version;
- verify local + verify panel reachability;
- явный `ready` только после полного handshake.

### V2

- upload installer bundle с панели;
- checksum verification;
- richer diagnostics bundle;
- auto-repair recipes.

### V3

- пачечное добавление нод;
- retry policy per step;
- canary onboarding;
- dependency-aware rollout.

## Что проверить на тестовых серверах

Когда пользователь даст новую пачку серверов, прогонять:

1. completely fresh Ubuntu/Debian;
2. сервер с уже установленным старым Xray;
3. сервер с частично установленным агентом;
4. сервер с закрытым/битым firewall path;
5. сервер после прерванного setup;
6. повторный resume без ручного cleanup.

## Практический следующий шаг в коде

1. Зафиксировать аудит как source of truth.
2. Выделить текущие шаги старого flow в явный state-machine draft.
3. Спроектировать новую `NodeOnboardingJob` модель.
4. Собрать новый runner поверх БД, а не поверх in-memory `Map`.
5. Только потом переподключать UI auto-setup к новому pipeline.

## Решение

Для Hidden Rabbit не стоит лечить старый автоустановщик мелкими патчами до бесконечности.

Правильное направление:

- сохранить полезные куски runtime-конфигурации;
- сохранить SSH transport и часть sync logic;
- полностью заменить orchestration install path на свой, проверяемый и идемпотентный pipeline.
