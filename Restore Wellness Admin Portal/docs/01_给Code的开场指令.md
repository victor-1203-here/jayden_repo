# 开场指令（整段贴给 Claude Code）

我们要做 Restore Wellness 的后台系统前端。这个文件夹里有所有资料，请照下面的顺序进行。

## 先读，不要写程式

1. 先读 `00_页面清单_给ClaudeCode.md`，这是总规格：分工、9 条总规则、权限表、每一页要做什么、做的顺序。
2. 再读这些参考文件：
   - `Verdulife_Admin_Portal.html`：现有的 Cost Calculator、Innoquest、PO、报价的画面和逻辑
   - `Restore_Sales_Desk.html`：现有的顾客、Agent 业绩、佣金、人员设定（它的资料存在 Claude 里，搬过来要换成本地假资料）
   - `CLINICAL_Treatment_Planner_Spec.md` 和 `clinical-planner.html`：第 9 页疗程规划器
   - `restore_packages.json` 和 `Restore_Packages_Master.md`：6 个配套、项目价目、marker、佣金规则的最终版
   - `Innoquest_Form.pdf`：新版 Innoquest 表格
   - `Sales Tracker.xlsx`：Google Sheet 的格式，系统之后要写进这里
3. 读完后回报：你理解的系统架构、资料档案怎么分、有哪些地方不清楚。**等我确认再开始写。**

## 第 0 步：整理资料

- `Verdulife_Admin_Portal.html` 里嵌了三份资料：`CC_DATA`、`QT_DATA`、`CC_CENTERS`。拆出来存成独立的 `cost_calc_data.json`、`quotation_data.json`、`innoquest_centers.json`。
- 配套和疗程价目用 `restore_packages.json`，不要另外再抄一份。
- 新增一个 `companies.json`：Restore Wellness 和 Verdulife Sdn Bhd 的公司名、注册号码、地址、logo（资料我之后补，先放占位栏位）。

## 之后照「做的顺序」一页一页做

每做完一页：
- 告诉我做了什么、还缺什么资料
- 用「切换角色」把四个角色都试一次，确认 Agent、营养师、Admin 的画面拿不到任何成本资料

## 一定要遵守

- 成本和毛利只给 Management。程式里标清楚哪些栏位是 Management 专用，之后由 Developer 在伺服器过滤。
- 资料不写死在画面里，全部从 JSON 读。
- 不确定的地方先问，不要猜。
