# Restore 后台系统：页面清单（给 Claude Code）

Oct 29, 2026 · @Teo

## 分工和给 Code 的总规则

我们用 Claude Code 把所有页面的前端做完；登入、角色权限、资料库和上线交给 Developer。这份文件是给 Code 的工作清单，也是之后交给 Developer 的规格。

| 谁 | 负责 |
| --- | --- |
| 我们（Claude Code） | 每一页的画面和操作、业务规则的计算、假资料、资料格式说明 |
| Developer | 登入、四个角色的权限、资料库、成本在伺服器过滤、PDF 生成、上线和网址 |

**给 Code 的总规则（每一页都要遵守）：**

1. **做成一个系统，不是分开的 HTML。** 左边一条菜单，按角色显示不同的页。先放一个「切换角色」的下拉选单方便测试，上线时由 Developer 换成登入。
2. **资料和画面分开。** 产品、价钱、成本、分行都从 JSON 读取，不写死在画面里。每一页标明读取哪些资料、存回哪些资料。
3. **成本和毛利只给 Management。** 这些栏位在程式里标记清楚（例如 `data-role="mgmt"`），规格里写明「由伺服器过滤」。其他角色的页面只拿到卖价，不是拿到成本再藏起来。
4. **折扣检查只回「可以 / 不可以」。** 整单毛利低于 50% 就挡住，给非 Management 的角色只显示「这个折扣太低」，不显示毛利数字。
5. **电话就是顾客编号。** 一律存成 60 开头（例如 60123456789），输入时自动整理格式。GHL、这个系统和 Google Sheet 用同一个号码。
6. **画面用英文。** 跟 Sales Tracker 一致；给顾客的报价单和报告维持中文。
7. **手机也要能用。** Agent 多数用手机开。
8. **销售记在系统，自动写进 Google Sheet。** 上线后所有人（包括 Agent）都在系统记销售和配套使用，Management 确认付款后，由 Developer 用 Google Sheets API 写进 Sales Tracker 的 Daily Sales 和 Package Usage。之后 Sheet 只看不改，要改就在系统改。
9. **系统用 Restore Wellness 的名字，但 Verdulife 和 Restore Wellness 都用它开单，两间公司的账分开算。** PO、报价单、报告这些 PDF 上方放一个「公司」选单：Restore Wellness 或 Verdulife Sdn Bhd。选哪一间，PDF 就用那间的 logo、公司名、注册号码、地址。每一笔销售也要记是哪一间公司开的单，月报可以分公司看。只有 Restore Wellness 的销售会写进 Google Sheet，Verdulife 的单只留在系统里。公司资料放在一个 JSON，以后加公司只要加一笔。

## 权限总表

系统一共 13 页（编号保留，第 8 页已拿掉）。每个角色登入后，只看得到自己有 ✓ 的页。「自己的」表示只看得到自己负责的顾客或自己的业绩。

| # | 页面 | Management | Admin | 营养师 | Agent |
| --- | --- | --- | --- | --- | --- |
| 1 | 首页 Dashboard | 全部 | ✓ | ✓ | 自己的 |
| 2 | 顾客列表 | 全部 | 全部 | 自己的 | 自己的 |
| 3 | 顾客档案 | 全部 | 全部（看不到健康笔记） | 自己的 | 自己的（看不到健康笔记） |
| 4 | 验血配套 Customize | ✓ 看得到成本 | ✓ 只看卖价 | ✓ 只看卖价 | ✓ 只看卖价，不能打折 |
| 5 | 价目表查询 | ✓ 看得到成本 | ✓ 只看卖价 | ✓ 只看卖价 | ✓ 只看卖价 |
| 6 | 外州验血（Innoquest 分行 + 表格） | ✓ | ✓ | ✕ | ✕ |
| 7 | Create PO | ✓ | ✓ | ✕ | ✕ |
| 9 | CLINICAL 疗程规划器 | ✓ 看得到成本和利润 | ✕ | ✓ 看不到成本 | ✕ |
| 10 | 我的业绩 & 佣金 | ✕ | ✕ | ✕ | ✓ |
| 11 | Cost Calculator | ✓ | ✕ | ✕ | ✕ |
| 12 | 价目表 & 成本设定 | ✓ | ✕ | ✕ | ✕ |
| 13 | 人员与角色 | ✓ | ✕ | ✕ | ✕ |
| 14 | 部门业绩 & 分账 | ✓ | ✕ | ✕ | ✕ |

公司账本（开销和利润）不放进这个系统，继续留在 Google Sheet。

## 每一页要做什么

