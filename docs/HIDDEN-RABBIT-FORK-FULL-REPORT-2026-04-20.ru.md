# Hidden Rabbit Fork — Полный отчёт по доработкам (на 20.04.2026)

## 1) Паспорт отчёта

- Репозиторий: `https://github.com/breachrabbit/CELERITY-panel`
- База сравнения с оригиналом: `upstream/main` от merge-base `053e31945206f876fc280e64f5e5bbd27ca268cf`
- Период активной продуктовой переработки в этом цикле: `2026-04-06 ... 2026-04-20`
- Объём дельты относительно базы:
  - `243` коммита (без merge),
  - `115` файлов затронуто,
  - `+37,331 / -1,797` строк.

Отчёт ниже фиксирует:
1. чем форк отличается от оригинального Celerity;
2. какие баги оригинала/ранних версий были закрыты;
3. какие новые подсистемы внедрены;
4. что сейчас в активной разработке;
5. какие задачи уже запланированы на следующий этап.

---

## 2) Ключевое отличие форка от оригинала (в одном абзаце)

Оригинальный Celerity в форке превращён в отдельный operational-продукт Hidden Rabbit: переписаны критичные части автоонбординга нод, добавлен durable-пайплайн установки с resume/repair, усилена стабильность Xray/Hysteria/Hybrid, сильно переработан UI (desktop/mobile, светлая/тёмная тема, dashboard/stats/users/settings/subscription), построен экспериментальный визуальный конструктор каскадов с диагностикой исполнения и быстрыми repair-действиями, добавлен continuity-слой документации и выполнен частичный безопасный порт из upstream `v1.1.0`.

---

## 3) Что внедрено сверх оригинала (по подсистемам)

## 3.1 Onboarding / Setup нод (главный технический блок)

### Внедрено

- Durable onboarding pipeline вместо хрупкого in-memory потока:
  - scaffold и модель job/state-machine (`79a6c0b`, `deb62fc`, `edecd75`, `9995572`, `e1fecb5`, `1a72b23`);
  - выбор режима setup и прогон через `runFull` (`c65db07`, `d5e9796`);
  - Resume/Repair UI и шаговый rerun (`13debe8`, `204a1c9`, `0a06ee7`);
  - постепенное выведение legacy `setupJobs` из критического status-path (`5aa3df2`, `521c3aa`, `4a48a53`, `e32055b`, `891965a`).

- Критичные фиксы устойчивости установки:
  - live streaming setup-логов и смягчение ложной “ошибочности” stderr (`6e014ce`);
  - preflight shell fixes (`9f8bc20`, `e496825`, `49b1867`);
  - runtime status normalization + retry для verify (`9f066c8`);
  - runtime recovery hardening (`c2a5efa`, `7f7bb95`);
  - stale-job recovery (`7f7bb95`);
  - runtime diagnostics с journal tail в step error (`c2a5efa` ветка изменений).

- Практические fixes “с первого раза должно заводиться”:
  - Xray installer hardening (retries/mirror/finalization/port conflicts): `b5abf71`, `a803b96`, `28186dc`, `6a80cb5`, `84b72bb`, `94e7f9f`;
  - Hysteria setup hardening + UDP verify false-negative fix: `81ee299`, `0418b6d`, `07ed7a7`, `a03fe66`;
  - strict agent verification в Xray path (`2900ea1` плюс предыдущие fix-волны);
  - устранение permission-loop по `access.log`/runtime (`683c013`, `d005be8`, `c2a5efa`).

### Что это дало

- Установка нод стала шаговой, возобновляемой и наблюдаемой.
- Ошибки установки стали диагностируемыми по конкретному шагу, а не “молчаливым зависанием”.
- Существенно уменьшены кейсы “надо запускать setup второй раз”.

---

## 3.2 Источник и установка `cc-agent` (разрыв с legacy ClickDevTech source)

### Внедрено

- Переход на контролируемый источник агента:
  - panel-bundled first (`efbbacc`);
  - Hidden Rabbit release source enforcement (`c0dc70f`, `ed63ad7`, `8c6b029`, `4495b6a`);
  - жёсткий guard от legacy ClickDevTech URL (`6c10ce5`).

### Что это дало

- Установка агента больше не должна тянуть бинарь из оригинального репозитория по старой схеме.
- Логи setup теперь показывают реальный источник установки агента.

---

## 3.3 Гибридные каскады и sidecar-поведение

### Внедрено

- Hybrid runtime переведён к always-on policy:
  - `2900ea1` (включая гибрид по умолчанию),
  - `19d8e6a` (автоматизация ролей/топологии + reconcile вокруг каскадов).

