package com.zhuyt.listguard.engine;

import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Listing;
import com.zhuyt.listguard.model.Rule;
import com.zhuyt.listguard.model.RulePack;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 规则引擎：对 listing 的每个文本字段做三级匹配
 * （fold 精确包含 / condense 混淆压缩 / regex 正则），产出 Finding。
 */
public class RuleEngine {

    private static final String REGEX_PREFIX = "re:";

    private final RulePack rulePack;
    private final List<CompiledRule> rules = new ArrayList<>();

    public RuleEngine(RulePack rulePack) {
        this.rulePack = rulePack;
        for (Rule rule : rulePack.rules()) {
            if ("ai_disclosure".equals(rule.category())) {
                continue; // 由 AiDisclosureChecker 专用检查器消费
            }
            rules.add(compile(rule));
        }
    }

    public RulePack rulePack() {
        return rulePack;
    }

    public List<Finding> scan(Listing listing) {
        Map<String, Finding> uniq = new LinkedHashMap<>();
        collect("title", listing.title(), uniq);
        List<String> bullets = listing.bullets() == null ? List.of() : listing.bullets();
        for (int i = 0; i < bullets.size(); i++) {
            collect("bullets[" + i + "]", bullets.get(i), uniq);
        }
        collect("description", listing.description(), uniq);
        List<String> keywords = listing.keywords() == null ? List.of() : listing.keywords();
        for (int i = 0; i < keywords.size(); i++) {
            collect("keywords[" + i + "]", keywords.get(i), uniq);
        }
        return List.copyOf(uniq.values());
    }

    private void collect(String field, String text, Map<String, Finding> uniq) {
        if (text == null || text.isBlank()) {
            return;
        }
        String folded = TextNormalizer.fold(text);
        String condensed = TextNormalizer.condense(text);
        for (CompiledRule cr : rules) {
            for (String hit : cr.matchAll(folded, condensed)) {
                // 同一处违规被变体 patterns（如 best seller / bestseller）双层命中时只报一次：
                // 去重按压缩形态归并，报告与 SARIF 不产生重复告警；保留先命中的 fold 形态
                String key = cr.rule().id() + "|" + field + "|" + TextNormalizer.condense(hit);
                uniq.putIfAbsent(key, new Finding(
                        cr.rule().id(), cr.rule().category(), cr.rule().severity(),
                        field, hit, cr.rule().message(), cr.rule().suggestion()));
            }
        }
    }

    private static CompiledRule compile(Rule rule) {
        List<Pattern> regexes = new ArrayList<>();
        List<String> literals = new ArrayList<>();
        for (String pattern : rule.patterns()) {
            if (pattern.startsWith(REGEX_PREFIX)) {
                try {
                    regexes.add(Pattern.compile(pattern.substring(REGEX_PREFIX.length()),
                            Pattern.CASE_INSENSITIVE));
                } catch (PatternSyntaxException e) {
                    throw new IllegalStateException("非法正则 [" + pattern + "]: 规则 " + rule.id(), e);
                }
            } else {
                literals.add(TextNormalizer.fold(pattern));
            }
        }
        return new CompiledRule(rule, literals, regexes);
    }

    private record CompiledRule(Rule rule, List<String> literals, List<Pattern> regexes) {

        /** 返回该规则在当前字段的全部命中片段（去重后），无命中返回空列表。 */
        List<String> matchAll(String foldedText, String condensedText) {
            List<String> hits = new ArrayList<>();
            for (String literal : literals) {
                if (foldedText.contains(literal)
                        || condensedText.contains(TextNormalizer.condense(literal))) {
                    if (!hits.contains(literal)) {
                        hits.add(literal);
                    }
                }
            }
            for (Pattern p : regexes) {
                Matcher m = p.matcher(foldedText);
                while (m.find()) {
                    String g = m.group();
                    if (!hits.contains(g)) {
                        hits.add(g);
                    }
                }
            }
            return hits;
        }
    }
}
