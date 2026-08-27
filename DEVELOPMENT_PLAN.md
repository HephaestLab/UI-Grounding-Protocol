# UGP v0.1 可执行开发计划

> 状态：可执行草案  
> 适用范围：UI Grounding Protocol v0.1 Alpha  
> 配套文档：[项目总方案](PROJECT_PLAN.md) · [技术决策](TECHNICAL_DECISIONS.md) ·
> [参考场景](REFERENCE_SCENARIOS.md) · [验收方案](ACCEPTANCE_PLAN.md)

## 1. 目的

本文把项目总方案转换为可以直接创建 GitHub Milestone、Issue 和 Pull
Request 的开发计划。每项工作都必须具备：

- 明确输入；
- 明确产物；
- 明确依赖；
- 可自动验证的完成条件；
- 必要的真实浏览器验收；
- 可追溯到协议条款和 Conformance Case 的编号。

v0.1 的目标不是完成整个生态，而是证明一个最小、完整且不与 Agent
Surface 重复的闭环：

```text
业务组件注册语义节点
  → 用户在真实页面产生选择
  → 选择被解析为权威业务指称
  → 应用按权限产生最小上下文
  → 结果被确定性消费者读取
```

v0.1 不执行任何业务写动作。

---

## 2. v0.1 交付范围

### 2.1 必须交付

```text
spec/
packages/protocol/
packages/core/
packages/dom/
packages/react/
packages/overlay/
packages/testing/
examples/bi-dashboard/
conformance/
tests/e2e/
```

能力范围：

- Surface、SemanticType、SemanticNode、Anchor；
- Point、Region、Text Selection；
- deterministic Referent Resolution；
- authoritative、derived、inferred 权威等级；
- 父子节点折叠、歧义、同实体去重；
- Surface/Node/Adapter 过期检测；
- ContextDescriptor、ContextProvider、ContextBundle；
- React Hook 和 DOM Anchor；
- 可选选择浮层；
- BI 主参考应用；
- Chromium、Firefox、WebKit 自动化 E2E；
- Codex 内置浏览器黑盒 E2E；
- Conformance、性能、隐私与包发布检查。

### 2.2 明确延期

以下不进入 v0.1 Alpha 发布门槛：

- Agent Surface Adapter；
- MCP、WebMCP、AG-UI Adapter；
- Vue、Svelte、Web Components；
- 跨域 iframe 协议；
- closed Shadow Root；
- 任意视觉/OCR 推断；
- 移动端触摸套索；
- WebGL；
- 持久化 Selection；
- 完整浏览器扩展；
- 动作、确认、策略和 Agent Runtime。

这些可以保留 RFC，不创建空包。

---

## 3. 首版仓库结构

```text
ui-grounding-protocol/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── pull_request_template.md
│   └── workflows/
├── spec/
│   ├── SPEC-v0.1.md
│   ├── terminology.md
│   ├── selection.md
│   ├── resolution.md
│   ├── context.md
│   ├── security.md
│   └── schemas/
├── adr/
├── packages/
│   ├── protocol/
│   ├── core/
│   ├── dom/
│   ├── react/
│   ├── overlay/
│   └── testing/
├── examples/
│   ├── bi-dashboard/
│   ├── document-selection/
│   └── workflow-canvas/
├── conformance/
│   ├── fixtures/
│   ├── runner/
│   └── reports/
├── tests/
│   ├── browser/
│   ├── e2e/
│   ├── performance/
│   └── security/
├── acceptance/
│   └── README.md
├── DEVELOPMENT_PLAN.md
├── ACCEPTANCE_PLAN.md
├── REFERENCE_SCENARIOS.md
├── TECHNICAL_DECISIONS.md
└── PROJECT_PLAN.md
```

---

## 4. 工作流总览