- Улучшение поведения Hysteria при sidecar-сценариях:
  - guard на stale ACL/outbound (`a03fe66`);
  - verify/runtime fixes в durable onboarding (`c2a5efa`, `7f7bb95`).

### Что это дало

- Основа для “гибрид работает по умолчанию” уже заложена в runtime-path.
- Снижены конфигурационные конфликты при переходах между standalone/cascade режимами.

---

## 3.4 Автоматизация каскадных ролей и reconcile

### Внедрено

- Автоматизация lifecycle каскада:
  - create/reconnect/delete links -> background topology reconcile;
  - авто role transition (portal/relay/bridge где нужно);
  - detached node -> auto restore в standalone;
  - фоновые reconfigure/deploy действия с сигналами оператору.
  - основная волна: `19d8e6a`.

- Дополнительные точечные стабильностные фиксы вокруг link reset/realtime state:
  - `3e895f9`, `664695b`, `525d54f`, `017a100`, `6adb92c`, `e09ac95`, `386317d`.

### Что это дало

- Меньше ручного “разобрал каскад -> иди вручную чинить ноду”.
- Реальная база под автоуправление ролью ноды и её возвратом в standalone.

---

## 3.5 Cascade Builder (новая продуктовая поверхность)

### Внедрено

- От экспериментального базового builder до flow execution diagnostics:
  - база builder: `e3d068b`, `0ba07d8`, `8e7408a`, `567e8f1`;
  - draft-hop editor + advanced transport + TLS/Reality/security/geo-policy:
    `746a7a8`, `8551506`, `8486f6a`, `a422389`;
  - commit+deploy path: `c3c6c48`;
  - execution diagnostics, copy/export, failed-only, filters, rerun/repair actions:
    `5d5fddb`, `1609966`, `b68e330`, `074e532`, `34631da`, `3bf557b`, `951f452`, `a048834`, `e72ffa6`, `008f422`.

- UX-волны builder (порты, drag/tap connect, internet context, curves, fullscreen, reset):
  - порты и drag/connect foundation: `38388c2`, `a4b4c43`, `b221efa`, `c8b43e8`;
  - ghost edges + dedupe/idempotency + reset: `c2093b5`, `3e895f9`, `664695b`, `525d54f`;
  - internet egress visualization + fullscreen + bounded canvas:
    `96e70b1`, `f17c693`, `1c09545`, `e09ac95`, `386317d`;
  - drag-connect стабилизация и hit-testing:
    `196cfc8`, `b3e0ed7`, `f16ff97`, `014e98a`, `2ddc272`, `55bf76c`, `d61051c`;
  - восстановление видимости нод при загрузке:
    `d2c8e47`, `6086ec1`, `fb1f558`, `af3b06d`, `62375d8`.

### Что это дало

- Builder перестал быть “картинкой” и стал интерактивным flow-редактором с execution-диагностикой.
- Есть стабильная база для следующего шага: мышиный connect UX + чистая маршрутизация линий + визуальная валидирующая индикация.

---

## 3.6 UI/UX редизайн панели (dashboard/stats/users/settings/subscription)

### Внедрено

- Большая redesign-волна:
  - foundation/new visual system: `7632604`, `0a96925`, `4910761`;
  - shell/grid/sidebar/topbar/layout stabilization:
    `18bac08`, `1084675`, `aad44b4`, `9f40dc1`, `e463ecb`, `3e91c03`, `e07b9ed`, `b6ba39b`, `e2cbc3f`, `7b60825`;
  - mobile fixes и layering:
    `d986579`, `36a487f`, `cabbbc7`;
  - rings/cards/charts polish:
    `51d3275`, `3cd8ffd`, `c228aaf`, `ace7fde`, `17adc2d`, `4ce2986`, `acb2016`, `69fa010`, `95b507f`, `ba1d386`;
  - UX fixes отдельных блоков:
    logs panel height/width (`5a0480f`, `fc6b742`),
    traffic chart periods (`74dd12f`, `18bac08`),
    summary reorder (`800ab39`),
    button hover/controls (`af0d10e`, `21c1967`).

### Что это дало

- Панель визуально и поведенчески сильно ушла от оригинального “стокового” вида.
- Улучшен desktop/mobile опыт, но ещё остаются точечные регрессии в builder UX.

---

## 3.7 HAPP / subscription / пользовательский контур

### Внедрено