标「现有」的页面已经在 Verdulife Admin Portal 或 Restore Sales Desk 里，搬过来改就好；标「新做」的要从头做。

### 共用页面

**1. 首页 Dashboard（新做）**

- 今天要跟进的顾客、快到期的预付配套
- 本月自己做了几份报价、成交几单
- Management 多看：待确认的 Agent 申请、待确认的付款

**2. 顾客列表（现有：Sales Desk 的 Customers）**

- 用名字或电话搜索
- 栏位：名字、电话、负责人、Agent、最近一次购买、下次跟进日期
- 「新增顾客」：名字、电话、性别、出生日期、IC（外州验血要用）、顾客来源、带来的 Agent
- 同一个电话不能建两次，重复时提示「这个顾客已经存在」

**3. 顾客档案（现有一半，要补）**

- 基本资料，加一个「顾客已签 PDPA 同意书」的勾选
- 报价记录：第 4 页存下来的每一份报价
- 买过什么、预付配套余额和 Valid Until
- 健康笔记（consult 记录、主要问题、反馈）：只有营养师和 Management 看得到
- 验血报告：上传 PDF
- 跟进：下次日期 + 要做什么

**4. 验血配套 Customize（Amanda 已经做好，系统不重做）**

- Amanda 用她的 Claude Code 做好了，营养师要用的功能都在里面，系统不重做
- 系统菜单先放一个连结，点了打开 Amanda 的工具
- 折扣规则（整单毛利不低于 50%、点滴和中医师服务不能打折、Agent 不能打折）由 Amanda 照「验血配套折扣规则」prompt 加进她的工具
- 之后再决定要不要整合进系统，例如报价自动存进顾客档案

**5. 价目表查询（新做，资料用现有的 JSON）**

- 搜索所有验血项目、配套、补充品、中心服务
- 显示卖价、类别、可不可以打折
- Management 多看：成本、毛利

### Admin 的工作页

**6. 外州验血（现有：Innoquest Centres + Innoquest Form，要换新表格）**

- 选州 → 分行卡片：地址、营业时间、电话、复制地址给顾客
- 内部栏：分行的 Lab email 和 PIC
- Innoquest 表格：从第 4 页带过来的代码，加上顾客姓名、IC、出生日期、年龄、性别、是否空腹，生成填好的新版表格 PDF
- 新表格的医生栏（VRDU21）和 Bill to（VRLF2）已经印好，不用填

**7. Create PO（现有，重做成可以选公司，暂时预设 Verdulife）**

- 供应商、PO 号码（自动生成，可以改）、日期
- 送货对象：可以载入存过的收件人
- 从价目表选产品、数量，自动算总数，生成 PDF

### 营养师的工作页

**9. CLINICAL 疗程规划器（新做，照 Teo 的规格和原型）**

- 详细规格看 `CLINICAL_Treatment_Planner_Spec.md`，公式和资料直接照搬 `clinical-planner.html`
- 选配套（代谢 / 心血管 / 细胞调理），必含项目不能减少，用剩下的疗程预算加配
- 验血 marker 由营养师勾选，标准健康检查必验，每次建议不超过 RM1,250；marker 价钱和成本接 Cost Calculator 的 JSON
- 即时显示预算已用 %、方案总价值对比价值目标；超出预算不能提交，要 Management 批准
- 营养师看不到成本、预算金额、佣金、手续费、保底和利润，这些由后端只回传给 Management
- 储存方案（草稿 / 已提交 / 已批准），输出给顾客的方案（复制到 WhatsApp 或 PDF），存到顾客档案
- 执行追踪：每做完一次疗程记一次，显示已用 / 剩余次数。这跟 Sales Tracker 的 Package Usage 是同一件事，系统里用同一份记录，再写进 Google Sheet
- 疗程价目、配套设定、成本假设放在第 12 页由 Management 改；改价后已成交的方案保留成交时的价钱
- 配套、项目价目和 marker 以 `restore_packages.json` 为准（2026-11-02 最终价格）。可分配的公式要多扣「领导 Override」：可分配 = 净额 − 代理佣金 − 领导 Override − 售价 × 手续费%

### Agent 的页

**10. 我的业绩 & 佣金（现有：Sales Desk 的 My sales + My payout）**

- 这个月的业绩、已确认的佣金、待确认的佣金
- 我的佣金比例表（只显示 %，不显示成本）
- 每一笔佣金的来源、过去 6 个月
- 佣金要 Management 确认付款后才算
- 配套佣金是每个配套一个固定 RM（SMART 30 RM80 到 CLINICAL 细胞调理 RM2,000），顾客付清全款后才发
- 介绍这位 Agent 的领导拿这一单净额的 2%（Override）
- SMART 30 天内升级 CLINICAL：顾客已付金额全额抵扣；Agent 佣金和领导 Override 都只补差额，不重复给
- 顾客永久归原本介绍的 Agent
- 规则细节看 `Restore_Packages_Master.md` 第 5 节

