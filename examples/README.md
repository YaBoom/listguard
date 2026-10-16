# examples

三个可直接跑通的 listing 样本：

| 文件 | 预期 | 说明 |
|------|------|------|
| `red-sample.json` | 退出码 1 | 促销词 + 混淆变体 + 绝对化疗效声明 + 促销关键词 |
| `yellow-sample.json` | 默认退出码 0 | 文案干净但缺 `aiDisclosure`，`--fail-on yellow` 时为 1 |
| `clean-sample.json` | 退出码 0 | 干净文案，`aiDisclosure: human` |

```bash
java -jar target/listguard.jar check red-sample.json --platform amazon
java -jar target/listguard.jar check yellow-sample.json --platform amazon --fail-on yellow
java -jar target/listguard.jar check clean-sample.json --platform amazon
```

字段说明：

- `id`：可省，默认取文件名
- `title` / `description`：字符串
- `bullets` / `keywords`：字符串数组，可省
- `platform`：可省，CLI `--platform` 会兜底
- `aiDisclosure`：`human` / `assisted` / `ai_generated`，缺省视为未声明
