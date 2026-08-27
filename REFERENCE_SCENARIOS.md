# UGP v0.1 参考场景设计

> 主场景：BI 数据分析看板  
> 辅助场景：文档选择、工作流画布  
> 目标：用少量场景覆盖 DOM、Canvas、SVG、文字、虚拟列表、动态数据与业务上下文

## 1. 场景选择原则

参考应用不是为了展示 UI 设计，而是为了验证协议是否真正跨越“视觉、组件、数据和业务模型”四层。

主场景必须同时包含：

- 后端实体和查询；
- 前端业务组件；
- 同一实体在多个视图中出现；
- DOM、Canvas、SVG 和文字；
- 大列表和虚拟化；
- 筛选、排序、滚动、响应式和重渲染；
- 权限不同导致的 Context 差异；
- 用户可理解的选择结果。

BI Dashboard 是 v0.1 最合适的主场景，因为一个页面就能覆盖大部分协议难点。

但只用 BI 会导致协议过度围绕“指标/图表”建模，因此增加两个很小的辅助场景：

- 文档选择：验证 Text Quote、Text Position 和编辑冲突；
- 工作流画布：验证自由 Geometry、嵌套对象、Transform 和 Lasso 模型。

辅助场景不建设完整产品，只建设最小验收页面。

---

## 2. 主场景：UGP BI Lab

### 2.1 用户故事

一名业务分析师打开经营分析看板，看到收入、订单、转化率和退款率等指标。用户可以直接：

- 点击 KPI，询问“这个指标是怎么计算的？”；
- 框选折线图的下降区间，询问“为什么这里下滑？”；
- 圈选柱状图中的两个区域，要求比较；
- 选择明细表中的客户，获取对应业务上下文；
- 选择自动生成的分析文字，让 AI 进一步解释；
- 选择图表和表格中指向同一地区的数据，得到统一实体关系。

### 2.2 确定性业务数据

数据集使用固定 seed 生成并提交快照，不依赖外部 API、当前时间或随机网络结果。

数据范围：

- 24 个自然月；
- 6 个 Region；
- 4 个 Product Category；
- 2 个 Customer Segment；
- 10,000 条 Order Record；
- 固定异常：第 15–17 月某地区转化率下降；
- 固定异常原因：库存缺货、广告渠道变化和退款上升；
- 固定敏感字段：成本、毛利、客户邮箱。

固定 seed 的目的不是模拟真实商业结论，而是让选择、上下文和期望结果完全可复现。

### 2.3 后端业务模型

```text
Workspace
└── Dashboard
    ├── Widget
    │   ├── KPIWidget
    │   ├── LineChartWidget
    │   ├── BarChartWidget
    │   ├── TableWidget
    │   └── NarrativeWidget
    ├── FilterState
    └── QueryRevision

Dataset
├── Metric
├── Dimension
│   └── DimensionMember
├── TimeSeries
│   └── DataPoint
└── Record
```

核心实体：

```ts
interface Metric {
  id: string;
  key: 'revenue' | 'orders' | 'conversion_rate' | 'refund_rate';
  label: string;
  unit: 'currency' | 'count' | 'percent';
  formula: string;
  sensitivity: 'public' | 'internal' | 'confidential';
}

interface DimensionMember {
  dimensionId: string;
  id: string;
  label: string;
}

interface DataPoint {
  metricId: string;
  period: string;
  dimensionMembers: string[];
  value: number;
  revision: string;
}

interface OrderRecord {
  id: string;
  period: string;
  regionId: string;
  productId: string;
  segmentId: string;
  revenue: number;
  cost: number;
  margin: number;
  customerEmail: string;
  revision: string;
}
```

### 2.4 后端接口

```text
GET  /api/scenario
POST /api/scenario/reset
POST /api/scenario/mutate
GET  /api/dashboard
POST /api/query/timeseries
POST /api/query/breakdown
POST /api/query/records
POST /api/context
```

`/api/context` 输入 referent、principal 和 purpose，返回最小业务投影。

角色：

