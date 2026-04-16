# Hidden Rabbit Visual Cascade Builder — Blueprint

## Зачем это нужно

Одна из будущих ключевых фич Hidden Rabbit — визуальный конструктор каскадов.

Его задача — превратить текущую техническую работу со связями между нодами в понятный инженерный интерфейс, где оператор:

- видит схему сети как живой холст;
- собирает каскад мышкой прямо на canvas;
- сразу получает подсказки по ролям нод и типу связи;
- видит ошибки совместимости до деплоя;
- понимает, что именно будет развернуто на каждой ноде.

Это не просто `карта сети` и не просто `CRUD для link`.
Это визуальный orchestration-инструмент для сборки, проверки и выката каскадных маршрутов.

## Что уже есть в текущем форке и что можно взять за основу

Текущий форк уже содержит полезный фундамент:

- визуальный слой на `cytoscape.js`:
  - `public/js/network.js`
  - `public/css/network.css`
  - блок `viewNetwork` в `views/nodes.ejs`
- модель связей:
  - `src/models/cascadeLinkModel.js`
- доменную логику топологии и деплоя:
  - `src/services/cascadeService.js`
- topology API:
  - `src/routes/cascade.js`
- хранение ролей и настроек нод:
  - `src/models/hyNodeModel.js`

Особенно ценно, что тут уже есть не только визуализация, но и серверная логика:

- `getTopology()`
- `savePositions()`
- `_buildChainOrder()`
- `_updateNodeRoles()`
- `_assertLinkCompatibility()`
- `deployChain()`

Это означает, что будущий конструктор можно строить не с нуля, а на базе уже существующего topology/cascade ядра.

## Главная продуктовая идея

Нужен отдельный раздел панели, рабочее название:

- `Cascade Builder`
- или `Flow Builder`

Внутри этого раздела оператор работает с каскадом как с mind map / network canvas:

1. размещает ноды на холсте;
2. соединяет их мышкой;
3. на каждом соединении выбирает роль и тип хопа;
4. получает inline-валидацию;
5. сохраняет схему как draft;
6. запускает preflight;
7. деплоит только валидный каскад.

## Какой UX должен получиться

Конструктор должен иметь 3 главных режима.

### 1. Canvas

Основной рабочий режим.

Пользователь может:

- двигать ноды;
- тянуть связь от одной ноды к другой;
- перестраивать цепочки;
- видеть активные, draft и ошибочные связи;
- быстро создавать и переподключать хопы.

### 2. Inspector

Правая боковая панель, где показывается контекст выбранного объекта.

Если выбрана нода:

- тип ноды;
- страна / регион;
- текущая нагрузка;
- доступные протоколы;
- какие каскады уже используют эту ноду;
- ограничения.

Если выбрана связь:

- from -> to;
- режим связи;
- stack;
- transport/security;
- latency/health;
- конфликты;
- deploy state.

Если выбрана вся цепочка:

- итоговый путь;
- входная нода;
- выходная нода;
- промежуточные relay;
- прогноз совместимости;
- deploy preview.

### 3. Validate / Deploy

Отдельный режим перед выкатом.

Показывает:

- валидна ли схема;
- где ошибки;
- где предупреждения;
- какой runtime нужен на каждой ноде;
- где нужен sidecar;
- какие конфиги будут переписаны;
- что можно задеплоить прямо сейчас.

## UX-магия, которая сделает это действительно сильной фичей

### Drag-to-connect

Пользователь тянет линию от одной ноды к другой.

При отпускании курсора:

- открывается компактный contextual sheet;
- система сразу предлагает тип связи;
- предлагает роль новой ноды в этом потоке;
- предупреждает о несовместимости, если она есть.

### Smart role suggestion

Если оператор тянет связь:

- из входной ноды к следующей — по умолчанию предлагается `relay` или `bridge`;
- если у ноды уже есть upstream и downstream — предлагается `relay`;
- если нода последняя — предлагается `bridge`;
- если нода первая в потоке — `portal`.

