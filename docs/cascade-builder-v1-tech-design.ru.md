# Cascade Builder v1 — Technical Design

## Реальный статус реализации

На текущем этапе `v1` уже запущен как experimental scaffold внутри этого форка:

- page route: `/panel/cascades/builder`
- API route: `/api/cascade-builder/*`
- domain layer:
  - `flowNormalizer.js`
  - `flowValidator.js`
- frontend bundle:
  - `views/cascade-builder.ejs`
  - `public/js/cascade-builder.js`
  - `public/css/cascade-builder.css`

Дополнительно принят важный transitional компромисс:

- topology read-source = `cascadeService.getTopology()`
- draft write-source = Redis-backed builder draft state in `cacheService`

И ещё один уже реализованный transitional bridge:

- builder умеет переводить accepted draft hops в legacy `CascadeLink`;
- этот bridge сейчас batch-oriented и intentionally без auto-deploy;
- это сделано, чтобы проверить практический workflow, не связывая сразу builder с агрессивным orchestration UX.

Поверх этого уже добавлен и первый pure planning layer:

- `/api/cascade-builder/deploy-preview`
- `/api/cascade-builder/plan-commit`
- `src/domain/cascade-builder/commitPlanner.js`

Этот слой:

- не пишет в Mongo;
- не трогает SSH/runtime;
- показывает per-hop readiness;
- собирает chain grouping и affected-node actions;
- показывает `current role -> preview role`;
- явно помечает assumptions текущего legacy-backed commit bridge.

Это позволяет уже сейчас тестировать flow-centric UX, не ломая legacy topology storage.

## Цель v1

Сделать первый рабочий experimental-раздел внутри этого форка, который позволит:

- открыть отдельный canvas;
- увидеть текущую topology-модель;
- собирать и редактировать каскад как flow;
- валидировать draft без мгновенного деплоя;
- получить основу для переноса идей в Hidden Rabbit.

Это не финальный Hidden Rabbit builder.
Это первая лабораторная версия, где мы отделяем доменную механику от старой `Карты сети`.

## Что именно должно войти в v1

### Обязательно

- отдельный route и page для builder;
- canvas со схемой нод и связей;
- правая inspector-panel;
- drag-to-connect;
- создание/редактирование flow draft;
- validate action;
- inline structural/protocol warnings;
- сохранение layout.

### Необязательно для v1

- полный production deploy orchestration UX;
- version history;
- rollback;
- templates;
- branching flows;
- multi-flow compare.

## Предлагаемая структура v1

## 1. Новый route

Создать отдельный маршрут, не смешанный с текущим `Nodes` tab:

- `GET /panel/cascades/builder`

При необходимости позже:

- `GET /panel/cascades/builder/:flowId`

Зачем отдельный route:

- не ломаем текущую `Карту сети`;
- можно спокойно экспериментировать с UX;
- проще отделить новый builder bundle от legacy nodes page.

## 2. Новый view

Отдельный EJS view:

- `views/cascade-builder.ejs`

Состав:

- page header;
- left library / filters;
- center canvas;
- right inspector;
- bottom / top validation summary bar.

## 3. Новый frontend bundle

Не расширять бесконечно `public/js/network.js`.

Лучше:

- оставить `public/js/network.js` как legacy topology-layer;
- создать новый файл:
  - `public/js/cascade-builder.js`

Дополнительно можно сразу ввести маленькие модули:

- `public/js/cascade-builder/canvas.js`
- `public/js/cascade-builder/inspector.js`
- `public/js/cascade-builder/validation.js`
- `public/js/cascade-builder/state.js`

Но для v1 можно начать и с одного файла, если код останется чистым.

## 4. Новый backend/domain слой

Тут лучше сразу не тащить всё в routes.

Нужно ввести слой:

- `src/domain/cascade-builder/`

Минимальный набор:

- `flowNormalizer.js`
- `flowValidator.js`
- `flowMapper.js`

### `flowNormalizer.js`

Преобразует текущие:

- nodes;
- cascade links;
- positions;

в структуру builder state.

### `flowValidator.js`

Делает validation v1:

- structural;
- protocol;
- runtime-lite.

### `flowMapper.js`

Маппит:

- legacy `CascadeLink`
- и current node roles

в `flow/hop` представление для builder UI.

## Модель данных для v1

На v1 не обязательно сразу вводить новые Mongo-модели.
Можно сделать transitional model поверх текущих `HyNode + CascadeLink`.

### BuilderFlowState

В памяти/API:

```js
{
  flowId: "legacy-topology",
  mode: "legacy-backed",
  nodes: [],
  hops: [],
  validation: {
    status: "ok" | "warning" | "error",
    errors: [],
    warnings: []
  },
  layout: {}
}
```

### Node DTO

```js
{
  id,
  name,
  country,
  type,
  status,
  capabilities,
  currentRoles,
  x,
  y
}
```

### Hop DTO

```js
{
  id,
  sourceNodeId,
  targetNodeId,
  mode,
  stack,
  tunnelProtocol,
  tunnelSecurity,
  tunnelTransport,
  priority,
  status
}
```

Это позволит позже заменить внутреннюю storage-модель, не ломая UI.

## API для v1

## Reuse existing

Можно использовать текущие endpoints как источник:

- `GET /api/cascade/topology`
- `POST /api/cascade/topology/positions`
- existing CRUD/deploy endpoints for links

