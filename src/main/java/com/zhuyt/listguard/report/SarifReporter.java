package com.zhuyt.listguard.report;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zhuyt.listguard.engine.AuditResult;
import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Severity;

/** SARIF 2.1.0 报告：可直接上传 GitHub Code Scanning 作为合规闸门工件。 */
public class SarifReporter implements Reporter {

    @Override
    public String render(AuditResult result) {
        ObjectNode root = JsonReporter.MAPPER.createObjectNode();
        root.put("$schema", "https://json.schemastore.org/sarif-2.1.0.json");
        root.put("version", "2.1.0");

        ObjectNode run = root.putArray("runs").addObject();
        ObjectNode driver = run.putObject("tool").putObject("driver");
        driver.put("name", ToolInfo.NAME);
        driver.put("version", ToolInfo.VERSION);
        driver.put("informationUri", ToolInfo.INFO_URI);

        var results = run.putArray("results");
        for (Finding f : result.findings()) {
            ObjectNode r = results.addObject();
            r.put("ruleId", f.ruleId());
            r.put("level", level(f.severity()));
            r.putObject("message").put("text",
                    f.field() + ": 命中 [" + f.matchedText() + "] " + f.message());
            ObjectNode props = r.putObject("properties");
            props.put("category", f.category());
            props.put("matchedText", f.matchedText());
            props.put("suggestion", f.suggestion());
        }
        return JsonReporter.pretty(root);
    }

    static String level(Severity severity) {
        return switch (severity) {
            case RED -> "error";
            case YELLOW -> "warning";
            case GREEN -> "none";
        };
    }
}
