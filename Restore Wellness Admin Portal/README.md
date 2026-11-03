# Restore Wellness Admin Portal（前端）

Restore Wellness 后台系统的前端。Verdulife 和 Restore Wellness 两间公司都用它开单。
规格：`docs/00_页面清单_给ClaudeCode.md`

## 怎么打开

双击 **Start Restore Portal.bat**。浏览器会打开 http://localhost:8765/，用的时候不要关掉那个黑色窗口。
直接双击 `index.html` 读不到 `data/` 里的资料，会出现提示。

右上角的 **Test role** 用来切换角色（Management / Admin / Nutritionist / Agent）和人员，只是测试用，上线时由 Developer 换成登入。

## 第一版进度（2026-11-02）

| 页 | 状态 | 文件 |
| --- | --- | --- |
| 1 Dashboard | ✅ | `js/pages/dashboard.js` |
| 2–3 顾客列表、顾客档案 | ✅ | `js/pages/customers.js` |
| 4 验血配套 Customize | ✅ 连结（网址待补） | `js/app.js` |
| 5 价目表查询 | ✅ | `js/pages/prices.js` |
| 6 外州验血 | ✅ | `js/pages/outstation.js` |
| 9 CLINICAL 疗程规划器 | ✅ | `js/pages/planner.js`、`js/planner-api.js` |
| 10 我的业绩 & 佣金 | ✅ | `js/pages/mysales.js`、`js/commission-api.js` |
| 12 价目表 & 成本设定 | ✅ | `js/pages/pricing.js`、`js/pricing-lib.js` |
| 13 人员与角色 | ✅ | `js/pages/people.js` |
| 15 Sales（新增）：所有人记销售，Management 确认付款 | ✅ | `js/pages/sales.js`、`js/sales-api.js` |
| 7 Create PO、11 Cost Calculator、14 部门业绩 & 分账 | 第二版 | 先继续用旧 Verdulife Portal |

**还没定 / 还缺：**
- 确认付款后写进 Google Sheet（Daily Sales）：Developer 用 Google Sheets API 接上，只写 Restore Wellness 的单。折扣检查（`js/sales-api.js`）也要在伺服器再检查一次
- Amanda 工具的网址；两间公司的注册号码、地址、Restore 的 logo
- 配套以外的佣金 % 先照旧 Sales Desk（`data/commission_rates.json`），已确认可用
- 顾客退款或中途取消时，佣金要不要追回（`Restore_Packages_Master.md` 第 6 节）

## 文件夹

| 路径 | 内容 |
| --- | --- |
| `index.html` | 系统入口 |
| `css/app.css` | 共用样式（颜色沿用 Restore Sales Desk） |
| `js/core.js` | 资料层、角色、权限表、栏位过滤规则 |
| `js/app.js` | 菜单、切换角色、页面路由 |
| `js/pages/` | 每一页一个文件（做好一页加一个） |
| `data/` | 正式资料（JSON） |
| `data/mock/` | 假资料：人员、顾客、销售 |
| `docs/` | 规格；`docs/reference/` 是旧系统和原型，只用来参考 |

## 资料档案

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `data/cost_calc_data.json` | 验血成本、卖价、Eurofins Promo、固定配套、PWP（**Management 专用**） | Verdulife `2. Cost Calculator/cost_calc_data.json`（2026-10-13，比旧 Portal 里嵌的那份新） |
| `data/quotation_data.json` | Base Panel、加验组 | 旧 Admin Portal 里的 `QT_DATA`（2026-07-26，比文件夹那份新） |
| `data/innoquest_centers.json` | 31 间分行 + HQ，加上内部用的 `lab_pic`、`lab_email` | Verdulife 的 centers JSON + 原始 Innoquest Excel |
| `data/restore_packages.json` | 6 个配套、项目价目、marker、佣金规则（2026-11-02 最终版） | 交接包，原封不动 |
| `data/products.json` | 销售产品目录（跟 Sales Tracker 的 Products 同一份）。有 `source` 的产品，价钱和成本直接读 `restore_packages.json` 或 `cost_calc_data.json`，不重复存 | Sales Tracker.xlsx |
| `data/companies.json` | 两间公司的资料（注册号码、地址先留空） | 新建 |
| `data/app_settings.json` | Amanda 工具网址、折扣毛利底线 50% | 新建 |
| `data/innoquest_form.json` | 新版 Innoquest 表格每一格的位置 | 旧 `fill_innoquest_form.py`（已验证）+ 空腹勾选格 |
| `data/commission_rates.json` | 配套以外的 Agent 佣金 % | 旧 Restore Sales Desk |
| `data/mock/*.json` | 假资料：人员、顾客、销售、疗程方案 | 新建 |

## 存档

`Start Restore Portal.bat` 会跑 `server.py`，它会提供网页，也让第 12 页可以把改动存回 `data/` 里的 JSON。每存一次，旧版本会先复制到 `data/_history/`，文件里的 `_version` 也会加 1（之后成交的方案会记住当时的价钱版本）。
`server.py` 只是本地替代品，没有登入检查。正式上线时，Developer 要换成真正的 API，而且只让 Management 存价钱和成本。

第 9 页的方案存在 `data/mock/plans.json`，经 `POST /api/plans/save` 一次存一份（不会覆盖别人的方案）。计算预算的逻辑在 `js/planner-api.js`，这部分在正式系统要搬到伺服器：营养师的画面只会收到百分比和卖价。提交时会记下当时的价钱和成本（`snapshot`），之后改价目，已提交的方案不受影响。

CLINICAL 配套的项目不锁定（2026-11-02 决定）：`included_items` 只是海报上的数量，营养师可以自由加减；超出预算或验血超过建议上限，要 Management 批准。

验血 marker 的成本不存在文件里：每组 marker 列出它包含的验血项目（`lab_tests`），成本 = 这些项目各取 Eurofins 和 Innoquest 里较贵的那个，再加起来。

## 给 Developer：成本只给 Management

- 所有资料都经过 `js/core.js` 里的 `Data.view(role, user)` 再给画面用。它照 `FIELD_POLICY` 拿掉角色不能看的栏位（`cost`、`eurofins_cost`、`innoquest_cost`、`lock_pct` 等），也会把营养师和 Agent 的顾客、销售过滤成「自己的」。
- **前端版是在浏览器里过滤，正式上线时伺服器必须照同一套规则过滤后才回传**，非 Management 的浏览器完全收不到成本。
- 画面上只给 Management 看的区块会标 `data-role="mgmt"`（测试时有紫色虚线框）。
- 电话就是顾客编号，一律存成 `60` 开头的纯数字（`normPhone()`）。
- 只有 `companies[].writes_to_sales_tracker = true` 的公司（Restore Wellness）的销售会写进 Google Sheet。
