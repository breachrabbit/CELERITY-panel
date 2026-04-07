# Smoke-check после чистой установки

Дата: 2026-04-07

Этот чек нужен сразу после установки панели или ноды, чтобы быстро проверить, что сервисы поднялись и базовые файлы на месте.

## Когда запускать

1. Сразу после `quick-install`.
2. После ручного обновления конфигов.
3. После любого фикса автонастройки на чистом сервере.

## Как запускать

### 1. Xray-нода

```bash
scripts/hybrid-cascade-smoke-check.sh \
  --profile xray \
  --host 203.0.113.10 \
  --user root \
  --identity ~/.ssh/id_ed25519
```

Проверяется:
- `xray.service`;
- `/usr/local/etc/xray/config.json`;
- бинарь `xray`.

### 2. Hysteria-нода

```bash
scripts/hybrid-cascade-smoke-check.sh \
  --profile hysteria \
  --host 203.0.113.20 \
  --user root \
  --identity ~/.ssh/id_ed25519
```

Проверяется:
- `hysteria-server`;
- `/etc/hysteria/config.yaml`.

### 3. Hybrid-нода

```bash
scripts/hybrid-cascade-smoke-check.sh \
  --profile hybrid \
  --host 203.0.113.30 \
  --user root \
  --identity ~/.ssh/id_ed25519 \
  --sidecar-service xray-cascade.service \
  --sidecar-config /usr/local/etc/xray-cascade/config.json \
  --hysteria-config /etc/hysteria/config.yaml \
  --socks-port 11080
```

Проверяется:
- `hysteria-server`;
- `xray-cascade.service`;
- `/usr/local/etc/xray-cascade/config.json`;
- `/etc/hysteria/config.yaml`;
- маркер `__cascade_sidecar__`;
- SOCKS-порт sidecar;
- бинарь `xray`.

## Что считать успешным

- В конце `FAIL=0`.
- Для каждого обязательного пункта скрипт печатает `PASS`.
- Если сервис не поднялся, в выводе будет `systemctl show` и хвост `journalctl`, чтобы сразу понять причину.

## Дополнительный P0 gate после clean-run

После чистой установки этого smoke недостаточно. Нужно отдельно подтвердить:
1. Панель поднимается по HTTPS и логин администратора работает.
2. Автонастройка `Xray` проходит без ручной починки.
3. Автонастройка `Hysteria` проходит без ручной починки.
4. Полная цепочка `Xray -> Hysteria -> Hysteria -> Xray` становится `online`.
5. Подписка пользователя отдается `200`.
6. Подписка повторно импортируется в реальный клиент (`Happ`) без использования старого кеша/старой ссылки.
7. Трафик реально проходит через все узлы цепочки.

Только после этого можно считать этап `P0-release` закрытым.

## Короткая памятка

- Для Xray и hybrid профилей скрипт проверяет наличие `xray`.
- Для hybrid профиля дополнительно проверяется overlay в Hysteria-конфиге.
- Если сервис еще поднимается, скрипт ждёт несколько попыток, а не падает сразу на `activating`.