### Inline validation

Ошибки не должны прятаться в логах или модалках.

Они должны быть видны прямо на холсте:

- красная линия — связь невалидна;
- жёлтый контур — допустимо, но с риском;
- синий индикатор — нужен runtime/sidecar;
- зелёный — схема готова к deploy.

### Deploy preview

Перед запуском оператор должен видеть:

- какие сервисы будут подняты;
- какие порты будут заняты;
- какой stack будет применён;
- какой маршрут станет итоговым.

## Где текущая реализация хороша, а где её надо перерасти

### Что нужно сохранить

- topology API;
- хранение позиций нод;
- current graph canvas;
- chain order builder;
- серверную compatibility-проверку;
- deployChain как основу orchestration;
- reconnect / quick-link идеи.

### Что нельзя переносить в Hidden Rabbit один в один

#### 1. Жёсткая роль на уровне самой ноды

Сейчас роль во многом мыслится как свойство ноды.

Для будущего конструктора это слишком жёстко.
Одна и та же физическая нода в разных каскадах может играть разные роли.

Нужна модель:

- `Node` — физический сервер;
- `CascadeFlow` — схема каскада;
- `FlowHop` — шаг/связь в схеме;
- `NodeRoleInFlow` — роль ноды внутри конкретного flow.

#### 2. Link-centric подход

Сейчас центр модели — `link`.

Для будущего продукта центром должен стать `flow`.

То есть сохраняем не просто пары `portal -> bridge`, а полноценную схему:

- draft;
- история изменений;
- versioning;
- preflight state;
- deploy state;
- rollback.

#### 3. Формы как основной способ работы

Текущие модалки полезны как временный интерфейс, но не как финальный UX.

В будущем лучше:

- canvas;
- inspector;
- contextual panels;
- inline controls.

## Предлагаемая доменная модель для будущего конструктора

### Node

Физическая нода / сервер.

Содержит:

- id;
- name;
- region / country;
- protocol capabilities;
- runtime capabilities;
- health;
- deployment metadata.

### CascadeFlow

Отдельная схема/маршрут.

Содержит:

- id;
- name;
- status (`draft`, `validated`, `deploying`, `active`, `error`);
- description;
- version;
- createdBy / updatedBy;
- layout data;
- validation snapshot.

### FlowHop

Связь между двумя нодами в рамках `CascadeFlow`.

Содержит:

- sourceNodeId;
- targetNodeId;
- mode;
- stack;
- transport;
- security;
- mux;
- geo / routing rules;
- priority;
- operational state.

### NodeRoleInFlow

Роль ноды в рамках конкретного flow:

- `portal`
- `relay`
- `bridge`
- `observer` / optional later

## Какие validation-слои нужны

### 1. Structural validation

- нет ли циклов;
- есть ли вход и выход;
- нет ли подвешенных нод;
- допустима ли текущая топология;
- не появилось ли конфликтующих входных/выходных ролей.

### 2. Protocol validation

- совместимы ли node types;
- нужен ли hybrid cascade;
- поддерживает ли пара нужный stack;
- совместимы ли transport/security;
- допустим ли выбранный режим.

### 3. Runtime validation

- есть ли agent;
- есть ли SSH/runtime;
- доступна ли нода;
- готов ли sidecar;
- не конфликтуют ли порты.

### 4. Operational validation

- не перегружена ли нода;
- не используется ли она уже в критичном каскаде;
- нет ли опасного SPOF;
- не слишком ли длинная цепочка;
- нет ли высокого latency-risk.

## Как лучше реализовывать по этапам

### Phase 0 — Blueprint and refactor boundary

Сделать то, что нужно сейчас:

- зафиксировать продуктовую модель;
- определить, что переиспользуется из текущего Celerity слоя;
- отделить topology-domain от старого UI слоя.

Результат:

- этот документ;
- список reusable модулей;
- границы будущего builder-модуля.

### Phase 1 — Experimental Builder inside this fork

