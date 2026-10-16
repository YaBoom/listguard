package com.zhuyt.listguard.advisor;

import com.zhuyt.listguard.engine.TextNormalizer;
import com.zhuyt.listguard.model.Finding;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 规则化修复建议：对可定位的命中片段给出移除改写。
 * 以「压缩后的命中字符序列 + 任意非字母数字分隔符」构造正则，
 * 同时兼容混淆变体（f-r-e-e shipping）与全角变体；
 * ai_disclosure 类与原文未命中的建议不自动改写。
 */
public class FixSuggester {

    /** 可自动移除改写的类别。 */
    private static final Set<String> REMOVABLE_CATEGORIES = Set.of(
            "banned_word", "promo_word", "absolute_claim",
            "certification_claim", "trademark_risk");

    /** 分隔符：字母数字与 CJK 之外的任意字符（含空格/连字符/全角符号残留）。 */
    private static final String SEP = "[^0-9A-Za-z\\u4e00-\\u9fff]*";
    private static final String BOUNDARY_LEFT = "(?<![0-9A-Za-z\\u4e00-\\u9fff])";
    private static final String BOUNDARY_RIGHT = "(?![0-9A-Za-z\\u4e00-\\u9fff])";

    public FixSuggestion suggest(String originalText, Finding finding) {
        if (originalText == null || originalText.isBlank()
                || !REMOVABLE_CATEGORIES.contains(finding.category())) {
            return FixSuggestion.notApplicable("类别 [" + finding.category() + "] 不支持自动改写");
        }
        String condensedHit = TextNormalizer.condense(finding.matchedText());
        if (condensedHit.isEmpty()) {
            return FixSuggestion.notApplicable("命中片段为空");
        }

        Pattern pattern = buildRemovalPattern(condensedHit);
        String normalized = halfWidth(originalText);
        Matcher m = pattern.matcher(normalized);
        if (!m.find()) {
            return FixSuggestion.notApplicable("原文未包含可移除的命中片段");
        }
        String suggested = m.replaceAll(" ").replaceAll("\\s{2,}", " ").trim();
        if (suggested.equals(normalized.trim())) {
            return FixSuggestion.notApplicable("原文未包含可移除的命中片段");
        }
        return new FixSuggestion(true, suggested,
                "移除违规表述 [" + finding.matchedText() + "]，其余文案保留。" + finding.suggestion());
    }

    /** 构造：边界 + 逐字符 quote + 分隔符连接 的移除正则。 */
    private static Pattern buildRemovalPattern(String condensedHit) {
        StringBuilder sb = new StringBuilder(BOUNDARY_LEFT);
        for (int i = 0; i < condensedHit.length(); i++) {
            if (i > 0) {
                sb.append(SEP);
            }
            sb.append(Pattern.quote(String.valueOf(condensedHit.charAt(i))));
        }
        sb.append(BOUNDARY_RIGHT);
        return Pattern.compile(sb.toString(), Pattern.CASE_INSENSITIVE);
    }

    /** 全角转半角，保证全角混淆变体也能按同一字符序列匹配。 */
    private static String halfWidth(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
            if (c >= 0xFF01 && c <= 0xFF5E) {
                sb.append((char) (c - 0xFEE0));
            } else if (c == 0x3000) {
                sb.append(' ');
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
