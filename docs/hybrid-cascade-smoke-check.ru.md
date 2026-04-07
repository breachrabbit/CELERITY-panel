# Smoke-check: гибридный каскад Xray + Hysteria

Дата: 2026-04-06

## 1. Preconditions

- В `.env` включено: `FEATURE_CASCADE_HYBRID=true`.
- Панель перезапущена после изменения env.
- Есть как минимум:
  - `NODE_A` (тип `xray`) с SSH.
  - `NODE_B` (тип `hysteria`) с SSH.
- Для `NODE_B` в форме ноды:
  - `Hybrid Cascade Sidecar` включен.
  - `SOCKS port` и `configPath` заполнены корректно.

## 2. Позитивный сценарий (reverse)

1. Создать каскадную связь `NODE_A -> NODE_B` в Network Map.
2. Нажать `Deploy`.
3. Убедиться, что статус связи перешел в `online` или `deployed` (с дальнейшим переходом в `online`).

## 3. Проверки на ноде Hysteria (`NODE_B`)

Подключиться по SSH и выполнить:

```bash
systemctl is-active hysteria-server
systemctl is-active xray-cascade.service
```

Ожидаемо: оба сервиса `active`.

Проверить, что sidecar-конфиг существует:

```bash
test -f /usr/local/etc/xray-cascade/config.json && echo OK
```

Ожидаемо: `OK`.

Проверить, что в `hysteria` конфиге есть outbound на sidecar:

```bash
grep -n "__cascade_sidecar__" /etc/hysteria/config.yaml
```

Ожидаемо: есть минимум одна строка с `__cascade_sidecar__`.

## 4. Проверка устойчивости после sync

Вызвать обновление конфига ноды из панели (или API `POST /api/nodes/:id/update-config`), затем снова проверить:

```bash
systemctl is-active hysteria-server
systemctl is-active xray-cascade.service
grep -n "__cascade_sidecar__" /etc/hysteria/config.yaml
```

Ожидаемо: сервисы остаются `active`, sidecar outbound не пропадает.

## 5. Негативные сценарии

1. Включить у `NODE_B` `Use custom config`.
2. Повторить deploy гибридной связи.

Ожидаемо: deploy должен завершиться ошибкой с текстом про конфликт hybrid cascade и custom config.

Дополнительно:

1. Выключить `FEATURE_CASCADE_HYBRID`.
2. Попробовать создать смешанную связь `xray -> hysteria`.

Ожидаемо: API возвращает `400` с сообщением, что hybrid cascade требует `FEATURE_CASCADE_HYBRID=true`.

## 6. Минимальный критерий прохождения

- Смешанная связь создается и деплоится при включенном флаге.
- На Hysteria-ноде поднимается `xray-cascade.service`.
- После sync overlay не теряется.
- Защитные проверки (custom config/выключенный флаг) отрабатывают корректно.

## 7. Автоматизированный smoke-check

В репозитории есть скрипт:

- `scripts/hybrid-cascade-smoke-check.sh`

Для быстрого запуска после чистой установки используйте краткую инструкцию:

- `docs/clean-install-smoke-check.ru.md`

Пример запуска:

```bash
scripts/hybrid-cascade-smoke-check.sh \
  --profile hybrid \
  --host 203.0.113.10 \
  --user root \
  --identity ~/.ssh/id_ed25519 \
  --sidecar-service xray-cascade.service \
  --sidecar-config /usr/local/etc/xray-cascade/config.json \
  --hysteria-config /etc/hysteria/config.yaml \
  --socks-port 11080
```

Скрипт проверяет:

- SSH-доступ;
- `systemctl is-active hysteria-server`;
- `systemctl is-active xray-cascade.service`;
- наличие sidecar/hysteria конфигов;
- наличие `__cascade_sidecar__` в hysteria конфиге;
- факт прослушивания SOCKS-порта;
- наличие бинаря `xray`.