| 角色    | 可见内容                     |
| ------- | ---------------------------- |
| viewer  | 聚合指标、公开维度、脱敏记录 |
| analyst | 公式、成本、毛利、异常原因   |

任何角色都不返回原始客户邮箱；Context 只返回脱敏 customerRef。

### 2.5 前端组件

```text
AppShell
├── FilterBar                 DOM
├── KPIGrid                   DOM
│   └── KPICard × 4
├── RevenueTrendChart         ECharts Canvas
├── RegionBreakdownChart      ECharts SVG
├── DetailTable               DOM + Virtualization
├── NarrativeInsight          DOM + Text Selection
└── GroundingInspector        DOM, test/debug only
```

### 2.6 UGP SemanticType

```text
org.ugp.demo.bi.dashboard
org.ugp.demo.bi.metric
org.ugp.demo.bi.widget
org.ugp.demo.bi.chart
org.ugp.demo.bi.series
org.ugp.demo.bi.interval
org.ugp.demo.bi.data-point
org.ugp.demo.bi.dimension
org.ugp.demo.bi.dimension-member
org.ugp.demo.bi.record
org.ugp.demo.bi.filter
org.ugp.demo.bi.insight
ugp.ui.text-fragment
```

### 2.7 组件到业务模型映射

| 可见目标      | Primary Referent          | entityRef                           |
| ------------- | ------------------------- | ----------------------------------- |
| 收入 KPI 卡片 | metric                    | `metrics/revenue`                   |
| KPI 数字      | metric-value derived node | `metrics/revenue@queryRevision`     |
| 折线          | series                    | `series/revenue:all`                |
| 折线数据点    | data-point                | `points/revenue:2026-03:all`        |
| 框选时间段    | interval transient node   | `interval/revenue:2026-03..2026-05` |
| 地区柱        | dimension-member          | `regions/east`                      |
| 表格行        | record                    | `orders/order-000123`               |
| Filter Chip   | filter                    | `filters/region:east`               |
| 分析文字段落  | insight                   | `insights/revenue-drop`             |
| 文字范围      | text-fragment             | 临时 ID + parent insight            |

### 2.8 BI 自动化验收场景

| ID    | 场景                        | 预期                                         |
| ----- | --------------------------- | -------------------------------------------- |
| BI-01 | 点击收入 KPI 卡片           | 返回 authoritative metric/revenue            |
| BI-02 | 点击 KPI 内数值             | primary 为 metric-value，关联 metric/revenue |
| BI-03 | 点击 Canvas 折线数据点      | 返回正确月份的 data-point                    |
| BI-04 | 框选 Canvas 折线区间        | 返回 interval，而不是数百个像素点            |
| BI-05 | 点击 SVG 地区柱             | 返回对应 region dimension-member             |
| BI-06 | 框选两个地区柱              | 返回两个 member，顺序确定                    |
| BI-07 | 点击虚拟表格可见行          | 返回正确 order ID                            |
| BI-08 | 排序并滚动后点击复用 DOM 行 | 仍返回当前 record，不返回旧记录              |
| BI-09 | 图表与表格选择同一地区      | Context 中 entityRef 去重并保留视图关系      |
| BI-10 | 框选整张 KPI 卡             | 返回 metric，不展开所有内部文字节点          |
| BI-11 | 选择分析文字中的一句        | 返回 text-fragment + parent insight          |
| BI-12 | 产生选择后改变 Filter       | 旧 queryRevision 返回 stale 或显式重解析     |
| BI-13 | viewer 请求成本 Context     | 字段被省略并标记 unauthorized                |
| BI-14 | analyst 请求成本 Context    | 返回获准投影，不返回客户邮箱                 |
| BI-15 | 1024×768 响应式重排后框选   | Referent 不受组件位置变化影响                |
| BI-16 | 高 DPR/浏览器缩放           | Canvas point 命中正确                        |
| BI-17 | 选区覆盖两个父级 Widget     | 返回 ambiguity，而不是随机选一个             |
| BI-18 | 关闭 UGP Overlay            | 看板原交互正常，截图无差异                   |
| BI-19 | 取消正在生成的 Context      | Abort 生效且没有晚到状态覆盖                 |
| BI-20 | 10K 逻辑记录与连续框选      | 达到性能预算且无明显内存泄漏                 |

