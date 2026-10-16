package com.zhuyt.listguard.advisor;

import com.zhuyt.listguard.model.Finding;

import java.util.Optional;
import java.util.Set;

/**
 * LLM 语义改写建议（可选层）：规则建议之上的增强。
 * 不可用时静默降级为 empty —— 核心审计功能不依赖 LLM。
 */
public class LlmRewriteAdvisor {

    private final LlmClient client;

    public LlmRewriteAdvisor(LlmClient client) {
        this.client = client;
    }

    private static final Set<String> REMOVABLE_CATEGORIES = Set.of(
            "banned_word", "promo_word", "absolute_claim",
            "certification_claim", "trademark_risk");

    /**
     * 请求 LLM 给出移除违规表述后的改写文本。
     * 仅对可移除类别调用；LLM 任何失败都降级为 empty。
     */
    public Optional<FixSuggestion> rewrite(String originalText, Finding finding) {
        if (originalText == null || originalText.isBlank()
                || !REMOVABLE_CATEGORIES.contains(finding.category())) {
            return Optional.empty();
        }
        String prompt = """
                你是跨境电商 Listing 合规专家。请改写以下商品文案：移除违规表述「%s」（原因：%s），
                保留其余内容与原意，只输出 JSON：{"suggestedText":"改写后的完整文案","rationale":"一句话说明"}
                平台：%s
                原文：%s
                """.formatted(finding.matchedText(), finding.message(),
                finding.category(), originalText);
        try {
            String content = client.complete(prompt);
            return Optional.of(parseSuggestion(content, finding));
        } catch (LlmClient.LlmUnavailableException e) {
            return Optional.empty(); // 降级：LLM 只是增强，不是依赖
        }
    }

    private FixSuggestion parseSuggestion(String content, Finding finding) {
        String suggestedText = extractJsonField(content, "suggestedText");
        if (suggestedText == null || suggestedText.isBlank()) {
            throw new LlmClient.LlmUnavailableException("LLM 建议缺少 suggestedText");
        }
        String rationale = extractJsonField(content, "rationale");
        return new FixSuggestion(true, suggestedText,
                (rationale == null ? "LLM 改写" : rationale) + "。" + finding.suggestion());
    }

    private static String extractJsonField(String json, String field) {
        String key = "\"" + field + "\":\"";
        int start = json.indexOf(key);
        if (start < 0) {
            return null;
        }
        start += key.length();
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                char next = json.charAt(++i);
                sb.append(switch (next) {
                    case 'n' -> '\n';
                    case 't' -> '\t';
                    case '"' -> '"';
                    case '\\' -> '\\';
                    default -> next;
                });
                continue;
            }
            if (c == '"') {
                return sb.toString();
            }
            sb.append(c);
        }
        return sb.toString();
    }
}
