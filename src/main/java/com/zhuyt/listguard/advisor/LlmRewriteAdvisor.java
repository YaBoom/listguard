package com.zhuyt.listguard.advisor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhuyt.listguard.model.Finding;

import java.util.Optional;
import java.util.Set;

/**
 * LLM 语义改写建议（可选层）：规则建议之上的增强。
 * 不可用时静默降级为 empty —— 核心审计功能不依赖 LLM。
 */
public class LlmRewriteAdvisor {

    private static final ObjectMapper MAPPER = new ObjectMapper();

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
            return Optional.of(parseSuggestion(content, originalText, finding));
        } catch (RuntimeException e) {
            // 降级：LLM 只是增强，不是依赖。RuntimeException 覆盖网络/解析/意外缺陷，不让增强层炸穿主流程
            return Optional.empty();
        }
    }

    private FixSuggestion parseSuggestion(String content, String originalText, Finding finding) {
        JsonNode node;
        try {
            node = MAPPER.readTree(content);
        } catch (Exception e) {
            throw new LlmClient.LlmUnavailableException("LLM 建议不是合法 JSON", e);
        }
        String suggestedText = node.path("suggestedText").asText(null);
        if (suggestedText == null || suggestedText.isBlank()) {
            throw new LlmClient.LlmUnavailableException("LLM 建议缺少 suggestedText");
        }
        if (suggestedText.strip().equals(originalText.strip())) {
            throw new LlmClient.LlmUnavailableException("LLM 建议与原文相同，视为无效改写");
        }
        String rationale = node.path("rationale").asText("LLM 改写");
        return new FixSuggestion(true, suggestedText, rationale + "。" + finding.suggestion());
    }
}