### 2.9 Grounding Inspector

参考应用包含一个仅用于开发和验收的 Inspector，显示：

- Selection geometry；
- ResolvedReferent；
- authority、confidence、relation；
- evidence；
- Surface/Node/Adapter revision；
- ContextBundle；
- omitted 字段及原因；
- 单次解析耗时。

Inspector 必须读取公共 UGP
API，不能访问内部 Registry 私有结构，否则无法作为黑盒验收依据。

生产构建可通过明确的 demo flag 开启 Inspector；正式 SDK 不默认注入此界面。

---

## 3. 辅助场景 A：Document Selection Lab

### 3.1 目的

验证 BI Narrative 不足以覆盖的文本编辑问题：

- Text Quote；
- Text Position；
- Range；
- 文档 revision；
- 文本插入后的重连；
- 父段落与文字片段关系。

### 3.2 页面

一个包含 10 个稳定 block ID 的轻量编辑器：

- 标题；
- 普通段落；
- 列表；
- 表格单元格；
- 可编辑段落。

### 3.3 验收场景

| ID     | 场景               | 预期                                   |
| ------ | ------------------ | -------------------------------------- |
| DOC-01 | 选择段落中的一句   | text-fragment + parent block           |
| DOC-02 | 在选择前方插入文字 | Text Quote 可重连，Position 更新       |
| DOC-03 | 删除选中文字       | 返回 stale/no-referent，不猜测其他文字 |
| DOC-04 | 跨两个 block 选择  | 返回两个 fragment 和顺序关系           |
| DOC-05 | 选择表格单元格文字 | fragment、cell、document 关系正确      |

Document Lab 是 v0.1 Text Profile 的验收场景，不需要协同编辑后端。

---

## 4. 辅助场景 B：Workflow Canvas Lab

### 4.1 目的

验证自由空间而非统计图表：

- Surface-local coordinate；
- 平移、缩放和旋转；
- 嵌套 group；
- lasso 数据模型；
- 临时节点；
- 同一业务节点的多个可见形状。

### 4.2 页面

一个固定流程：

```text
Lead → Qualified → Proposal → Won
```

包含：

- 4 个节点；
- 3 条连线；
- 1 个 group；
- 可缩放和平移画布；
- Canvas renderer；
- Inspector。

### 4.3 验收场景

| ID     | 场景                  | 预期                                  |
| ------ | --------------------- | ------------------------------------- |
| CAN-01 | 点击节点              | 返回 authoritative workflow step      |
| CAN-02 | 框选两个节点和连线    | 返回节点，连线作为 relationship       |
| CAN-03 | 缩放 150% 后点击      | 命中相同 entityRef                    |
| CAN-04 | 平移后区域选择        | 使用 surface-local transform 正确解析 |
| CAN-05 | 选择 group 内全部节点 | 根据粒度规则返回 group primary        |

Rect Region 进入 v0.1；自由曲线 Lasso 可以作为 Experimental，不阻塞 Alpha。

---

## 5. 为什么不再增加完整业务场景

电商订单、CRM、项目看板等都适合展示 UGP，但 v0.1 不应建设多个完整应用。

覆盖关系：

| 协议难点       |   BI | Document | Canvas |
| -------------- | ---: | -------: | -----: |
| DOM 业务组件   |    ✓ |        ✓ |      — |
| Canvas         |    ✓ |        — |      ✓ |
| SVG            |    ✓ |        — |      — |
| 虚拟列表       |    ✓ |        — |      — |
| Text Range     |    ✓ |        ✓ |      — |
| 动态筛选/排序  |    ✓ |        — |      — |
| 权限 Context   |    ✓ |        — |      — |
| 多视图同实体   |    ✓ |        — |      ✓ |
| 自由 Transform | 部分 |        — |      ✓ |
| 文档重连       |    — |        ✓ |      — |

这三个场景已经足够验证 v0.1 的通用性。后续外部采用者应提供新的行业证据，而不是由官方仓库继续堆 Demo。