```text
协议条款或 RFC
      ↓
JSON Schema 变更
      ↓
先添加失败的 Conformance Fixture
      ↓
Core 纯逻辑实现
      ↓
DOM/React Adapter 实现
      ↓
真实浏览器自动化测试
      ↓
BI 场景黑盒 E2E
      ↓
性能、安全与包产物检查
      ↓
文档、示例和 Changeset
```

任何实现 PR 不得只修改代码而不说明对应协议条款和测试编号。

---

## 5. Milestone 与任务拆分

## M0：仓库与协议骨架

目标：建立可持续开发基础，冻结首版术语和项目边界。

### UGP-001 建立独立 Monorepo

产物：

- pnpm workspace；
- TypeScript strict 配置；
- Vite library/example 配置；
- Vitest、Playwright；
- ESLint、Prettier；
- Changesets；
- GitHub Actions；
- Apache-2.0、CC BY 4.0、DCO 和治理文件。

完成条件：

- 干净环境能够安装、构建、测试和打包；
- CI 使用锁文件的 frozen install；
- 没有业务项目依赖；
- 示例包不被发布到 npm。

### UGP-002 冻结术语

必须定义：

- Surface；
- SemanticNode；
- Anchor；
- Selector；
- Selection；
- ResolvedReferent；
- GroundingBundle；
- ContextBundle；
- authority；
- evidence；
- revision；
- ambiguity。

完成条件：

- 每个术语有正例、反例和边界；
- 文档不使用 `component`、`entity`、`node` 表示同一概念；
- 明确 UGP 不执行动作。

### UGP-003 建立 ADR

至少创建：

- ADR-001：规范来源与类型生成；
- ADR-002：Node/Anchor/entityRef 身份；
- ADR-003：Revision 与失效；
- ADR-004：坐标系与 Transform；
- ADR-005：Resolver 排序与折叠；
- ADR-006：Context 授权；
- ADR-007：React 生命周期；
- ADR-008：浏览器支持与测试证据。

完成条件：每项状态为 Accepted 或明确的 Experimental，不允许实现依赖未记录的口头决策。

### M0 退出门禁

- `pnpm install --frozen-lockfile` 成功；
- 空包能够 build/test/pack；
- SPEC、ADR、Schema 目录存在；
- README 首屏说明与 Agent Surface 的区别；
- CI 在 Windows、Linux 至少各运行一次基础检查。

---

## M1：协议、Schema 与 Conformance Fixtures

目标：在写运行时之前建立机器可验证合约。

### UGP-101 编写 SPEC-v0.1

要求：

- 使用 MUST、MUST NOT、SHOULD、MAY；
- 每个 MUST 关联测试或审计方法；
- 协议对象的未知字段处理清楚；
- 扩展命名、版本和错误行为清楚；
- 区分规范性章节与说明性示例。

### UGP-102 编写 JSON Schema 2020-12

首批 Schema：

```text
surface.schema.json
semantic-node.schema.json
anchor.schema.json
selector.schema.json
selection.schema.json
resolved-referent.schema.json
grounding-bundle.schema.json
context-bundle.schema.json
grounding-problem.schema.json
```

完成条件：

- Schema 自身通过 meta-schema 验证；
- 正例全部通过；
- 每个 required、enum、pattern 和跨对象约束有负例；
- 生成 TypeScript 类型并检查生成物无漂移；
- Ajv 使用独立的 Draft 2020-12 实例。

### UGP-103 建立 Conformance Fixture 格式

每个 Fixture 包含：

```text
id
profiles
surface
nodes
anchors
selection
expected.referents
expected.ambiguity
expected.problem
normativeRequirements
```

首批 Fixture：

- point exact；
- point nested；
- region multiple；
- region parent collapse；
- region ambiguous overlap；
- text quote/position；
- stale surface；
- stale node；
- same entity multiple views；
- unauthorized context；
- budget truncation。

### M1 退出门禁

- 全部协议对象有 Schema；
- 至少 20 个正例和 20 个负例；
- Conformance Runner 能输出 JSON 和 Markdown 报告；
- Schema/类型生成在 CI 中零漂移；
- 规范条款与测试编号可双向追踪。