### Management 的页

**11. Cost Calculator（现有）**

- 两家 Lab 成本比较、X3T / X8T / X12T 自动找最便宜的组合、Innoquest 代码

**12. 价目表 & 成本设定（新做）**

- 加产品、改卖价和成本；卖价默认是成本 ÷ 0.4，可以手动改
- 每一项设「可不可以打折」，也可以改毛利底线（现在 50%）
- 汇入 / 汇出价目表（Excel），方便一次更新很多项
- CLINICAL 疗程价目、三个配套的设定（售价、代理佣金、保底 %、价值倍数、必含项目）和成本假设也在这里改

**13. 人员与角色（现有：Sales Desk 的 People）**

- 加人、设角色、停用帐号（员工离职当天关）
- Agent 的团队领袖是谁，营养师是不是在 probation

**14. 部门业绩 & 分账（现有：Sales Desk 的 Departments & payouts）**

- 确认付款、本月要付的佣金、各部门业绩
- 下载 Excel

## 做的顺序

第一版先做每天都会用到的 10 页，照下面的顺序一页一页叫 Code 做，每做完一页就测试一次。

**第一版（MVP）**

1. **系统外壳：** 左边菜单、切换角色的下拉选单、读取 JSON 的资料层
2. **第 12 页 价目表 & 成本设定：** 先做，因为后面每一页的价钱都从这里来
3. **第 4 页 验血配套 Customize：只放连结到 Amanda 的工具**
4. **第 9 页 CLINICAL 疗程规划器**：价目表做好就接着做，它的疗程价目和配套设定放在第 12 页
5. **第 5 页 价目表查询**
6. **第 6 页 外州验血**（新版 Innoquest 表格）
7. **第 2–3 页 顾客列表和档案**
8. **第 10 页 Agent 业绩 & 佣金**
9. **第 13 页 人员与角色**
10. **第 1 页 Dashboard：** 最后做，它只是把其他页的资料汇总

**第二版**

- 第 7 页 Create PO、第 11 页 Cost Calculator：现有的功能搬进来，现在先继续用旧 Portal
- Client Report Summary 由 Amanda 的工具负责，系统不做
- 第 14 页 部门业绩 & 分账

## 交给 Code 的文件

开始前把这些文件放进同一个文件夹，叫 Code 先读完再动手。

| 文件 | 用在哪里 |
| --- | --- |
| `Verdulife_Admin_Portal.html` | 第 6、7、11 页的现有画面和逻辑 |
| `Restore_Sales_Desk.html` | 第 2、3、10、13、14 页。它的资料存在 Claude 里面，搬过去要换成本地假资料 |
| `cost_calc_data.json` | 成本、验血项目（Management 专用） |
| `quotation_data.json` | Base Panel、加验组、卖价 |
| `innoquest_centers.json` | 31 间分行 + HQ |
| `Innoquest_Form.pdf` | 新版 Innoquest 表格 |
| `Sales Tracker.xlsx` | Products 分页的产品和卖价（跟 Google Sheet 同一份） |
| 这份文件 | 每一页要做什么、权限 |
| `CLINICAL_Treatment_Planner_Spec.md` | 第 9 页的完整规格：公式、配套设定、必含项目、价目、权限 |
| `clinical-planner.html` | 第 9 页的原型，公式和资料照搬 |
| `restore_packages.json` | 6 个配套、项目价目、marker、佣金规则的最终版（第 9、10、12 页读取） |
| `Restore_Packages_Master.md` | 同一份资料的中文说明，包括领导 Override 和升级规则 |

`cost_calc_data.json`、`quotation_data.json`、`innoquest_centers.json` 三份资料已经嵌在 `Verdulife_Admin_Portal.html` 里（`CC_DATA`、`QT_DATA`、`CC_CENTERS`）。请 Code 第一步先把它们拆出来，存成独立的 JSON。

价目表还没更新完不影响开工。先用现有的 JSON，第 12 页做好之后再一次更新。

## 还要 Teo 决定的问题

**已决定：** 销售记在系统，自动写进 Google Sheet · Agent 不能给折扣 · 画面用英文 · Ads & Angle Review 不做，改用 GHL · 验血配套 Customize 和 Client Report 用 Amanda 做好的工具，系统不重做 · Treatment Plan 改成 CLINICAL 疗程规划器，照 Teo 的规格做