Сделать отдельный новый раздел внутри этого репо:

- route: `/panel/cascades/builder`
- отдельный view
- отдельный JS bundle
- reuse текущего topology API

Функции:

- canvas;
- drag-to-connect;
- inspector;
- save draft;
- validate draft.

На этом этапе deploy можно оставить простым.

### Phase 2 — Validation-first orchestration

Добавить:

- полноценный validation engine;
- inline warnings/errors;
- deploy preview;
- chain plan generation.

Именно здесь конструктор начинает быть “умным”, а не просто красивым.

### Phase 3 — Real orchestration UX

Добавить:

- versioning flow;
- rollback preview;
- dry-run;
- reusable templates;
- duplicate flow / clone / branch.

### Phase 4 — Migration ideas into Hidden Rabbit

После того как эксперимент созреет:

- забираем доменную модель;
- забираем validation logic;
- забираем interaction patterns;
- UI и визуальный язык уже делаем заново под настоящий Hidden Rabbit.

## Что конкретно стоит переиспользовать в этом репо уже сейчас

### Переиспользовать почти напрямую

- `public/js/network.js`:
  - canvas mechanics;
  - fit/layout logic;
  - edge interaction;
  - position save/load;
- `src/services/cascadeService.js`:
  - topology building;
  - chain order logic;
  - compatibility checks;
  - deploy chain foundation;
- `src/routes/cascade.js`:
  - topology read/write;
  - link create/update/deploy endpoints as temporary compatibility layer.

### Обернуть и постепенно заменить

- `CascadeLink` как primary entity;
- node role storage at node level;
- modal-heavy editing flow;
- current toolbar/legend approach.

## Как должен ощущаться дизайн

Не старая “сетевая админка”, а современный инженерный tool.

Визуальный характер:

- clean canvas;
- спокойная инженерная типографика;
- плотные, но понятные карточки;
- аккуратные связи;
- умные подсветки состояний;
- минимум случайного визуального шума;
- ощущение product-lab инструмента, а не legacy panel.

Что особенно важно:

- canvas должен быть центром;
- inspector должен быть быстрым и полезным;
- ошибки должны быть видны сразу;
- не должно быть ощущения “заполни 25 полей и потом посмотрим, что выйдет”.

## Что можно проверить в этом форке как эксперименты

Этот форк удобно использовать как полигон для следующих экспериментов:

1. drag-to-connect c auto-suggestion роли;
2. inline validator поверх текущего topology graph;
3. deploy preview panel;
4. flow draft/save/version;
5. role-in-flow model поверх текущих link-данных;
6. visual grouping by country / region / provider;
7. route templates.

## Чего не надо делать на первом этапе

- не тянуть туда сразу весь Hidden Rabbit;
- не делать full rewrite всего panel UI ради этого;
- не переносить это сразу в Next.js только потому что “так красивее”;
- не строить огромную универсальную платформу orchestration;
- не смешивать экспериментальный builder с production deploy логикой без validation boundary.

## Рекомендуемый следующий практический шаг

Следующий правильный шаг после этого blueprint:

1. сделать короткий technical design doc по архитектуре `Cascade Builder v1`;
2. выделить reusable code map:
   - что берём из `network.js`;
   - что берём из `cascadeService.js`;
   - что оставляем legacy;
3. создать отдельный route/view для experimental builder;
4. уже там начать делать новый UX, а не ломать текущую `Карту сети`.

## Итог

Текущая `Карта сети` в Celerity — это не мусор и не временная декоративная штука.
Это хороший прототипный фундамент.

Но в Hidden Rabbit нужно развивать не просто карту, а полноценный визуальный конструктор каскадов:

- flow-centric;
- validation-first;
- deploy-aware;
- с живым canvas UX;
- с переносимой доменной логикой.

Этот форк можно использовать как лабораторию, где:

- проверяем механику;
- выращиваем доменную модель;
- собираем orchestration-подход;
- а потом переносим уже зрелые идеи в основной продукт.