---

## M2：纯逻辑 Core

目标：不依赖 DOM 和 React 完成确定性解析核心。

### UGP-201 Semantic Registry

实现：

- register/update/unregister；
- nodeId 和 entityRef 索引；
- parent/child 关系；
- Anchor 注册；
- monotonic semanticRevision；
- Registry snapshot；
- AbortSignal 和资源释放。

必须测试：

- 重复身份；
- 循环父子关系；
- 卸载；
- 并发读取；
- 过期引用；
- 同实体多节点。

### UGP-202 Geometry Core

实现纯函数：

- point in rect/polygon；
- rect intersection；
- polygon intersection；
- visible ratio；
- coordinate transform；
- clipping；
- z-order/priority metadata；
- 数值容差。

验证：

- 边界点；
- 零面积；
- 负坐标；
- 缩放和旋转；
- 超大/极小值；
- 属性测试：平移不变性、缩放比例不变性、交集对称性。

### UGP-203 Referent Resolver

管线：

```text
validate selection
  → collect candidates
  → reject invisible/stale
  → compute evidence
  → score and order
  → collapse parent/child
  → deduplicate entityRef
  → classify ambiguity
  → emit GroundingBundle
```

要求：

- 相同输入和 revision 产生字节级稳定排序；
- tie-breaker 明确；
- inferred 永远不覆盖 authoritative；
- 歧义不得被随机消除；
- 结果始终包含 authority 和 evidence。

### UGP-204 Context Contract

实现：

- ContextDescriptor 注册；
- materialize request；
- budget；
- omitted reason；
- freshness；
- cancellation；
- output Schema validation。

UGP 不实现身份系统，只测试 Host Provider 是否得到完整授权输入并正确返回。

### M2 退出门禁

- Conformance Core/Profile 全部通过；
- Core 分支覆盖率不低于 95%；
- 所有几何不变量属性测试通过；
- Resolver 无 DOM、React、模型或网络依赖；
- 相同 Fixture 连续执行 1,000 次结果一致。

---

## M3：DOM、React 与选择浮层

目标：把 Core 接入真实浏览器页面。

### UGP-301 DOM Anchor

实现：

- WeakMap<Element, Anchor[]>；
- element visibility；
- clipping ancestor；
- elementFromPoint/elementsFromPoint；
- getClientRects；
- DOM ancestry；
- Portal；
- open Shadow Root；
- scroll container；
- ResizeObserver/IntersectionObserver 复用。

禁止：

- 全页面持续扫描；
- 每帧读取所有 Geometry；
- 把业务对象 JSON 写入 data attribute；
- CSS selector 作为唯一业务身份。

### UGP-302 React Adapter

实现：

- `GroundingSurfaceProvider`；
- `useGroundingNode`；
- callback ref Anchor；
- Strict Mode 安全注册/注销；
- Handler/Context Provider 最新值；
- SSR inert behavior；
- `useSyncExternalStore` 订阅 Registry snapshot。

必须验证：

- React Strict Mode effect replay；
- list reorder；
- key change；
- mount/unmount；
- Suspense/conditional render；
- Portal；
- hydration 后再启用 Surface。

### UGP-303 Selection Overlay

实现：

- Point 模式；
- Rect Region 模式；
- 原生 Text Selection 捕获；
- Escape 取消；
- 键盘启用/关闭；
- 不吞掉非选择模式下的应用事件；
- 选区高亮与候选预览；
- 歧义选择 UI；
- 可访问名称和焦点管理。

### UGP-304 Browser Component Tests

使用真实浏览器而不是 jsdom 验证：

- pointer events；
- DOMRect；
- selection/range；
- clipping；
- scroll；
- transform；
- Shadow DOM；
- ResizeObserver。

### M3 退出门禁

