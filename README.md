# listguard

跨境电商 Listing 合规审计引擎。给 listing 文案做 lint，在商品被平台扫描、下架、封店之前把问题拦下来。

## 为什么做这个

2026 年跨境平台的合规压力是实打实的：

- 亚马逊 2026-08 起强制 AI 内容披露，存量 listing 补披露的截止时间是 2026-11-01，漏报按违规处理
- 平台 AI 扫描对违禁词、绝对化用语的识别准确率已到 89%，靠人工肉眼审文案已经追不上
- 绝对化疗效声明（cure / heals / best seller / 全网最低价）是下架和封店的高频原因
- 代运营公司和客服外包商已经在养专职合规专员——这个岗位每天做的事情，就是本工具自动化的那部分

listguard 把这件事变成代码：规则即文件、审计即命令、阈值即退出码。可以本地跑，也可以直接卡进 CI 流水线。

## 它能查什么

内置三个版本化规则包（amazon-us / temu-global / tiktok-us），覆盖：

- **违禁词与促销词**：free shipping、best seller、全网最低价、手慢无……
- **绝对化声明**：cure、heals、100%、organic（无认证场景）等，按平台风险分级
- **认证与商标风险**：无证书的认证声明、品牌词擦边
- **AI 内容披露**：aiDisclosure 字段缺失或取值非法直接标黄（2026 新规）

匹配引擎不是简单的关键字包含，而是三级匹配：

1. **fold**：全角转半角、大小写折叠、空白归一——`ＦＲＥＥ` 逃不掉
2. **condense**：剥掉混淆分隔符——`f-r-e-e shipping`、`全 场 最 低 价` 逃不掉
3. **regex**：规则包里可以用 `re:` 前缀写正则，带词边界防误报（`cure` 不会误伤 `secure`）

中文词（Temu 场景）做了专门的边界处理，命中词嵌在连续中文串里也能定位并给出移除建议。

## 快速开始

要求 JDK 21+ 和 Maven 3.9+。

```bash
mvn -DskipTests package

# 审计单条 listing
java -jar target/listguard.jar check examples/red-sample.json --platform amazon

# 批量扫描目录，输出 SARIF，阈值设为 yellow
java -jar target/listguard.jar check examples/ --platform amazon --format sarif --fail-on yellow

# 查看内置规则包
java -jar target/listguard.jar rules
```

退出码：`0` 合规通过；`1` 命中阈值（或文件解析失败——解析不了就无法证明合规）；`2` 用法错误。

listing JSON 格式见 [examples](examples/)，`aiDisclosure` 取值 `human` / `assisted` / `ai_generated`。

## 三种使用方式

除了上面的 CLI，还有两个零门槛入口：

### 在线检测台（无需安装）

`web/listguard-listing-compliance-checker.html` 是一个单文件网页：粘贴 listing 文案、选平台、点检测，
即时输出分级报告并在原文高亮命中片段。纯浏览器本地计算，**文案不上传任何服务器**。

它内置的 JS 引擎是 Java 实现的移植，用 `web/tests/engine-parity.test.mjs` 逐条比对，
命中项、分级、字段、建议文本与退出码语义与 CLI 完全一致（52 项断言）。规则数据同样是 YAML 的副本，
由 `web/tests/rulepack-sync.test.mjs` 防止两份数据漂移。

```bash
# 本地预览：直接双击 web/listguard-listing-compliance-checker.html 即可，
# 或起一个静态服务器（注意 npm start 是启动 MCP server，不是网页预览）
npx serve web
```

### MCP server（供 AI agent 调用）

`mcp/server.mjs` 把合规审计暴露为 4 个 MCP 工具，零 npm 依赖，走 stdio JSON-RPC：

| 工具 | 用途 |
|------|------|
| `audit_listing` | 审计一条 listing，返回分级、命中明细与等效 CI 退出码 |
| `list_rule_packs` | 列出支持的平台规则包与规则数 |
| `search_rules` | 按关键词搜规则，回答「这条为什么被判违规」 |
| `suggest_rewrite` | 把命中项转成按字段分组的改写建议 |

```jsonc
// Claude Desktop / Cline / Cursor 等
{ "mcpServers": { "listguard": { "command": "node", "args": ["<repo>/mcp/server.mjs"] } } }
```

MCP server 复用 `web/assets/` 下同一份引擎，判定语义与 CLI、在线页三者一致
（`mcp/server.test.mjs` 40 项断言校验协议与工具行为）。

```bash
npm test   # 依次跑：引擎差分 + 规则同步 + MCP 协议，共 95 项断言
```

## CI 闸门

退出码就是闸门，放进流水线即可：

```yaml
- name: Listing compliance gate
  run: |
    java -jar listguard.jar check listings/ --platform amazon --fail-on yellow
```

`--format sarif` 的输出兼容 SARIF 2.1.0，可以直接作为 GitHub Code Scanning 的上传工件，命中项会以 error / warning 出现在 PR 检查里。

## 自定义规则包

规则包是 YAML，格式如下（完整示例见 `src/main/resources/rules/`）：

```yaml
name: amazon-us
platform: amazon
market: US
version: "2026.10"
updated: "2026-10-16"
rules:
  - id: promo-free-shipping
    category: promo_word
    severity: RED
    patterns:
      - "free shipping"
      - "re:\\bfree\\s+delivery\\b"
    message: 促销词违反平台政策
    suggestion: 删除促销表述，或改用平台官方折扣工具
```

- `severity` 只接受 `RED` / `YELLOW`（GREEN 保留给整体分级语义）
- `patterns` 里 `re:` 前缀表示正则，其余按字面量做三级匹配
- `category` 是固定枚举，见 `RulePackLoader`
- `ai_disclosure` 类规则不带 patterns，由披露检查器消费

用 `--rules-dir` 把自己的 YAML 目录追加到内置包之上，适合代运营商家放自家黑话词库。

## LLM 改写建议（可选）

规则引擎给出确定性建议；`advisor` 包额外提供 LLM 语义改写（OpenAI 兼容接口），通过环境变量配置：

```bash
export LISTGUARD_LLM_BASE_URL=https://api.openai.com/v1
export LISTGUARD_LLM_API_KEY=sk-...
export LISTGUARD_LLM_MODEL=gpt-4o-mini
```

LLM 只是增强层：不可用、超时、返回异常时静默降级，核心审计完全不依赖它。当前以库 API 形式提供（`LlmRewriteAdvisor`），CLI 集成在路线图中。

## 设计取舍

- **确定性优先**：合规审计的价值在于可复现、可解释，每条命中都带规则 id 和依据；LLM 永远不做判定
- **依赖只有 4 个**：picocli / snakeyaml / jackson-databind / junit，单个可执行 jar，没有框架
- **规则即版本化文件**：词库更新走 code review，改了什么、为什么改，git log 里都有

## 路线图

- [x] MCP server / SDK（供 agent 工作流调用）→ 已交付 `mcp/server.mjs`（Node 实现，零依赖；原计划的 Python 版未做，因为 Node 版能直接复用已验证的网页引擎，避免出现第三份判定实现）
- [x] 免费在线检测台（零安装门槛的获客入口）→ 已交付 `web/`
- [ ] CLI 集成 LLM 改写建议（`--suggest`）——`LlmRewriteAdvisor` 已实现，CLI 尚未接线
- [ ] 付费垂直规则包订阅（类目级：保健品、母婴、化妆品）
- [ ] 团队批量 API 与报告看板
- [ ] 批量与增量扫描性能（当前单机单进程）

商业化路径与渠道优先级见 [docs/commercialization-plan.md](docs/commercialization-plan.md)。

## License

MIT
