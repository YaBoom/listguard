package com.zhuyt.listguard.disclosure;

import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Listing;
import com.zhuyt.listguard.model.Severity;

import java.util.ArrayList;
import java.util.List;

/**
 * AI 披露合规检查（2026-08 新规）：
 * 未声明披露字段 → YELLOW；声称人工但文本 AI 痕迹密集 → RED（漏标风险）。
 */
public class AiDisclosureChecker {

    /** AI 生成痕迹特征词：出现数量达到阈值即提示漏标风险。 */
    private static final List<String> AI_SIGNALS = List.of(
            "delve", "unparalleled", "seamless", "elevate your", "cutting-edge",
            "revolutionary", "unleash", "game-changer", "harness the power",
            "赋能", "极致体验", "颠覆性", "重新定义", "一站式解决");

    private static final int RED_THRESHOLD = 2;
    private static final int YELLOW_THRESHOLD = 3;

    public List<Finding> check(Listing listing) {
        List<Finding> findings = new ArrayList<>();
        String disclosure = listing.aiDisclosure();
        if (disclosure == null || disclosure.isBlank()) {
            findings.add(new Finding("ai-disclosure-missing", "ai_disclosure", Severity.YELLOW,
                    "aiDisclosure",
                    "未声明",
                    "AI 生成内容披露字段未声明（2026-08 新规：商品信息模板新增 AI 生成内容下拉框，"
                            + "存量商品 2026-11-01 前须完成补全，否则触发警告）",
                    "在卖家后台商品信息模板中如实选择：完全人工 / 部分AI辅助 / 完全AI生成"));
            return findings;
        }
        if ("ai_generated".equalsIgnoreCase(disclosure)) {
            return findings;
        }
        int signals = countSignals(listing);
        if ("human".equalsIgnoreCase(disclosure) && signals >= RED_THRESHOLD) {
            findings.add(new Finding("ai-disclosure-human-risk", "ai_disclosure", Severity.RED,
                    "text",
                    signals + " 处 AI 痕迹特征",
                    "文案疑似 AI 生成但披露为完全人工，平台 AI 扫描检测（2026 准确率约 89%）"
                            + "可能判定漏标，触发处罚",
                    "如部分由 AI 生成，改为「部分AI辅助」并保留生成记录"));
        } else if ("assisted".equalsIgnoreCase(disclosure) && signals >= YELLOW_THRESHOLD) {
            findings.add(new Finding("ai-disclosure-assisted-heavy", "ai_disclosure", Severity.YELLOW,
                    "text",
                    signals + " 处 AI 痕迹特征",
                    "AI 痕迹密集且已标注辅助，建议人工润色降低同质化判定",
                    "对高痕迹段落人工重写后复检"));
        }
        return findings;
    }

    private int countSignals(Listing listing) {
        StringBuilder all = new StringBuilder();
        if (listing.title() != null) {
            all.append(listing.title()).append('\n');
        }
        if (listing.bullets() != null) {
            listing.bullets().forEach(b -> all.append(b).append('\n'));
        }
        if (listing.description() != null) {
            all.append(listing.description()).append('\n');
        }
        String text = all.toString().toLowerCase();
        int count = 0;
        for (String signal : AI_SIGNALS) {
            if (text.contains(signal.toLowerCase())) {
                count++;
            }
        }
        return count;
    }
}
