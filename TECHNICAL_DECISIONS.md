# UGP v0.1 技术决策与待决问题

> 状态：首版开发基线  
> 原则：协议标准优先、运行时最小、浏览器真实行为优先、避免复制 Agent Surface

## 1. 技术栈结论

| 领域                    | 选择                                            | 理由                                            |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------- |
| 语言                    | TypeScript strict                               | 浏览器生态、类型和 Schema 工具成熟              |
| Monorepo                | pnpm workspace                                  | 原生 workspace 足够，首版不引入额外任务编排层   |
| 协议 Schema             | JSON Schema 2020-12                             | 开放、语言中立、适合作为线协议事实来源          |
| Schema validator        | Ajv Draft 2020-12 独立实例                      | 明确支持 2020-12；与业务 API validator 分离     |
| Core 测试               | Vitest Node                                     | 纯逻辑执行快，适合属性和 Fixture 测试           |
| Browser component tests | Vitest Browser + Playwright provider            | 真实 DOM/Pointer/Range，不依赖 jsdom 假实现     |
| Product E2E             | Playwright Test                                 | Chromium、Firefox、WebKit、trace、截图与附件    |
| 人工黑盒 E2E            | Codex 内置浏览器                                | 验证真实用户体验，独立于测试代码                |
| 包构建                  | Vite library mode + TypeScript declaration emit | 适合浏览器库和 Demo 共用配置                    |
| React 状态桥            | `useSyncExternalStore`                          | Registry 是 React 外部 Store，符合官方订阅模型  |
| Demo frontend           | React + Vite                                    | 首个 Adapter 和调试效率优先                     |
| BI charts               | Apache ECharts                                  | 同时支持 Canvas/SVG，适合验证两种渲染表面       |
| Virtual table           | TanStack Virtual                                | Headless，可使用稳定业务 key，适合验证 DOM 回收 |
| Demo backend            | Fastify + 固定 fixture                          | Schema 驱动、确定性、无外部服务依赖             |
| Release                 | Changesets + GitHub Releases                    | 包版本和变更记录可审查                          |
| Documentation           | Markdown 首发，稳定后再用 VitePress             | 避免规范未稳定时先投入站点工程                  |

官方依据：