- Point、Region、Text 在 Chromium/Firefox/WebKit 通过；
- Overlay 开关关闭时不拦截应用交互；
- 禁用 UGP 后 DOM 结构、布局和截图无差异；
- 没有持续 polling/rAF 扫描；
- 真实浏览器组件测试通过。

---

## M4：BI 主参考应用

目标：用一个真实业务模型覆盖 DOM、Canvas、SVG、虚拟列表、文字和动态数据。

具体定义见 [REFERENCE_SCENARIOS.md](REFERENCE_SCENARIOS.md)。

### UGP-401 确定性 BI Backend

实现：

- 固定 seed 数据；
- Dashboard、Metric、Dimension、Series、Record 模型；
- 查询、筛选、排序、上下文接口；
- analyst/viewer 两种权限；
- scenario reset/mutate 接口；
- 请求和响应 Schema；
- 无外部网络依赖。

### UGP-402 BI Dashboard UI

组件：

- KPI Cards；
- Canvas Line Chart；
- SVG Bar Chart；
- Filter Panel；
- Virtualized Detail Table；
- Narrative Insight；
- Grounding Inspector。

### UGP-403 BI Semantic Model

至少声明：

- dashboard；
- metric；
- chart；
- series；
- interval；
- dimension-member；
- record；
- filter；
- insight；
- text-fragment。

### UGP-404 Chart Adapter

同一参考 Adapter 必须支持：

- ECharts Canvas renderer；
- ECharts SVG renderer；
- point hit；
- rectangular brush；
- data point/series/interval referent；
- chart resize；
- devicePixelRatio；
- filter 后 adapterRevision 失效。

### UGP-405 Virtual Table

要求：

- 10,000 条逻辑记录；
- DOM 仅渲染可见行；
- getItemKey 使用业务 record ID；
- 排序、筛选、滚动回收后命中正确实体；
- 屏幕外逻辑实体不得伪装为可见 Anchor。

### M4 退出门禁

- BI-01 至 BI-20 自动化场景通过；
- analyst/viewer Context 差异正确；
- Canvas、SVG、DOM 和 Text 结果使用同一 GroundingBundle Schema；
- 过滤前 Selection 在过滤后按规范失败或显式重解析；
- 无外部 API、时间或随机因素影响结果。

---

## M5：产品级验收与发布准备

目标：证明代码正确、真实页面可用、发布包可消费。

### UGP-501 自动化 E2E

- Chromium；
- Firefox；
- WebKit；
- Desktop 1440×900；
- Compact 1024×768；
- 高 DPR 模拟；
- trace retain-on-failure；
- 关键路径截图和 GroundingBundle attachment。

### UGP-502 Codex 内置浏览器黑盒验收

必须由 Codex 使用内置浏览器操作 production build，不能只依靠测试脚本。完整步骤见
[ACCEPTANCE_PLAN.md](ACCEPTANCE_PLAN.md)。

### UGP-503 性能与资源

- Registry 1K/10K Node；
- Point/Region p50/p95/p99；
- 内存释放；
- scroll/resize 时主线程 Long Task；
- ContextBundle size；
- package minified/brotli size。

### UGP-504 安全与隐私

- Prompt Injection fixture；
- unauthorized Context；
- inferred authority escalation；
- stale Selection；
- cross-tenant entityRef；
- production debug disclosure；
- malicious Adapter output Schema validation。

### UGP-505 Consumer Pack Smoke Test

在临时空项目中验证：

- 安装打包后的 tarball；
- ESM import；
- 类型解析；
- React peer dependency；
- tree shaking；
- CSS 显式导入；
- 无未声明运行时依赖。

### M5 退出门禁

- [ACCEPTANCE_PLAN.md](ACCEPTANCE_PLAN.md) 全部发布门禁通过；
- 无 P0/P1 缺陷；
- P2 缺陷有公开 issue 和明确不影响协议正确性的说明；
- 自动 E2E、浏览器黑盒、性能、安全报告齐全；
- README Quick Start 在干净项目可复现。

---

## M6：v0.1 Alpha 发布

### UGP-601 发布候选

