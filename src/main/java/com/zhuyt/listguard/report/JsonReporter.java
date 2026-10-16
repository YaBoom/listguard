package com.zhuyt.listguard.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zhuyt.listguard.engine.AuditResult;
import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.RulePack;

/** 机器可读 JSON 报告：完整保留命中明细，供 CI 工件与后续工具消费。 */
public class JsonReporter implements Reporter {

    static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String render(AuditResult result) {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("tool", ToolInfo.NAME);
        root.put("toolVersion", ToolInfo.VERSION);
        root.put("listingId", result.listingId());
        root.put("overall", result.overall().name());
        root.set("rulePack", rulePackNode(result.rulePack()));
        ArrayNode findings = root.putArray("findings");
        for (Finding f : result.findings()) {
            ObjectNode n = findings.addObject();
            n.put("ruleId", f.ruleId());
            n.put("category", f.category());
            n.put("severity", f.severity().name());
            n.put("field", f.field());
            n.put("matchedText", f.matchedText());
            n.put("message", f.message());
            n.put("suggestion", f.suggestion());
        }
        return pretty(root);
    }

    private ObjectNode rulePackNode(RulePack pack) {
        ObjectNode n = MAPPER.createObjectNode();
        n.put("name", pack.name());
        n.put("platform", pack.platform());
        n.put("market", pack.market());
        n.put("version", pack.version());
        n.put("updated", pack.updated());
        return n;
    }

    static String pretty(JsonNode node) {
        try {
            return MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(node);
        } catch (Exception e) {
            throw new IllegalStateException("报告序列化失败", e); // 内存构造的节点不应发生
        }
    }
}