- JSON Schema 当前规范页面提供 Draft
  2020-12 的 Core、Validation 和 meta-schema：[JSON Schema 2020-12](https://json-schema.org/draft/2020-12)。
- Ajv 对 Draft
  2020-12 使用独立入口，不能和旧 Draft 混用同一实例：[Ajv JSON Schema](https://ajv.js.org/json-schema.html)。
- React 官方将 `useSyncExternalStore`
  用于订阅 React 外部可变 Store：[React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)。
- Vite 官方提供面向浏览器库的 Library
  Mode：[Vite Library Mode](https://vite.dev/guide/build.html#library-mode)。
- Vitest Browser
  Mode 可以在真实浏览器运行，官方建议 CI 使用 Playwright/WebDriver
  provider：[Vitest Browser Mode](https://vitest.dev/guide/browser/)。
- Playwright 默认可配置 Chromium、Firefox 和 WebKit 项目：[Playwright Browsers](https://playwright.dev/docs/browsers)。
- ECharts 同一 API 可以切换 Canvas/SVG
  renderer：[ECharts Canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)。
- TanStack Virtual 是 headless virtualizer，并支持稳定
  `getItemKey`：[TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction)、[Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer)。
- Fastify 推荐使用 JSON
  Schema 验证和序列化接口：[Fastify Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)。

---

## 2. ADR-001：JSON Schema 是规范事实来源

状态：Accepted

决策：

- `spec/schemas/*.schema.json` 是线协议事实来源；
- TypeScript 类型从 Schema 生成；
- 生成类型不手工修改；
- 文档示例必须通过 Schema；
- CI 检查生成物漂移；
- Protocol package 导出 Schema JSON 和生成类型。

原因：如果 TypeScript 和 JSON
Schema 双向手写，很快会产生不一致；协议必须能被其他语言实现。

限制：某些跨对象不变量无法只用 JSON Schema 表达，由 Conformance Runner 验证。

---

## 3. ADR-002：身份分层

状态：Accepted

```text
surfaceId      一次应用语义表面实例
nodeId         Surface 生命周期内的语义节点实例
anchorId       一个可见载体绑定
entityRef      稳定业务对象引用
selectionId    一次用户选择
groundingId    一次解析结果
```

规则：

- nodeId 不等于 entityRef；
- 同一 entityRef 可以有多个 nodeId；
- 同一 nodeId 可以有多个 anchorId；
- CSS selector、DOM index 和显示文字不能成为 entityRef；
- 虚拟列表必须使用业务 ID，而不是 row index；
- 临时 interval/text-fragment 使用有 TTL 的 nodeId，并保留父业务对象引用。

---

## 4. ADR-003：Revision 与失效

状态：Accepted

不使用一个 revision 承担所有变化。首版分为：

```ts
interface RevisionSet {
  semanticRevision: string;
  nodeRevision?: string;
  adapterRevision?: string;
  dataRevision?: string;
}
```

- `semanticRevision`：Node/Anchor 身份和关系变化时递增；
- `nodeRevision`：业务对象内容或身份绑定版本；
- `adapterRevision`：Canvas/Chart/Editor 场景树或坐标映射版本；
- `dataRevision`：Context 对应的查询或后端数据版本。

普通页面滚动不递增 semanticRevision。Geometry 在选择捕获和解析期间按当前布局读取。

失效策略：

- identity/adapter 不一致：fail closed；
- dataRevision 变化：Grounding 可保持 entityRef，但旧 Context 必须重新 materialize；
- v0.1 不自动猜测重连，必须显式 `reResolve`；
- Text Quote 是明确允许的重连策略，仍需返回新的 evidence。

---

## 5. ADR-004：坐标系

状态：Accepted

Geometry 必须声明坐标空间：

```ts
type CoordinateSpace = 'viewport-css-px' | 'document-css-px' | 'surface-local';
```

规则：

- DOM Pointer/Region 默认使用 viewport CSS pixel；
- 序列化 Selection 同时携带 viewport、scroll offset 和 Surface bounds；
- Canvas/Chart 使用 surface-local，并附二维 transform matrix；
- devicePixelRatio 只影响物理像素，不改变 CSS pixel 语义；
- 不同 Surface 的 Geometry 不直接比较；
- Geometry 测试包括缩放、滚动、旋转、裁剪和高 DPR。

---

## 6. ADR-005：Resolver 是确定性管线

状态：Accepted

协议规定管线和证据，不强制所有实现使用同一浮点分数公式。

参考实现固定顺序：

1. direct semantic selection；
2. exact runtime anchor；
3. direct DOM hit；
4. DOM ancestry/descendants；
5. Text selector；
6. geometry intersection；
7. adapter result；
8. accessibility derived；
9. inference。

排序键必须完全稳定：

```text
authority rank
→ relation rank
→ anchor priority
→ visible coverage
→ semantic depth
→ nodeId lexical order
```

歧义规则：

- 两个无父子关系的 authoritative 候选达到同级门槛时返回 ambiguity；
- 不使用随机数或当前时间消歧；
- inferred 不得压过 authoritative；
- 应用可声明 preferred granularity，但不能伪造 authority。

阈值在 Fixture 中冻结，修改必须通过 RFC 和 Changeset。

---

## 7. ADR-006：Context 授权属于 Host

状态：Accepted

UGP 定义 ContextProvider 合约，但不实现角色系统。

Host 每次 materialize 必须收到：

- referents；
- principal；
- purpose；
- requested contexts；
- budget；
- AbortSignal。

Host 返回：

- 已授权字段；
- omitted reason；
- dataRevision；
- generatedAt；
- freshness。

规则：

- Selection 不等于读取授权；
- Node description 不等于 Context；
- Context 响应必须再次通过 Schema；
- Restricted 字段默认不允许进入浏览器 Demo；
- Prompt Injection 文本始终作为 data 标记。

---

## 8. ADR-007：React Adapter 是外部 Store 订阅

状态：Accepted

- Core Registry 独立于 React；
- React Provider 只提供 Registry；
- `useGroundingNode` 使用 callback ref 绑定 Anchor；
- snapshot 通过 `useSyncExternalStore` 读取；
- handlers/context resolvers 通过 latest ref 保持新鲜；
- Strict Mode 重放不能泄漏注册；
- SSR 不注册 live Surface，hydration 后启用；
- React 不是协议规范的一部分。

---

## 9. ADR-008：双层浏览器验收

状态：Accepted

自动化层：

- Playwright Chromium/Firefox/WebKit；
- 可重复断言；
- trace、截图、GroundingBundle attachment；
- CI 门禁。

真实用户层：

- Codex 内置浏览器打开 production build；
- 不调用页面私有 JavaScript；
- 通过实际点击、拖拽、滚动、文字选择完成任务；
- 以页面公开 Inspector 和截图作为证据；
- 每个 Release Candidate 至少跑一次完整黑盒流程。

两者都必须通过。人工浏览器验收不能替代三浏览器自动化，自动化也不能替代真实体验检查。

---

## 10. ADR-009：首版不引入空间索引

状态：Accepted with trigger

v0.1 DOM 参考实现先使用可见 Anchor 集合的线性候选计算，原因：

- 逻辑简单、结果容易审计；
- 只对当前可见节点计算 Geometry；
- 1,000 可见节点预算足以验证大多数业务页面。

触发条件：

- Region p95 超过 16 ms；或
- 可见 Anchor 超过 2,000；或
- Canvas Adapter 未提供自己的空间索引。

触发后引入 R-tree，但必须保持相同 Conformance 输出。

---

## 11. ADR-010：Demo Backend 与协议 Validator 分离

状态：Accepted

- UGP Protocol 使用 Ajv Draft 2020-12 独立实例；
- Fastify Demo API 使用其路由 Schema 和独立 validator；
- 不把 Fastify 的 Draft 约束扩散到 UGP Protocol；
- 两者通过序列化 JSON 边界交互；
- 所有 Schema 被当作受信任的仓库代码，不允许运行时加载任意用户 Schema。

---

## 12. 浏览器与运行时支持

v0.1：

- 最新稳定 Chromium；
- 最新稳定 Firefox；
- Playwright WebKit；
- React 18/19；
- 当前 Active LTS 与 Maintenance LTS Node 版本在 CI 中验证；
- evergreen browser，不支持 IE 或旧版 EdgeHTML。

版本不写死在规范正文；仓库通过 lockfile、engines 和 CI
matrix 固定每个 Release 的真实版本。

---

## 13. 包策略

- ESM-first；
- browser package 不引用 Node built-in；
- React 为 peer dependency；
- package exports 显式列出，不使用 wildcard；
- sideEffects 默认 false，Overlay CSS 作为显式导入例外；
- Schema JSON 是公开 export；
- 每个包执行 `npm pack` smoke test；
- 公开 API 使用 API Extractor 或等价快照防止意外漂移；
- v0.x 破坏性变更必须写 Changeset 和迁移说明。

---

## 14. 当前仍有疑问的内容

以下不阻塞 M0，但必须在指定节点前决定：

| 问题                              | 默认方案                       | 最晚决策点       |
| --------------------------------- | ------------------------------ | ---------------- |
| 最终名称与 npm scope 是否可注册   | 暂用 UGP / `@ui-grounding/*`   | 公开仓库前       |
| Region 是否包含自由 Lasso         | Rect 必须，Lasso Experimental  | M1 Schema 冻结前 |
| same-origin iframe 是否进入 v0.1  | 不进入发布门禁                 | M3 前            |
| open Shadow Root 是否必须         | 必须                           | M3 前            |
| ContextBundle 是否允许内联二进制  | 不允许，只用 ResourceReference | M1 前            |
| 是否发布独立 Overlay 包           | 是，Core 不依赖 Overlay        | M3 前            |
| Canvas Adapter 是否定义场景树标准 | v0.1 只定义 Adapter 合约       | M4 前            |
| 是否加入 JSON-LD                  | v0.1 不加入                    | v0.2 RFC         |
| 是否支持自动 stale re-resolve     | v0.1 fail closed               | v0.2 RFC         |
| 是否把 inference 放入官方扩展     | v0.1 不做                      | v0.2 后          |
| 是否建设 W3C Community Group      | 等两个外部实现后               | v0.9 前          |

### 需要用户/维护者确认的产品决策

1. 项目公开名称最终使用 UGP，还是重新做一次命名与商标筛查；
2. GitHub 使用个人仓库还是新 Organization；
3. v0.1 是否同时公开 npm Alpha，还是只发布 GitHub Release；
4. 规范和 SDK 是否接受不同许可证组合；
5. 是否愿意在 Alpha 前邀请 Agent Surface 维护者讨论 Adapter 边界。

技术实现可以按默认方案推进；这些决策不会阻塞本地 PoC，但会影响公开发布。