- Серия HAPP и subscription улучшений:
  - “works out of box” wave: `0f42a4f`, `0459968`;
  - HAPP controls/text/import: `8fc4c30`, `0320a37`, `a5ccc7f`;
  - локализация/переводы/подписи;
  - профиль цвета/оформление под текущую тему (частично, с платформенными ограничениями iOS/macOS).

- Пользовательская статистика и activity:
  - baseline + attribution foundation + fallback:
    `a23f056`, `99ff5a7`, `8a4bb6d`, `f519a93`, `2b4cbb3`.

### Что это дало

- Страница подписки/импорта стала более управляемой для реальной эксплуатации.
- Появилась реальная операционная статистика по пользователям/активности.

---

## 3.8 Безопасность, стабильность и эксплуатация

### Внедрено

- Security/stability wave до и после v1.1.0 audit:
  - audit findings batch: `21277c2`;
  - Coolify deploy hardening + backend healthcheck: `6b2045c`, `badf68f`;
  - same-host conflict guards, fallback ports, warmups:
    `6a80cb5`, `84b72bb`, `94e7f9f`, `d86726c`, `c991190`;
  - source-build default для installer: `f706ff6`.

- Upstream `v1.1.0` safe port уже внесён:
  - stats/objectId/firewall/cpu/init-hook/hysteria-hopping:
    `171b7a7`, `5af5215`, `ac88f5e`, `0418b6d`.

### Что это дало

- Меньше регрессий при установке/деплое в живом окружении.
- Стабильнее поведение same-host и agent firewall.

---

## 3.9 Continuity и управляемость разработки

### Внедрено

- Изолированная governance/continuity система прямо в репозитории:
  - `PROJECT-BASELINE`, `ROADMAP`, `SESSION-HANDOFF`, `DEVELOPMENT-LOG`, `SESSION-LEDGER`, `KNOWN-ISSUES`, `ISOLATED-PROJECT-RULE`;
  - отдельные blueprint/checklist документы по onboarding/cascades/smoke-check.

### Что это дало

- Сессии стали возобновляемыми без потери контекста.
- Решения и stop-point’ы фиксируются, а не “теряются в чате”.

---

## 4) Какие баги оригинала/ранних волн были исправлены

Ниже — практические проблемы, которые реально ловились в эксплуатации и закрывались:

1. **Установка ноды не поднималась с первого раза / требовался повторный запуск.**
   - закрывалось серией onboarding/runtime/setup fixes:
     `0144fa7`, `b5abf71`, `9f8bc20`, `e496825`, `49b1867`, `9f066c8`, `c2a5efa`, `7f7bb95`.

2. **`verify-runtime-local` давал ложный `Runtime is offline`, когда runtime уже жив.**
   - `9f066c8`, `c2a5efa`, `7f7bb95`, плюс runtime status source hardening `891965a`.

3. **Проблемы с правами Xray логов (`access.log permission denied`) и crash-loop service.**
   - `683c013`, `d005be8`, `c2a5efa`.

4. **Hysteria UDP listener false fail при фактически работающем runtime.**
   - `07ed7a7`.

5. **Legacy agent URL из оригинального репо всплывал в setup-логах.**
   - `c0dc70f`, `efbbacc`, `8c6b029`, `4495b6a`, `6c10ce5`.

6. **Builder “моргал”, не соединял, оставлял ghost links, reset срабатывал нестабильно.**
   - `c2093b5`, `3e895f9`, `664695b`, `525d54f`, `017a100`, `6adb92c`, `e09ac95`, `386317d`.

7. **После деплоя фронтовые фиксы не применялись из-за stale assets.**
   - `4f2fc2d` (`assetVersion` в render path).

8. **Дрейф layout/shell (уезжал UI, sidebar/topbar seam, скролл/fit проблемы).**
   - крупная серия: `18bac08`, `aad44b4`, `9f40dc1`, `e463ecb`, `3e91c03`, `e07b9ed`, `b6ba39b`.

9. **Проблемы live-логов setup (не realtime, неудобная диагностика).**
   - `6e014ce`, `e1ef0c1`, `2d3d12c`.

10. **Node status/control зависел от legacy setupJobs и давал невалидную картину.**
    - staged retirement wave: `5aa3df2`, `521c3aa`, `0a06ee7`, `4a48a53`, `e32055b`, `891965a`.

---

## 5) Что сейчас в активной разработке (не завершено полностью)

1. Cascade Builder UX parity:
   - всё ещё есть кейсы с неудобным drag-поведением/роутингом линий;
   - требуется финальный довод “мышкой от точки к точке” + чистые плавные формы без артефактов.

