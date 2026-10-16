package com.zhuyt.listguard.report;

import com.zhuyt.listguard.engine.AuditResult;
import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Severity;

/** 人类可读 TEXT 报告：纯 StringBuilder，无终端依赖。 */
public class TextReporter implements Reporter {

    @Override
    public String render(AuditResult result) {
        StringBuilder sb = new StringBuilder();
        sb.append("listing: ").append(result.listingId()).append('\n');
        var pack = result.rulePack();
        sb.append("rule-pack: ").append(pack.name()).append('@').append(pack.version()).append('\n');
        sb.append("overall: ").append(result.overall()).append('\n');
        for (Finding f : result.findings()) {
            sb.append('[').append(f.severity()).append("] ").append(f.field()).append(' ')
                    .append(f.ruleId()).append(" hit=\"").append(f.matchedText()).append("\"\n");
            sb.append("    ").append(f.message()).append('\n');
            sb.append("    fix: ").append(f.suggestion()).append('\n');
        }
        int red = count(result, Severity.RED);
        int yellow = count(result, Severity.YELLOW);
        int green = count(result, Severity.GREEN);
        sb.append("counts: RED:").append(red).append(" YELLOW:").append(yellow)
                .append(" GREEN:").append(green).append('\n');
        return sb.toString();
    }

    private static int count(AuditResult result, Severity severity) {
        return (int) result.findings().stream().filter(f -> f.severity() == severity).count();
    }
}