- 冻结 Schema；
- 生成 API 文档；
- 生成 Conformance Report；
- 生成 CHANGELOG；
- 生成 SBOM；
- 签署 Git tag；
- dry-run npm publish；
- GitHub Release Candidate。

### UGP-602 最终审计

- 从 Git tag 重新构建；
- 校验产物 hash；
- 重跑 pack smoke；
- 重跑 BI 自动化 E2E；
- 重跑 Codex 内置浏览器关键路径；
- 归档验收证据。

### 发布条件

- CI 全绿；
- 文档链接无断链；
- Schema 与生成类型一致；
- npm tarball 与 Git tag 对应；
- 公开限制清单完整；
- v0.2 deferred RFC 清楚。

---

## 6. Issue 模板

每个 Issue 必须包含：

```markdown
## Objective

## Protocol requirements

- UGP-REQ-...

## Inputs

## Deliverables

## Non-goals

## Conformance fixtures

## Automated acceptance

## Browser acceptance

## Performance/security impact

## Dependencies

## Definition of Done
```

---

## 7. Pull Request 门禁

PR 必须回答：

- 改变了哪个协议行为？
- 新增或修改了哪个 Fixture？
- 是否改变公开 Schema/API？
- 是否改变 Selection UX？
- 是否需要浏览器验收？
- 是否增加布局读取、Observer 或事件监听？
- 是否扩大 Context 暴露？
- 是否引入 Capability 执行路径？如果是，直接拒绝或转为外部 Adapter。

必跑命令：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:browser
pnpm test:conformance
pnpm build
pnpm pack:smoke
```

触及 DOM、Overlay、Geometry、Context、Chart Adapter 时额外运行：

```text
pnpm test:e2e
pnpm test:performance
pnpm test:security
```

---

## 8. 开发节奏

建议使用两周一个 Milestone Checkpoint，但发布按门禁而不是日期：

| 周期        | 目标                                            |
| ----------- | ----------------------------------------------- |
| 第 1–2 周   | M0：仓库、术语、ADR                             |
| 第 3–4 周   | M1：SPEC、Schema、Fixture                       |
| 第 5–7 周   | M2：Registry、Geometry、Resolver、Context       |
| 第 8–10 周  | M3：DOM、React、Overlay                         |
| 第 11–13 周 | M4：BI Backend、Dashboard、Chart、Virtual Table |
| 第 14–15 周 | M5：E2E、浏览器验收、性能与安全                 |
| 第 16 周    | M6：Release Candidate 与 Alpha                  |

时间是估算，不得为了日期跳过 Conformance 或浏览器验收。

---

## 9. 可并行与不可并行工作

### 可并行

- SPEC 文案与 JSON Schema；
- BI 数据模型与 Dashboard 视觉实现；
- Geometry 属性测试与 Context 安全测试；
- 自动化 E2E 场景编写与文档站搭建。

### 不可提前

- Resolver 规则未冻结前，不开发 AI Skill；
- Core Fixture 未通过前，不开发复杂 Adapter；
- DOM 闭环未通过前，不开发 MCP/WebMCP；
- BI 主场景未通过前，不声称协议通用；
- 自动化 E2E 未通过前，不进行最终人工浏览器验收；
- 验收证据未归档前，不发布 npm Alpha。

---

## 10. 完成定义

UGP v0.1 的“完成”不是代码文件存在，而是：

1. 规范、Schema、实现和 Fixture 一致；
2. BI 主场景在三个浏览器自动通过；
3. Codex 能在内置浏览器中从零完成关键用户路径；
4. 页面选择准确映射到固定业务实体；
5. 动态筛选、排序、滚动和重渲染不会造成身份漂移；
6. Context 授权与预算可验证；
7. 禁用 UGP 后页面无视觉和交互回归；
8. Core 没有能力执行、模型调用或业务权限引擎；
9. 干净消费者项目可以安装和使用发布包；
10. 每项结论都有可审计证据。