2. Полная бесшовность topology reconcile:
   - основа автоматизации ролей и standalone restore внедрена, но нужны дополнительные live-regression проходы на сложных графах.

3. Hysteria sidecar/TLS стабильность в edge-кейсах:
   - отдельные сценарии ещё требуют точечного smoke и patch только failing-step.

4. UI-полировка nodes/builder pages:
   - fit/overflow и точечные desktop/mobile регрессии нужно додавить до “без ручного refresh/resize”.

---

## 6) Что уже запланировано (roadmap, но ещё не реализовано полностью)

1. Полный production-grade UX для каскадов:
   - стабильный drag-connect;
   - визуально понятная интернет-эгресс модель;
   - role suggestion/validation прямо в момент построения.

2. Дальнейшее staged retirement legacy path:
   - убрать оставшиеся non-critical legacy read/write в setup status/control.

3. Адаптационные волны из upstream `v1.1.0` shortlist:
   - broadcast terminal (с RBAC/audit/safety);
   - часть HAPP routing train (только совместимые куски);
   - setup progress UX слои, но без возврата к legacy coupling.

4. Доработка авто-cleanup при удалении ноды:
   - расширение cleanup до полного и предсказуемого remote teardown (agent + cascade artifacts + проверяемый результат).

5. Дальнейшее бренд-расхождение с оригиналом:
   - убрать остаточные Celerity-следы из видимых UI/текстов/метаданных.

---

## 7) Статус аудита оригинального `v1.1.0`

Аудит уже проведён и оформлен:
- файл: `docs/UPSTREAM-V1.1-AUDIT-SHORTLIST.md`.

Итог:
- `take now` — частично уже портировано безопасными волнами;
- `take with adaptation` — в очереди;
- `skip` — зафиксировано с причинами (не по профилю этого изолированного форка).

---

## 8) Приложение A — Хронология ключевых волн (2026-04-06...2026-04-20)

### Волна A — Базовая эксплуатационная стабильность
- `e2544c3` (гибридные каскады),
- `0144fa7`, `b5abf71`, `81ee299`, `1919a0d`, `a803b96`,
- `61042bb` (стабилизация autosetup + smoke).

### Волна B — UI/UX и операторский контур
- `7632604`, `0a96925`, `4910761`,
- `69fa010`, `95b507f`, `ba1d386`,
- `aad44b4`, `9f40dc1`, `e463ecb`, `e07b9ed`.

### Волна C — Durable onboarding rewrite
- `79a6c0b` ... `1a72b23`,
- `c65db07`, `d5e9796`, `13debe8`, `204a1c9`,
- `0a06ee7`, `5aa3df2`, `521c3aa`.

### Волна D — Cascade Builder и execution diagnostics
- `e3d068b`, `0ba07d8`, `8e7408a`, `567e8f1`,
- `746a7a8`, `8551506`, `8486f6a`, `a422389`,
- `c3c6c48`, `5d5fddb`, `34631da`, `951f452`, `a048834`.

### Волна E — Builder connect/reset/fullscreen/internet UX
- `38388c2`, `a4b4c43`, `b221efa`, `c8b43e8`,
- `96e70b1`, `f17c693`, `1c09545`, `e09ac95`, `386317d`,
- `196cfc8`, `f16ff97`, `014e98a`, `2ddc272`, `55bf76c`, `d61051c`,
- `d2c8e47`, `6086ec1`, `fb1f558`, `af3b06d`, `62375d8`.

### Волна F — Agent source hardening + topology automation
- `c0dc70f`, `efbbacc`, `8c6b029`, `4495b6a`, `6c10ce5`,
- `19d8e6a` (автоматический reconcile/role/standalone restore cleanup flow).

---

## 9) Честная итоговая оценка состояния форка на 20.04.2026

1. **Сильная сторона:** автоонбординг и каскадная часть уже ушли далеко от “сырых ручных костылей”; есть durable foundation и серьёзная диагностика.
2. **Сильная сторона:** форк стал управляемым как отдельный проект (continuity docs + дорожная карта + stop-point дисциплина).
3. **Слабое место:** последний слой builder UX (мышиные соединения/роутинг/визуальная предсказуемость) ещё требует доводки до “оператор не думает, просто работает”.
4. **Слабое место:** часть edge-кейсов Hysteria/sidecar ещё требует live-smoke закрепления.
5. **Общий статус:** проект уже рабочий и существенно превосходит исходный baseline по эксплуатационной надёжности, но ещё находится в активной инженерной фазе по каскадному UX и полной автоматизации role/runtime transitions.