## Add builder-specific

Нужны новые endpoints уровня builder:

### Read builder state

- `GET /api/cascade-builder/state`

Возвращает:

- normalized nodes;
- normalized hops;
- validation summary;
- layout metadata.

### Validate builder state

- `POST /api/cascade-builder/validate`

На v1 может принимать либо:

- текущее состояние canvas;
- либо просто existing topology snapshot.

Ответ:

- errors;
- warnings;
- normalized inferred roles;
- deployability summary.

### Draft connect

- `POST /api/cascade-builder/connect`

Нужен для drag-to-connect.

Принимает:

- source node;
- target node;
- optional mode/transport/security.

Возвращает:

- suggested role interpretation;
- compatibility result;
- suggested defaults.

На v1 этот endpoint может не сохранять сразу в БД, а только считать draft preview.

### Persist draft to legacy link

Если оператор подтверждает создание связи:

- можно либо вызвать legacy `POST /api/cascade/links`,
- либо дать backend новый wrapper endpoint:
  - `POST /api/cascade-builder/commit-hop`

Я бы выбрал wrapper endpoint, чтобы UI не зависел жёстко от legacy-form payload.

## Validation v1

## Structural

Проверяем:

- self-link запрещён;
- duplicate direct hop запрещён;
- цикл запрещён;
- node without meaning inside flow подсвечивается warning;
- multiple upstreams / downstreams — warning или error по правилу.

## Protocol

Проверяем:

- `xray -> xray` = ok;
- `hysteria -> hysteria` = ok if hybrid rules allow current overlay model;
- `xray <-> hysteria` = ok only if hybrid cascade enabled;
- incompatible `security + transport` combos;
- invalid role combination.

## Runtime-lite

Проверяем:

- есть ли node ssh/agent basic readiness;
- активна ли нода;
- не конфликтует ли tunnel port;
- доступен ли required runtime type.

Для v1 этого достаточно.

## UI state model

Во frontend нужен явный state store.

Минимальный shape:

```js
{
  flow: { ... },
  selectedNodeId: null,
  selectedHopId: null,
  draftConnection: null,
  validation: { ... },
  dirty: false,
  mode: "canvas"
}
```

Это даст:

- предсказуемое обновление canvas;
- inspector без ручной каши;
- понятный validate/save pipeline.

## Inspector content v1

### Для ноды

- name
- type
- country
- status
- existing cascade participation
- inferred role in current draft
- warnings

### Для hop

- source -> target
- stack
- mode
- transport/security
- current operational status
- validation issues

### Для flow summary

- entry node
- exit node
- hop count
- structural state
- deployability state

## Drag-to-connect flow

### Interaction

1. user drags from node A to node B;
2. frontend creates draft edge preview;
3. sends lightweight request to `connect` or runs local-first suggestion;
4. inspector/context sheet opens;
5. user confirms role/mode/options;
6. backend validates;
7. draft becomes real hop or shows error.

### Important rule

Нельзя сразу молча создавать legacy link.
Нужен confirm step, даже если очень компактный.

## What exactly should be reused from current code

## Reuse directly

### `public/js/network.js`

Полезно забрать:

- cytoscape init;
- style baseline;
- fit/layout logic;
- node/edge event handling;
- save positions;
- resize handling.

### `src/services/cascadeService.js`

Полезно забрать:

- stack resolution;
- link compatibility;
- chain ordering;
- topology projection.

### `src/routes/cascade.js`

Полезно использовать как legacy bridge:

- current topology fetch;
- positions save;
- legacy link CRUD.

## Do not reuse as-is

- modal-heavy interaction model;
- node role as a hard persistent property;
- current toolbar/legend UX;
- direct dependence of future builder UI on raw `CascadeLink` payload.

## File/Module plan for first implementation

### Backend

- `src/routes/panel/cascadeBuilder.js`
- `src/routes/api/cascadeBuilder.js` or extend existing cascade router carefully
- `src/domain/cascade-builder/flowNormalizer.js`
- `src/domain/cascade-builder/flowValidator.js`
- `src/domain/cascade-builder/flowMapper.js`

### Frontend

- `views/cascade-builder.ejs`
- `public/js/cascade-builder.js`
- `public/css/cascade-builder.css`

## Suggested delivery phases for code

## Step 1

Create the page and render normalized topology in a dedicated builder shell.

Definition of done:

- page opens;
- nodes and hops render;
- inspector opens on selection.

## Step 2

Add drag-to-connect and draft edge preview.

Definition of done:

- user can drag from node to node;
- system shows contextual suggestion;
- invalid connections are blocked visually.

## Step 3

Add validate summary and warnings panel.

Definition of done:

- full flow validation visible;
- errors tied to specific nodes/edges;
- no need to read logs to understand why a flow is invalid.

## Step 4

Add commit-to-legacy-link bridge.

Definition of done:

- confirmed draft hop can be created as a real cascade link;
- layout persists;
- topology refreshes cleanly.

## What success looks like for v1

v1 is successful if:

- operator can build or edit a simple cascade visually;
- system explains why invalid links are invalid;
- builder is already more intuitive than the current map tab;
- we can study the interaction patterns and later port them into Hidden Rabbit.

## Explicit non-goal for v1

v1 is not:

- final Hidden Rabbit UI;
- final storage model;
- full orchestration platform;
- full deployment control center.

v1 is a working experimental visual builder with a clean domain boundary.
