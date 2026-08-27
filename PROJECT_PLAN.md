# UI Grounding Protocol（UGP）独立项目方案

> 文档状态：优化后的立项草案  
> 目标版本：UGP v0.1  
> 项目类型：开放协议、参考实现、AI 开发 Skill 与一致性测试  
> 核心方向：将人类在界面中的可见选择，解析为应用声明的权威业务指称  
> 项目边界：独立、通用、跨框架、与 Agent/模型/能力执行平台解耦

## 开发执行文档

本方案已经补充为可直接启动开发和验收的文档集：

- [UGP v0.1 可执行开发计划](DEVELOPMENT_PLAN.md)：Milestone、任务依赖、产物、退出门禁和 PR 流程；
- [UGP v0.1 参考场景](REFERENCE_SCENARIOS.md)：BI 主场景、文档选择与工作流画布辅助场景；
- [UGP v0.1 技术决策](TECHNICAL_DECISIONS.md)：已冻结技术栈、ADR、默认方案和待决产品问题；
- [UGP v0.1 验收与审计方案](ACCEPTANCE_PLAN.md)：Coding、三浏览器自动化、Codex 内置浏览器黑盒 E2E、性能、安全与发布证据。

开发应以这四份执行文档为准；本文件负责项目定位、协议全貌和长期路线。

## 1. 执行摘要

UI Grounding
Protocol（以下简称 UGP）是一套面向 AI 原生人机交互的开放协议和参考工具链。它标准化解决一个尚未被现有 Agent 能力系统完整覆盖的问题：

> 用户在界面中点击、框选、圈选或选择了一段内容后，应用如何把这个可见目标稳定地解析成权威业务对象，并向 AI 提供最小、可信、可审计的上下文和外部能力引用？

UGP 的输入是用户对界面的选择，输出是应用可证明的业务指称：

```text
用户选择的像素、文字或界面区域
                  ↓
可验证的界面 Anchor 与 Selector
                  ↓
应用声明的 SemanticNode
                  ↓
ResolvedReferent
entityRef + semanticType + authority + evidence
                  ↓
最小 ContextBundle + 外部 CapabilityReference
```

UGP 不执行 Agent 动作，不维护 Agent 能力权限，不提供模型循环，也不与现有 Agent
Surface、MCP 或 WebMCP 竞争。它负责的边界在“选择解析和上下文落地”，随后将动作交给外部能力系统。

项目由四类交付物组成：

1. **UGP Specification**：选择、锚点、语义节点、指称解析、上下文和能力引用协议。
2. **UGP Reference SDK**：框架无关核心、DOM/文字/Canvas 适配器和 React 绑定。
3. **UGP Frontend Skill**：指导编码 Agent 为前端构建正确语义锚点和测试。
4. **UGP Conformance
   Tooling**：选择调试浮层、浏览器 DevTools、CLI、E2E 和性能基准。

---

## 2. 项目名称与定位

### 2.1 暂定名称

- 正式名：**UI Grounding Protocol**
- 简称：**UGP**
- GitHub 仓库：`ui-grounding-protocol`
- npm scope：`@ui-grounding/*`
- CLI：`ugp`
- Skill：`ugp-frontend`

### 2.2 一句话定位

> A vendor-neutral protocol for resolving what users point at in an interface
> into authoritative application referents.

### 2.3 传播短句

> Point at the interface. Get the ground truth behind it.

### 2.4 中文定义

UGP 可译作“界面指称落地协议”或“界面语义定位协议”。其中 Grounding 特指：

> 从人类已经产生的界面选择出发，将其绑定到应用真实的业务实体和上下文。

它不等同于 GUI
Agent 研究中常见的“把自然语言指令转换为屏幕坐标”。UGP 的默认方向是：

```text
Selection → Authoritative Referent
```

而不是：

```text
Language Instruction → Click Coordinate
```

---

## 3. 为什么需要 UGP

### 3.1 现有方案分别解决了什么

当前生态已经具备多个重要部件：

- ARIA 和可访问性树描述控件角色、名称和状态；
- DOM、截图、OCR 和视觉模型可以推断用户指向的界面元素；
- Agent Surface 可声明组件的 Observation、Action 和 Procedure
  Reference，并提供权限、确认、过期和审计；
- MCP/WebMCP 可以暴露资源和工具；
- AG-UI 可以传输 Agent 事件和共享状态；
- 应用可以自行把选中行、选中图形等状态传给 Agent。

但缺少一个跨框架的公共合约，统一说明：

1. 用户具体选择了哪块可见内容；
2. 该选择对应哪些业务对象；
3. 为什么解析成这些对象；
4. 结果是应用权威声明还是 AI 推断；
5. 页面更新后该选择是否仍然有效；
6. 应暴露哪些最小上下文；
7. 相关动作由哪个外部能力系统提供。

### 3.2 UGP 的核心价值

UGP 让应用回答“这个/这些是什么”，而不是只回答“页面上有哪些工具”。

典型场景：

- 用户框选一个订单卡片，询问“为什么它被标记为风险？”；
- 用户圈选四个图表数据点，要求“解释这段异常”；
- 用户选择表格中的多行，要求“比较这些客户”；
- 用户选择富文本中的一个段落，要求“根据该段落修改项目计划”；
- 用户在 Canvas 白板中圈选多个图形，要求“把它们整理为一个流程”；
- 用户框选一块包含多个父子对象的区域，系统自动选择合适业务粒度。

---

## 4. 与现有项目的边界

### 4.1 UGP 与 Agent Surface

