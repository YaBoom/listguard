package com.zhuyt.listguard.rules;

import com.zhuyt.listguard.engine.TextNormalizer;
import com.zhuyt.listguard.model.Rule;
import com.zhuyt.listguard.model.RulePack;
import com.zhuyt.listguard.model.Severity;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.error.YAMLException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** 规则包加载器：classpath 内置包或外部 YAML 文件，校验失败立即报错。 */
public final class RulePackLoader {

    private static final Set<String> CATEGORIES = Set.of(
            "banned_word", "promo_word", "absolute_claim",
            "certification_claim", "trademark_risk", "ai_disclosure");

    private RulePackLoader() {
    }

    /** 从 classpath rules/ 目录加载内置规则包。 */
    public static RulePack loadBuiltin(String name) {
        String location = "rules/" + name + ".yaml";
        InputStream in = RulePackLoader.class.getClassLoader().getResourceAsStream(location);
        if (in == null) {
            throw new IllegalArgumentException("未知规则包: " + name);
        }
        try (in) {
            return parse(loadYaml(in, location), location);
        } catch (IOException e) {
            throw new IllegalStateException("规则包读取失败: " + location, e);
        } catch (YAMLException e) {
            throw new IllegalStateException("YAML 解析失败: " + location, e);
        }
    }

    /** 从外部 YAML 文件加载（供 --rules-dir 自定义词库）。 */
    public static RulePack load(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            return parse(loadYaml(in, file.toString()), file.toString());
        } catch (IOException e) {
            throw new IllegalStateException("规则包读取失败: " + file, e);
        } catch (YAMLException e) {
            throw new IllegalStateException("YAML 解析失败: " + file, e);
        }
    }

    private static Map<String, Object> loadYaml(InputStream in, String location) {
        Object root;
        try {
            root = new Yaml(new LoaderOptions()).load(in);
        } catch (YAMLException e) {
            throw new IllegalStateException("YAML 解析失败: " + location, e);
        }
        if (!(root instanceof Map<?, ?> m)) {
            throw new IllegalStateException("规则包顶层必须是映射: " + location);
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) m;
        return result;
    }

    private static RulePack parse(Map<String, Object> root, String location) {
        if (root == null) {
            throw new IllegalStateException("规则包为空: " + location);
        }
        String name = str(root, "name", location, true);
        String platform = str(root, "platform", location, true);
        String market = str(root, "market", location, true);
        String version = str(root, "version", location, true);
        String updated = str(root, "updated", location, true);

        List<Rule> rules = new ArrayList<>();
        Object rawRules = root.get("rules");
        if (rawRules instanceof List<?> list) {
            for (Object o : list) {
                rules.add(parseRule(o, location));
            }
        } else if (rawRules != null) {
            throw new IllegalStateException("rules 必须是列表: " + location);
        }
        return new RulePack(name, platform, market, version, updated, List.copyOf(rules));
    }

    private static Rule parseRule(Object o, String location) {
        if (!(o instanceof Map<?, ?> raw)) {
            throw new IllegalStateException("rule 必须是映射: " + location);
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> m = (Map<String, Object>) raw;
        String id = str(m, "id", location, true);
        String category = str(m, "category", location, true);
        if (!CATEGORIES.contains(category)) {
            throw new IllegalStateException("非法 category [" + category + "]: " + location);
        }
        String severityStr = str(m, "severity", location, true);
        Severity severity;
        try {
            severity = Severity.valueOf(severityStr.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("非法 severity [" + severityStr + "]: " + location);
        }
        if (severity == Severity.GREEN) {
            throw new IllegalStateException("规则 severity 不能为 GREEN（GREEN 仅用于整体分级）: " + id + "@" + location);
        }
        Object rawPatterns = m.get("patterns");
        List<String> patterns = new ArrayList<>();
        if (rawPatterns instanceof List<?> list) {
            for (Object p : list) {
                if (p == null || p.toString().isBlank()) {
                    throw new IllegalStateException("规则 pattern 不能为空: " + id + "@" + location);
                }
                patterns.add(p.toString());
            }
        }
        if (patterns.isEmpty() && !"ai_disclosure".equals(category)) {
            throw new IllegalStateException("规则 patterns 不能为空: " + id + "@" + location);
        }
        for (String p : patterns) {
            if (!p.startsWith("re:") && TextNormalizer.condense(p).isEmpty()) {
                // 压缩后为空的纯符号 pattern 会使 contains("") 恒真，全字段误报
                throw new IllegalStateException("规则 pattern 不能是纯符号（压缩后为空）: " + id + "@" + location);
            }
        }
        return new Rule(id, category, severity, List.copyOf(patterns),
                str(m, "message", location, true), str(m, "suggestion", location, true));
    }

    private static String str(Map<String, Object> m, String key, String location, boolean required) {
        Object v = m.get(key);
        String s = v == null ? "" : v.toString().trim();
        if (required && s.isEmpty()) {
            throw new IllegalStateException("缺少字段 [" + key + "]: " + location);
        }
        return s;
    }
}