[Wiseair agent-surface](https://github.com/Wiseair-srl/agent-surface)
解决的是前端能力控制面：组件声明类型化 Observation、Action 和后端 Procedure
Reference，并通过编译清单、运行时 Registry、Policy、Confirmation 和 Audit 安全暴露给 Agent。

UGP 不重新实现这些能力。两者回答不同问题：

| 系统          | 核心问题                            |
| ------------- | ----------------------------------- |
| UGP           | 用户刚刚指向的是哪个应用对象？      |
| Agent Surface | 当前 Agent 可以读取或执行哪些能力？ |

推荐组合方式：

```text
Human Selection
      ↓ UGP
ResolvedReferent(entityRef)
      ↓ UGP Agent Surface Binding
Capability + bound entity input
      ↓ Agent Surface
Policy / Confirmation / Invocation / Audit
```

Agent
Surface 明确不提供 DOM 扫描、Selector、截图解释和坐标控制；这些属于它的[非目标](https://www.agent-surface.dev/11-non-goals)。UGP 专注的正是选择锚点与业务指称之间的标准映射。

### 4.2 UGP 与 Agent-Native Selection State

[Agent-Native](https://www.agent-native.com/docs/context-awareness/)
已支持把 rows、blocks、shapes、assets 等应用选择状态同步给 Agent。这证明“语义选择状态”有真实需求。

UGP 的增量价值是将这种应用内做法标准化为：

- 跨框架协议对象；
- 多种选择模式；
- Anchor 和 Selector；
- 权威等级和解析证据；
- 过期检测；
- 多对象和父子对象消歧；
- Canvas、图表、富文本等适配器；
- 一致性和性能测试。

### 4.3 UGP 与视觉反馈工具

Agentation、React
Grab 等工具擅长选择 DOM 元素、截取视觉上下文并反馈给编码 Agent。UGP 不与其争夺反馈 UI，而是提供可以被这些工具采用的业务语义输出格式。

### 4.4 UGP 与 MCP/WebMCP

MCP/WebMCP 负责资源和工具传输。UGP 负责生成被传输的选择与业务指称。UGP
Core 不注册业务工具，只提供绑定包。

### 4.5 UGP 与 ARIA

ARIA 是可访问性语义的权威来源之一，但通常不足以承载业务身份、业务关系和敏感状态。UGP 可以将 ARIA/AOM 作为降级证据，不把业务私有字段塞进
`aria-label`。

---

## 5. 项目独立性

UGP 必须从第一天满足：

- 独立品牌、仓库、包名、版本、文档和治理；
- 不绑定金融、交易、电商或任何单一业务领域；
- 不依赖某个现有产品作为运行前提；
- 不依赖某个模型厂商或 Agent 平台；
- 不以 React、Vite 或 DOM 作为协议本体；
- 参考实现可优先使用 TypeScript，但 Schema 与协议语言中立；
- 外部项目通过 Adapter 接入，不进入 UGP Core；
- 示例至少覆盖三类无关业务场景。

---

## 6. 规范范围

### 6.1 UGP Core 必须定义

- Surface 的身份、版本和信任边界；
- SemanticType 和 SemanticNode；
- DOM、文字、SVG、Canvas、虚拟对象等 Anchor；
- Point、Region、Text、Semantic、Programmatic Selection；
- Selector 的序列化表示；
- Selection 到 ResolvedReferent 的解析结果；
- `authoritative / derived / inferred` 权威等级；
- 解析证据、关系、置信度和歧义；
- Selection 与 Referent 的过期规则；
- 最小 ContextBundle；
- 外部 ResourceReference 与 CapabilityReference；
- 错误模型和一致性 Profile。

### 6.2 明确不属于 UGP Core

- Agent 模型调用、规划和会话；
- 动作定义、动作执行和工具选择；
- Agent 权限引擎；
- 危险动作确认引擎；
- 后端 RPC 或业务 API；
- WebMCP/MCP Server 运行时；
- 浏览器通用自动化；
- DOM 点击、键盘模拟或坐标操作；
- 完整应用状态同步；
- 设计系统和视觉组件库；
- 用户身份、角色和组织权限存储；
- 持久化审计平台。

### 6.3 设计原则

1. **选择优先**：协议从已发生的用户选择出发。
2. **应用声明优先**：业务语义由应用声明，AI 推断仅降级。
3. **指称而非复制**：优先输出稳定引用，不复制完整对象。
4. **最小上下文**：只为选中指称投影必要信息。
5. **渲染解耦**：不改变应用正常 DOM、布局和渲染路径。
6. **执行解耦**：动作只引用外部能力系统。
7. **证据可审计**：每个解析结果都能说明命中依据。
8. **过期可检测**：选择和对象版本变化不能被静默忽略。
9. **复杂界面一等公民**：Canvas、图表和编辑器不是事后补丁。
10. **可测试**：每条规范性要求应有测试或审计办法。

---

## 7. 总体架构

```text
┌───────────────────────────────────────────────────────────────┐
│ Human Interaction                                             │
│ click · marquee · lasso · text range · semantic multi-select │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│ Selection Adapter                                             │
│ DOM · Text · SVG · Canvas · Chart · Editor · Virtual List    │
└──────────────────────────────┬────────────────────────────────┘
                               │ Selection
┌──────────────────────────────▼────────────────────────────────┐
│ Referent Resolver                                             │
│ exact anchor · ancestry · geometry · relation · disambiguate │
└──────────────────────────────┬────────────────────────────────┘
                               │ ResolvedReferent[]
┌──────────────────────────────▼────────────────────────────────┐
│ Semantic Registry + Context Materializer                      │
│ node identity · authority · projections · budget · freshness │
└──────────────────────────────┬────────────────────────────────┘
                               │ GroundingBundle
┌──────────────────────────────▼────────────────────────────────┐
│ Consumer Bindings                                             │
│ Agent Surface · MCP · WebMCP · AG-UI · App-specific bridge   │
└───────────────────────────────────────────────────────────────┘
```

### 7.1 语义平面

UGP 在渲染平面之外维护轻量语义平面：

- 组件挂载时注册 SemanticNode 和 Anchor；
- DOM 元素通过 WeakMap 与节点关联；
- 状态只在 Context 请求时按需生成；
- Geometry 只在选择或调试时读取；
- 节点卸载时注销；
- 不要求增加 wrapper DOM；
- 不在 DOM attribute 中写入完整业务状态；
- 不持续扫描全页面。

---

## 8. 协议对象

UGP v0.1 定义以下核心对象：

1. `Surface`
2. `SemanticType`
3. `SemanticNode`
4. `Anchor`
5. `Selector`
6. `Selection`
7. `ResolvedReferent`
8. `GroundingBundle`
9. `ContextBundle`
10. `ResourceReference`
11. `CapabilityReference`
12. `GroundingProblem`

### 8.1 Message Envelope

```ts
interface UGPEnvelope<T> {
  ugpVersion: '0.1';
  messageId: string;
  type: string;
  surfaceId: string;
  timestamp: string;
  traceparent?: string;
  payload: T;
}
```

要求：

- `messageId` 推荐使用 UUIDv7；
- 时间为 RFC 3339；
- 未识别的非关键字段必须安全忽略；
- 关键扩展必须显式协商。

### 8.2 Surface

```ts
interface Surface {
  surfaceId: string;
  uri: string;
  title?: string;
  locale?: string;
  revision: string;
  parentSurfaceId?: string;
  trustBoundary: 'same-origin' | 'cross-origin' | 'sandboxed';
  selectionModes: Array<
    'point' | 'region' | 'lasso' | 'text' | 'semantic' | 'programmatic'
  >;
  profiles: string[];
}
```

`revision` 表示影响选择解析的可见结构版本。它不要求等同于应用数据库版本。

### 8.3 SemanticType

```ts
interface SemanticType {
  type: string;
  title: string;
  description: string;
  version: string;
  schema?: JsonSchema;
  extends?: string[];
}
```

命名采用受治理命名空间：

```text
org.example.commerce.order
org.example.project.task
org.example.analytics.series
ugp.ui.text-fragment
```

UGP Core 只保留少量通用类型；业务类型由应用和行业扩展维护。

### 8.4 SemanticNode

```ts
interface SemanticNode {
  nodeId: string;
  type: string;
  label: string;
  description?: string;
  authority: 'authoritative' | 'derived' | 'inferred';
  entityRef?: EntityReference;
  parentNodeId?: string;
  childNodeIds?: string[];
  anchorIds: string[];
  contextDescriptors?: ContextDescriptor[];
  capabilityRefs?: CapabilityReference[];
  resourceRefs?: ResourceReference[];
  tags?: string[];
  revision?: string;
  validAt?: string;
  expiresAt?: string;
}

interface EntityReference {
  namespace: string;
  id: string;
  type?: string;
  revision?: string;
}
```

约束：

- `nodeId` 只需在当前 Surface 生命周期唯一；
- `entityRef` 表示业务身份，不使用 CSS selector 代替；
- ID 不得包含 Token、邮箱、手机号等敏感信息；
- `description` 是不可信内容，不得被客户端当成系统指令；
- 同一 `entityRef` 可以有多个可见节点和 Anchor。

### 8.5 Anchor

```ts
type Anchor =
  | RuntimeDomAnchor
  | SerializableDomAnchor
  | TextAnchor
  | SvgAnchor
  | CanvasAnchor
  | VirtualAnchor
  | AccessibilityAnchor;
```

Anchor 的职责是把语义节点与可见载体关联，而不是作为业务身份。

```ts
interface AnchorBase {
  anchorId: string;
  nodeId: string;
  kind: string;
  surfaceRevision: string;
  priority?: number;
  visibility?: 'visible' | 'occluded' | 'offscreen' | 'unknown';
}
```

DOM 参考实现优先使用运行时元素引用；CSS/XPath 仅用于序列化、调试和重连，不是唯一身份来源。

### 8.6 Selector

UGP 复用 W3C Web Annotation 的 Selector 思路，支持：

- CSS Selector；
- XPath Selector；
- Text Quote Selector；
- Text Position Selector；
- Range Selector；
- SVG Selector；
- Fragment Selector；
- UGP Geometry Selector；
- UGP Semantic Selector。

```ts
interface SemanticSelector {
  type: 'UGPSemanticSelector';
  entityRef?: EntityReference;
  semanticType?: string;
  nodeId?: string;
}
```

### 8.7 Selection

```ts
interface Selection {
  selectionId: string;
  surfaceId: string;
  mode: 'point' | 'region' | 'lasso' | 'text' | 'semantic' | 'programmatic';
  selectors: Selector[];
  geometry?: NormalizedGeometry;
  surfaceRevision: string;
  createdAt: string;
  intentHint?: 'inspect' | 'explain' | 'compare' | 'reference' | 'act';
  source: 'human' | 'application' | 'agent';
}
```

`source: "agent"`
只表示 Agent 请求解析一个选择，不授予它生成任意点击或执行动作的权限。

### 8.8 ResolvedReferent

```ts
interface ResolvedReferent {
  nodeId: string;
  type: string;
  entityRef?: EntityReference;
  label: string;
  authority: 'authoritative' | 'derived' | 'inferred';
  confidence: number;
  relation:
    | 'exact'
    | 'contains-selection'
    | 'contained-by-selection'
    | 'intersects'
    | 'nearest'
    | 'text-overlap';
  evidence: ResolutionEvidence[];
  surfaceRevision: string;
  nodeRevision?: string;
  ambiguousWith?: string[];
}
```

权威节点的 `confidence`
不等于模型置信度，而表示解析器对“这个选择命中了该应用声明节点”的确定程度。

### 8.9 GroundingBundle

```ts
interface GroundingBundle {
  groundingId: string;
  selection: Selection;
  referents: ResolvedReferent[];
  relationships?: SemanticRelationship[];
  omitted?: OmittedResult[];
  ambiguity?: {
    requiresDisambiguation: boolean;
    candidates?: ResolvedReferent[];
    reason?: string;
  };
  generatedAt: string;
}
```

GroundingBundle 不自动包含业务详情，避免一次选择导致大规模状态泄漏。

### 8.10 ContextBundle

```ts
interface ContextBundle {
  contextId: string;
  groundingId: string;
  referentContexts: ReferentContext[];
  resources?: ResourceReference[];
  capabilityRefs?: CapabilityReference[];
  budget: {
    requestedBytes: number;
    emittedBytes: number;
    truncated: boolean;
  };
  authorization?: {
    principalRef?: string;
    purpose: string;
    filtered: boolean;
  };
  generatedAt: string;
}
```

ContextBundle 由宿主应用授权后的 Context
Provider 生成。UGP 规定输入输出合约，但不实现组织权限系统。

### 8.11 CapabilityReference

```ts
interface CapabilityReference {
  provider: string;
  capabilityId: string;
  uri?: string;
  targetBindings?: Record<string, BindingExpression>;
  discoveryHint?: string;
}
```

示例：

```json
{
  "provider": "agent-surface",
  "capabilityId": "domain:orders.assign",
  "targetBindings": {
    "orderId": "$.referent.entityRef.id"
  }
}
```

UGP 不复制外部能力的输入 Schema、权限和确认逻辑。消费者必须从对应 Provider 获取最新能力描述。

### 8.12 GroundingProblem

错误采用 RFC 9457 Problem Details 风格：

```ts
interface GroundingProblem {
  type: string;
  title: string;
  status?: number;
  detail: string;
  code:
    | 'SURFACE_STALE'
    | 'SELECTION_INVALID'
    | 'NO_REFERENT'
    | 'AMBIGUOUS_REFERENT'
    | 'ANCHOR_STALE'
    | 'CONTEXT_UNAUTHORIZED'
    | 'CONTEXT_BUDGET_EXCEEDED'
    | 'ADAPTER_UNAVAILABLE';
  retryable: boolean;
  invalidParams?: Array<{ path: string; reason: string }>;
  recovery?: string;
}
```

---

## 9. 解析模型

### 9.1 解析顺序

参考解析器按以下证据优先级处理：

1. 应用直接提供的 Semantic Selection；
2. 运行时 Anchor 精确命中；
3. 命中 DOM 元素的直接语义节点；
4. DOM 祖先和后代的业务节点；
5. 文字范围与 Text Anchor；
6. 区域/套索与可见 Geometry 相交；
7. Canvas、SVG、图表和编辑器 Adapter；
8. ARIA/AOM 派生节点；
9. OCR/视觉模型推断节点。

前七类可以产生 `authoritative` 或 `derived`；视觉/OCR 默认只能产生 `inferred`。

### 9.2 Point Selection

- 优先返回最深的可独立询问业务节点；
- 纯 UI 原子元素向上解析到业务节点；
- 覆盖层不得让不可见底层节点获得 exact 命中；
- 多个同层节点命中时按 Anchor priority 和 z-order 排序；
- 选择按钮时可返回按钮所属业务对象，而不是 Button 本身。

### 9.3 Region/Lasso Selection

每个候选节点计算：

- 选区覆盖节点的比例；
- 节点覆盖选区的比例；
- 可见面积比例；
- 父子层级；
- z-order 与遮挡；
- Anchor priority；
- 业务粒度和可独立性。

默认规则：

- 纯装饰节点不参与；
- 父节点几乎完整覆盖且子节点数量过多时返回父节点；
- 用户精确圈选少量子节点时返回子节点；
- 默认最多返回 20 个 referent；
- 超限时返回聚合指称或明确要求缩小范围；
- 低置信度歧义不得静默自动决定。

### 9.4 Text Selection

- 使用 Text Quote + Text Position 组合提高重连能力；
- 富文本编辑器优先使用自身文档模型位置；
- 文字内容变化后校验 Surface/Document revision；
- 可以同时返回文字片段节点和所属业务文档节点；
- 上下文生成时保留用户选择的原文，但受大小和敏感策略限制。

### 9.5 父子消歧

协议不规定所有应用必须使用同一粒度，而规定结果必须给出关系和证据。

示例：用户框选一个包含标题、状态、金额的订单卡片：

- 返回订单节点作为 primary referent；
- 标题和金额节点作为 `part-of` 关系可省略；
- 若用户只精确选择金额，则返回金额字段节点并附带所属订单关系。

### 9.6 多视图同一实体

同一个业务实体可能同时出现在表格、图表和详情侧栏。UGP 允许多个节点共享
`entityRef`，ContextBundle 可按实体去重，但保留每个选择来源和视图关系。

---

## 10. 复杂界面适配

### 10.1 Adapter 接口

```ts
interface SelectionSurfaceAdapter {
  adapterId: string;
  kinds: string[];
  hitTest(point: Point, signal: AbortSignal): Promise<AnchorHit[]>;
  queryRegion(region: Geometry, signal: AbortSignal): Promise<AnchorHit[]>;
  resolveText?(range: unknown, signal: AbortSignal): Promise<AnchorHit[]>;
  getGeometry(anchorId: string): Geometry | Promise<Geometry>;
  subscribeInvalidation(
    listener: (event: InvalidationEvent) => void,
  ): () => void;
}
```

### 10.2 Canvas/WebGL

- 组件负责命中测试，UGP 不读取私有场景树；
- 大量对象不全部注册常驻节点；
- 命中后可生成有 TTL 的临时 SemanticNode；
- Geometry 使用 Surface 坐标系和标准化 transform；
- 必须明确当前 viewport、缩放和 DPR。

### 10.3 图表

参考类型：

- chart；
- plot-area；
- series；
- data-point；
- interval；
- annotation；
- legend-item。

图表 Adapter 可以将区域框选解析为一个时间区间指称，而不是返回数千个数据点。

### 10.4 虚拟列表

- 只对当前渲染项提供可见 Anchor；
- 逻辑节点可以存在，但不能伪装为当前可见；
- instance identity 来自业务数据，不来自 render index；
- 列表滚动或回收 DOM 后旧 Anchor 失效；
- Selection 持有 entityRef 后可以在重新渲染时重连。

### 10.5 富文本编辑器

- 通过编辑器插件访问文档模型；
- 使用 block ID、document revision 和 text selector；
- 支持段落、表格单元格、节点和字符范围；
- 不依赖编辑器内部短命 DOM 结构作为唯一身份。

### 10.6 跨 iframe

- 每个跨域 iframe 是独立 Surface；
- 父页面不能直接读取子页面 UGP Registry；
- 通过显式 postMessage/MCP bridge 协商；
- 来源验证、Surface ID 和消息版本必须校验；
- 沙箱 iframe 只能声明其被授予的能力。

---

## 11. Context Materialization

### 11.1 ContextDescriptor

```ts
interface ContextDescriptor {
  name: string;
  description: string;
  schema: JsonSchema;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  freshness: 'snapshot' | 'live' | 'on-demand';
  maxAgeMs?: number;
  estimatedBytes?: number;
}
```

### 11.2 ContextProvider

```ts
interface ContextProvider {
  materialize(request: {
    referents: ResolvedReferent[];
    principal?: unknown;
    purpose: string;
    requestedContexts?: string[];
    budgetBytes: number;
    signal: AbortSignal;
  }): Promise<ContextBundle>;
}
```

宿主应用负责：

- 识别 principal；
- 检查字段权限；
- 过滤敏感值；
- 保证投影数据时效；
- 记录必要审计；
- 不把未授权对象存在性泄露给消费者。

UGP 负责：

- 定义请求和响应结构；
- 传递 referent、purpose 和 budget；
- 标记省略、过滤和过期；
- 让客户端区分业务状态与页面不可信文本。

### 11.3 默认上下文预算

- 单节点描述：最多 512 字符；
- 单 Referent brief：最多 2 KiB；
- 默认 ContextBundle：最多 32 KiB；
- 默认 Referent 数量：最多 20；
- 超限内容通过 ResourceReference 延迟读取；
- ContextBundle 不包含整个组件 props 或全局 Store。

---

## 12. 外部能力绑定

### 12.1 Agent Surface Binding

包名：`@ui-grounding/agent-surface`

职责：

- 将 ResolvedReferent 映射到 Agent Surface component/entity identity；
- 将 CapabilityReference 映射到已编译 Capability；
- 将 entityRef 绑定到能力输入；
- 校验 Surface/Registration 过期；
- 不绕过 Agent Surface Registry；
- 不复制 Policy、Confirmation 或 Invocation。

### 12.2 MCP Binding

包名：`@ui-grounding/mcp`

建议资源 URI：

```text
ugp://surface/{surfaceId}
ugp://selection/{selectionId}
ugp://grounding/{groundingId}
ugp://context/{contextId}
ugp://referent/{surfaceId}/{nodeId}
```

MCP Binding 只提供 UGP 资源和解析工具，不注册应用写动作。

### 12.3 WebMCP Binding

建议固定工具：

```text
ugp.get_surface
ugp.resolve_selection
ugp.get_grounding
ugp.get_context
ugp.resolve_referent
```

应用动作由 Agent Surface 或应用自身 WebMCP 工具提供。

### 12.4 AG-UI Binding

- Selection 变化使用 Custom Event；
- GroundingBundle 可以作为状态快照；
- referent/context 更新可使用 JSON Patch；
- UGP 不重定义 AG-UI Tool Call 生命周期。

### 12.5 应用自定义 Provider

Provider URI 和能力 ID 均为开放字符串，允许接入其他能力系统：

```json
{
  "provider": "org.example.internal-actions",
  "capabilityId": "orders.assign"
}
```

---

## 13. SDK 与包结构

```text
packages/
├── protocol                 # JSON Schema、类型、版本兼容
├── core                     # Registry、Resolver、Context 合约
├── dom                      # DOM Anchor 与 Geometry
├── text                     # Text Quote/Position/Range
├── react                    # React hooks 和 Provider
├── vue                      # 后续 Vue 适配
├── web-components           # 后续跨框架绑定
├── canvas                   # Canvas/SVG Adapter 基础
├── agent-surface            # Agent Surface 绑定
├── mcp                      # MCP 资源绑定
├── webmcp                   # WebMCP 绑定
├── ag-ui                    # AG-UI 状态绑定
├── overlay                  # 选择浮层参考 UI
├── devtools                 # 浏览器 DevTools
├── testing                  # 单测/E2E helper
└── cli                      # lint/inspect/conformance/benchmark
```

### 13.1 Core API 草案

```ts
const surface = createGroundingSurface({
  surfaceId: 'orders-dashboard',
  revision: () => appViewRevision,
  contextProvider: authorizeAndMaterializeContext,
});

const registration = surface.registerNode({
  type: 'org.example.commerce.order',
  label: `Order ${order.displayId}`,
  entityRef: {
    namespace: 'orders',
    id: order.id,
    revision: order.version,
  },
  authority: 'authoritative',
  anchors: [{ element: orderCardElement }],
  contexts: ['summary', 'risk'],
  capabilityRefs: [
    {
      provider: 'agent-surface',
      capabilityId: 'domain:orders.assign',
      targetBindings: { orderId: '$.referent.entityRef.id' },
    },
  ],
});

registration.dispose();
```

### 13.2 React API 草案

```tsx
function OrderCard({ order }: { order: Order }) {
  const grounding = useGroundingNode({
    type: 'org.example.commerce.order',
    label: `Order ${order.displayId}`,
    entityRef: {
      namespace: 'orders',
      id: order.id,
      revision: order.version,
    },
    contexts: ['summary', 'risk'],
  });

  return <article ref={grounding.anchorRef}>{/* existing UI */}</article>;
}
```

该 API 不要求 wrapper，不改变组件视觉，不注册 Agent 动作。

---

## 14. AI 前端开发 Skill

### 14.1 Skill 目标

`ugp-frontend` 指导 Codex 等编码 Agent 在开发界面时同步建立可选择的业务语义层。

Skill 不负责让 AI 生成漂亮界面，而负责：

- 识别业务对象；
- 选择正确语义粒度；
- 注册 Anchor；
- 设计安全 ContextDescriptor；
- 引用已有 Capability；
- 编写选择和解析测试；
- 检查性能与隐私。

### 14.2 工作流

1. 分析页面中的业务对象、关系和用户可指向目标；
2. 区分业务节点、UI 控件和纯装饰元素；
3. 复用或创建 SemanticType；
4. 选择稳定 entityRef；
5. 在业务组件层注册 Node 和 Anchor；
6. 为 Canvas/Editor 选择合适 Adapter；
7. 声明最小 ContextDescriptor；
8. 引用现有 Capability，而不是重新实现动作；
9. 编写 point/region/text 解析测试；
10. 运行 lint、conformance 和 benchmark；
11. 输出语义变化报告供代码审查。

### 14.3 应标注什么

应标注：

- 用户能够独立询问、比较或引用的业务对象；
- 表格行、任务卡、订单卡、图表系列、文档段落等；
- 多次出现但具有稳定实体身份的对象；
- Canvas 中可被用户感知为独立对象的图形；
- 有明确上下文价值的聚合区域。

通常不标注：

- Button、Icon、Divider、Grid 等通用设计系统原子；
- 纯布局和动画 DOM；
- 没有独立业务含义的装饰文字；
- 可以自然归属于父业务节点的内部控件。

### 14.4 Skill 文件结构

```text
skills/ugp-frontend/
├── SKILL.md
├── references/
│   ├── semantic-modeling.md
│   ├── selection-patterns.md
│   ├── context-security.md
│   ├── performance.md
│   ├── react.md
│   ├── canvas.md
│   └── testing.md
├── templates/
│   ├── semantic-type.schema.json
│   ├── grounding-test.ts
│   └── context-provider.ts
└── scripts/
    ├── inspect-project.mjs
    └── semantic-report.mjs
```

### 14.5 Definition of Done

- 业务对象拥有稳定类型与 entityRef；
- Anchor 不依赖渲染顺序作为身份；
- 点选和区域框选解析正确；
- 需要文字选择的界面有 Text Anchor；
- 权威、派生和推断结果可区分；
- Context 经过敏感级别与预算审查；
- Capability 仅引用外部系统；
- UGP 禁用后页面功能与布局正常；
- E2E 和性能预算通过。

---

## 15. DevTools 与开发体验

### 15.1 Selection Overlay

参考浮层提供：

- 点选、框选和套索模式；
- Hover 高亮；
- 命中候选预览；
- 权威等级徽标；
- 歧义选择器；
- “发送到 AI”回调；
- 键盘操作与可访问性支持。

浮层是可选实现，不属于协议规范。

### 15.2 Browser DevTools

- Surface 与 SemanticNode 树；
- 页面 Hover 对应节点；
- Anchor 与 Geometry；
- 选择解析证据；
- 父子折叠和去重过程；
- Surface/Node revision；
- Context 预览和字段过滤；
- Resource/Capability Reference；
- 解析耗时和布局读取；
- 隐私与 Prompt Injection 警告。

### 15.3 CLI

```text
ugp init          初始化配置
ugp lint          检查 Schema、身份、敏感字段和反模式
ugp inspect       输出语义覆盖率和节点清单
ugp test          运行选择与上下文测试
ugp conformance   运行 Profile 一致性测试
ugp benchmark     运行性能基准
ugp export        导出类型与 Surface manifest
ugp doctor        诊断适配器和版本问题
```

---

## 16. 安全与隐私

### 16.1 威胁模型

- 页面文本中的 Prompt Injection；
- 恶意组件伪造权威业务节点；
- Context Provider 泄露敏感字段；
- 过期 Anchor 指向错误对象；
- 跨租户 entityRef 混淆；
- 推断节点被误认为权威节点；
- 跨 iframe 越界；
- 调试工具在生产环境暴露内部数据；
- Capability Binding 绕过外部能力系统。

### 16.2 基本约束

- 节点 label、description 和选择文字均是不可信数据；
- authority 不能由模型提升；
- `inferred` 不得静默升级为 `authoritative`；
- Context 每次生成时重新检查权限和时效；
- 选择发生不等于获得读取权限；
- CapabilityReference 不等于执行授权；
- Binding 必须调用 Provider 正常入口；
- entityRef 不包含凭证和 PII；
- 生产环境默认关闭完整 Context 调试；
- 跨域 Surface 独立授权；
- 旧 revision 默认失败，而不是猜测继续。

### 16.3 Prompt Injection 防护

客户端必须把以下内容标记为应用数据，而非系统指令：

- 节点描述；
- 用户选中文字；
- 页面可见文案；
- OCR 和视觉模型输出；
- 外部资源摘要。

UGP
Envelope 可携带数据来源和 authority，但不能保证下游模型一定安全；客户端仍需使用结构化边界和策略。

---

## 17. 性能设计

### 17.1 原则

- 空闲时不轮询；
- 不使用持续 rAF 扫描；
- 不全量 MutationObserver 重建；
- 不为每个节点持续测量 Geometry；
- 不把动态状态写进 DOM attribute；
- Node 定义和运行时实例分离缓存；
- Geometry 选择时懒计算；
- Context 请求时懒生成；
- 共用 IntersectionObserver/ResizeObserver；
- 批量读取布局；
- Canvas 使用组件已有空间索引；
- 虚拟节点不强制常驻。

### 17.2 v0.1 目标预算

| 指标                   |     目标 |
| ---------------------- | -------: |
| 注册单节点平均耗时     | < 0.1 ms |
| 1,000 Node 额外内存    |   < 2 MB |
| Point 解析 p95         |   < 8 ms |
| Region 解析 p95        |  < 16 ms |
| 启用选择浮层 p95       |  < 50 ms |
| 默认 ContextBundle     | ≤ 32 KiB |
| 选择默认 Referent 数量 |     ≤ 20 |
| UGP 导致 Long Task     |        0 |
| 禁用 UGP 后布局差异    |        0 |

基准必须注明浏览器、设备、节点规模、可见节点比例和 Adapter 类型。

---

## 18. 一致性 Profile

| Profile            | 要求                                        |
| ------------------ | ------------------------------------------- |
| UGP-Core           | Surface、Type、Node、Anchor、Referent、版本 |
| UGP-Point          | Point Selection 与精确命中                  |
| UGP-Region         | Region/Lasso 与空间解析                     |
| UGP-Text           | Text Quote/Position/Range                   |
| UGP-Context        | ContextDescriptor、Provider、Budget、过滤   |
| UGP-ComplexSurface | Canvas、图表、编辑器或虚拟列表              |
| UGP-AgentSurface   | Agent Surface Capability Binding            |
| UGP-MCP            | MCP Resource Binding                        |
| UGP-WebMCP         | WebMCP Binding                              |
| UGP-Inference      | ARIA/DOM/视觉非权威降级                     |

公开兼容声明必须包含版本与 Profile：

```text
UGP v0.1: Core + Point + Region + Context
```

---

## 19. 测试体系

### 19.1 测试层级

1. JSON Schema 与类型兼容；
2. Registry 生命周期；
3. Point 命中、遮挡和 z-order；
4. Region 覆盖、父子折叠和歧义；
5. Text Range 重连与过期；
6. 同实体多视图去重；
7. Context 权限、预算、取消和时效；
8. Agent Surface/MCP/WebMCP Adapter 合约；
9. 浏览器真实交互 E2E；
10. Canvas/图表/虚拟列表 E2E；
11. 注入、越权和跨域安全测试；
12. 1K/10K/100K 逻辑节点性能。

### 19.2 浏览器矩阵

- Chromium；
- Firefox；
- WebKit。

### 19.3 框架矩阵

- 原生 DOM；
- React 18/19；
- Vue 3（第二阶段）；
- Web Components（第二阶段）。

---

## 20. 参考应用

首版使用“一套完整应用 + 两个极小专项 Fixture”，避免维护多个半成品 Demo。完整定义、数据模型和用例编号见
[参考场景设计](REFERENCE_SCENARIOS.md)。

### 20.1 UGP BI Lab（主参考应用）

- 确定性 BI 数据、Fastify 查询接口和 React 看板形成完整前后端业务闭环；
- DOM KPI、Canvas 折线图、SVG 柱状图、虚拟表格和文字洞察同时覆盖五类渲染表面；
- 支持点选、框选、多选、文本选择、父子消歧、同实体跨视图、权限投影和 stale
  fail-closed；
- Grounding
  Inspector 只消费公开 API，展示 referent、证据、revision 和 ContextBundle；
- 同时承担功能、性能、安全、无侵入性和 Codex 内置浏览器黑盒 E2E 的发布验收。

### 20.2 Document Selection Lab（专项 Fixture）

- 只验证 Text Quote、Text Position、跨块选择、表格单元格和编辑后的确定性重连；
- 不建设完整文档产品，不把富文本编辑器实现本身纳入 v0.1 范围。

### 20.3 Workflow Canvas Lab（专项 Fixture）

- 只验证 Canvas 图元的点选、区域选择、缩放、平移和分组父子关系；
- Rect Region 为发布必选，自由 Lasso 保持 Experimental，不阻塞 v0.1。

---

## 21. 仓库结构

```text
ui-grounding-protocol/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── GOVERNANCE.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── spec/
│   ├── core.md
│   ├── anchors.md
│   ├── selection.md
│   ├── resolution.md
│   ├── context.md
│   ├── security.md
│   ├── conformance.md
│   └── schemas/
├── packages/
│   ├── protocol/
│   ├── core/
│   ├── dom/
│   ├── text/
│   ├── react/
│   ├── canvas/
│   ├── agent-surface/
│   ├── mcp/
│   ├── webmcp/
│   ├── overlay/
│   ├── devtools/
│   ├── testing/
│   └── cli/
├── skills/
│   └── ugp-frontend/
├── examples/
│   ├── commerce/
│   ├── project-board/
│   ├── analytics-chart/
│   └── document-editor/
├── conformance/
│   ├── fixtures/
│   ├── browser/
│   └── performance/
└── rfcs/
```

---

## 22. 开发路线图

### Phase 0：问题验证与规范骨架（第 1–2 周）

交付：

- 独立仓库、许可证、治理文件；
- 术语表和非目标；
- UGP Core v0.1 Draft；
- Selection、Referent 和 Anchor JSON Schema；
- 原生 DOM 原型：点选/框选 → ResolvedReferent；
- 与 Agent Surface 的边界说明。

退出条件：

- 不实现任何动作运行时；
- 同一列表中的多个业务实例能精确区分；
- 禁用 UGP 后页面布局和功能不变；
- 能展示 authoritative 与 inferred 差异。

### Phase 1：DOM 闭环（第 3–6 周）

交付：

- `protocol`、`core`、`dom`、`react`；
- Point、Region、Text Selection；
- Context Provider 合约；
- Selection Overlay；
- 基础 CLI；
- 电商和项目看板 Demo；
- Chromium/Firefox/WebKit E2E。

退出条件：

- UGP-Core + Point + Region + Context 通过；
- 1,000 节点性能预算通过；
- 父子折叠和歧义测试通过。

### Phase 2：外部能力与复杂表面（第 7–10 周）

交付：

- Agent Surface Binding；
- MCP/WebMCP Binding；
- Canvas/SVG 基础 Adapter；
- 图表区间解析；
- 虚拟列表与编辑器实验；
- DevTools Alpha。

退出条件：

- UGP 不绕过任何外部 Provider 执行入口；
- 同一 GroundingBundle 能接入至少两个不同消费者；
- 图表与编辑器 E2E 通过。

### Phase 3：Skill 与一致性生态（第 11–16 周）

交付：

- `ugp-frontend` Skill；
- Vue 或 Web Components 第二框架；
- Conformance Runner；
- 公开 Playground；
- 性能报告；
- v0.2 Draft 与迁移说明；
- 外部设计伙伴试用。

退出条件：

- 至少两个非官方项目接入；
- AI 使用 Skill 能为已有组件正确增加 UGP；
- 安全与性能审计完成。

### Phase 4：标准化准备（第 17–24 周）

交付：

- v0.9 Candidate；
- 兼容标识与 Profile 测试；
- 行业扩展指南；
- 标准组织孵化提案；
- v1.0 未解决问题清单。

---

## 23. 首个 90 天执行计划

### 第 1–30 天

- 创建公开仓库和规范站；
- 冻结 Surface、Node、Anchor、Selection、Referent 术语；
- 发布 v0.1 Draft Schema；
- 完成 TypeScript Core、DOM Anchor 和 React Hook；
- 完成点选/框选 Demo；
- 建立包发布、单测和浏览器 E2E。

### 第 31–60 天

- 完成 Text Selection；
- 完成 Context Provider、预算和时效；
- 完成 Selection Overlay；
- 完成父子折叠、歧义与多视图去重；
- 发布性能基线；
- 完成首个 Agent Surface Adapter。

### 第 61–90 天

- 完成 Canvas/图表实验；
- 完成 MCP/WebMCP Adapter；
- 发布 DevTools Alpha；
- 发布 `ugp-frontend` Skill Alpha；
- 邀请外部项目验证；
- 发布 v0.2 Draft。

---

## 24. 开源治理与许可

推荐：

- 规范正文：CC BY 4.0；
- SDK、CLI、DevTools、Skill 和示例：Apache-2.0；
- 贡献：DCO；
- 兼容标识：单独商标政策。

早期治理角色：

- Maintainers；
- Protocol Editors；
- Security Team；
- Selection Working Group；
- Complex Surface Working Group；
- Bindings Working Group。

重大变更采用 RFC：

```text
Draft → Experimental → Accepted → Stable
```

进入 v1.0 前评估 W3C Community Group 或中立基金会孵化。

---

## 25. 成功指标

### 25.1 协议正确性

- 权威 Point Selection 准确率 ≥ 99.5%；
- 过期选择静默误解析率为 0；
- 所有 referent 包含 authority 与 evidence；
- 所有规范性 MUST 均有测试或审计项；
- 同一输入在同一 Surface revision 上确定性一致。

### 25.2 开发体验

- 普通业务卡片接入 ≤ 15 分钟；
- 已有列表加入区域框选 ≤ 30 分钟；
- 无需更换组件库或状态管理；
- AI 使用 Skill 的首次合规率 ≥ 80%；
- 语义变更可在 PR 中清晰审查。

### 25.3 性能与隐私

- 达到第 17 节预算；
- 默认 Context 不包含 Restricted 字段；
- UGP 禁用后的页面像素和交互无差异；
- 生产环境不泄露调试用完整上下文。

### 25.4 生态验证

- v0.9 前至少三个独立应用；
- 至少三种界面技术：DOM、Canvas、Editor；
- 至少两种前端框架；
- 至少两种外部消费者/能力系统；
- 至少一个非官方 Adapter。

---

## 26. 风险与应对

| 风险                             | 应对                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| 被认为是另一个 Agent Surface     | README 首屏明确只做 Selection Grounding；动作全部交给 Provider       |
| 被认为只是框选组件               | 强调 authoritative entity mapping、evidence、revision 和 conformance |
| 与 Agent-Native selection 重复   | 提供跨框架协议、复杂 Surface 和一致性测试                            |
| “UI Grounding”被理解为语言到坐标 | 规范开篇固定 Selection → Referent 方向                               |
| 开发者不愿标注                   | AI Skill、React Hook、自动 lint 和渐进接入                           |
| 语义过度标注                     | 只标注可独立询问的业务对象，不标设计原子                             |
| 隐私泄露                         | Context Provider 授权、预算、敏感级别和生产调试限制                  |
| DOM 更新导致失效                 | runtime ref、revision、多 Selector 和 entityRef 重连                 |
| 大规模节点性能差                 | 懒 Geometry、临时节点、空间索引和逻辑/可见节点分离                   |
| 单一厂商绑定                     | Core 无 Provider 依赖，所有能力系统通过 Adapter                      |

---

## 27. 反模式

以下实现不得通过一致性检查：

- 把整个 DOM、组件 props 或应用 Store 交给 AI；
- 用 CSS class、屏幕位置或可见文字作为唯一业务身份；
- 把业务私有状态塞进 `aria-label`；
- 为每个对象实例创建一个 Agent 工具；
- 在 UGP Core 中执行写动作；
- 绕过 Agent Surface/MCP Provider 的正常执行入口；
- 把 OCR/视觉结果标记为 authoritative；
- 在 entityRef 中放入凭证或 PII；
- 持续扫描 DOM 或每帧测量所有节点；
- 选择发生后自动读取全部相关业务数据；
- Surface 过期后静默使用旧 Anchor；
- 为接入 UGP 强制替换现有组件库；
- 以设计系统 Button 作为默认语义节点粒度。

---

## 28. README 首屏建议

```markdown
# UI Grounding Protocol

Point at the interface. Get the ground truth behind it.

UGP is a vendor-neutral protocol for resolving human UI selections into
authoritative application referents.

It standardizes how clicks, marquee selections, text ranges, charts, canvas
objects and virtualized UI map to stable business entities, minimal context and
external capability references.

## What UGP is not

UGP is not an agent runtime, capability registry, browser automation framework,
action executor or replacement for MCP/WebMCP.

It complements Agent Surface and other capability systems by answering:

> What application object did the user just point at?
```

README 必须在首屏直接展示 Selection →
Referent 图，避免被误解为通用 Agent 前端框架。

---

## 29. v0.1 Alpha 验收标准

只有以下条件全部满足才能发布：

- Core、Anchor、Selection、Referent 和 Context Schema 完整；
- 原生 DOM 与 React 使用同一 Conformance Suite；
- Point、Region、Text 均有浏览器 E2E；
- authoritative、derived、inferred 可区分；
- 父子折叠、歧义和同实体多视图有确定规则；
- Context Provider 支持授权、预算、取消和时效；
- Core 没有 Action Registry、Policy Engine 或业务执行路径；
- Agent Surface 仅作为可选 Adapter；
- 1,000 节点性能预算通过；
- 电商、看板、图表和编辑器示例至少完成三个；
- 禁用 UGP 后布局和功能不变；
- 安全、隐私、威胁模型和漏洞报告公开；
- AI Skill 能为已有组件增加语义锚点并生成测试；
- README 清楚回答与 Agent Surface、MCP、ARIA 的区别。

---

## 30. 立项决策

建议冻结：

1. 项目从 SSP 更名并收缩为 UGP；
2. 核心问题限定为 Selection → Authoritative Referent；
3. 不开发第二套 Agent Capability Runtime；
4. Agent Surface 成为首个可选能力绑定；
5. TypeScript 是首个参考实现，但协议语言中立；
6. 首批实现 DOM、Text 和 React；
7. Canvas/图表进入第二阶段，但数据模型从 v0.1 预留；
8. authority 和 evidence 是所有解析结果的必备字段；
9. Context 采用最小投影和预算；
10. 性能、安全和浏览器 E2E 是发布门槛；
11. README 不以“让前端对 Agent 可操作”为主叙事；
12. 标准化价值通过多个独立实现证明，而不是由项目自称。

---

## 31. 结论

优化后的 UGP 不再试图建设完整的 Agent 前端基础设施，而是聚焦一个清晰、可验证且能与现有生态组合的缺口：

> 将人类在界面中的自然指向，稳定地落地为应用权威业务指称。

它和 Agent Surface 的组合关系应当是：

```text
UGP 决定“你指的是谁”
Agent Surface 决定“Agent 能对它做什么”
后端决定“该操作是否真正被授权和执行”
```

这条边界既避免重复造轮子，也保留了独立协议的价值。项目能否成立，不取决于组件数量，而取决于它能否在 DOM、文字、Canvas、图表和编辑器中，用同一套可审计协议准确回答“用户指的是谁”。

---

## 参考资料

- [Wiseair agent-surface](https://github.com/Wiseair-srl/agent-surface)
- [Agent Surface Architecture](https://www.agent-surface.dev/02-architecture)
- [Agent Surface Concepts](https://www.agent-surface.dev/01-concepts)
- [Agent Surface Limits and Non-goals](https://www.agent-surface.dev/11-non-goals)
- [Agent-Native Context Awareness](https://www.agent-native.com/docs/context-awareness/)
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- [WAI-ARIA](https://www.w3.org/TR/wai-aria/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [AG-UI Protocol](https://docs.ag-ui.com/)
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12)
- [RFC 6902: JSON Patch](https://www.rfc-editor.org/rfc/rfc6902)
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [RFC 9562: UUIDs](https://www.rfc-editor.org/rfc/rfc9562)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
