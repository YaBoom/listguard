package com.zhuyt.listguard.cli;

import com.zhuyt.listguard.engine.AuditResult;
import com.zhuyt.listguard.engine.AuditService;
import com.zhuyt.listguard.model.Listing;
import com.zhuyt.listguard.model.RulePack;
import com.zhuyt.listguard.model.Rule;
import com.zhuyt.listguard.model.Severity;
import com.zhuyt.listguard.report.JsonReporter;
import com.zhuyt.listguard.report.Reporter;
import com.zhuyt.listguard.report.SarifReporter;
import com.zhuyt.listguard.report.TextReporter;
import com.zhuyt.listguard.rules.RulePackLoader;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;
import picocli.CommandLine.Parameters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.stream.Stream;

/** check 子命令：审计 listing JSON 文件或目录，按阈值决定退出码（CI 闸门语义）。 */
@Command(name = "check", description = "审计 listing JSON 文件或目录（目录=扫描全部 *.json）")
public class CheckCommand implements Callable<Integer> {

    private static final Map<String, String> BUILTIN_PACKS = Map.of(
            "amazon", "amazon-us", "temu", "temu-global", "tiktok", "tiktok-us");

    @Parameters(index = "0", description = "listing JSON 文件或目录")
    Path path;

    @Option(names = "--platform", required = true, description = "amazon / temu / tiktok")
    String platform;

    @Option(names = "--format", defaultValue = "text", description = "text / json / sarif（默认 text）")
    String format;

    @Option(names = "--fail-on", defaultValue = "red", description = "red / yellow / never（默认 red）")
    String failOn;

    @Option(names = "--rules-dir", description = "自定义规则 YAML 目录：其中的规则追加到内置包")
    Path rulesDir;

    @Override
    public Integer call() {
        try {
            return doCall();
        } catch (IllegalArgumentException | IllegalStateException e) {
            // 配置/规则包错误属用法错误：与「命中红线」（exit 1）区分，返回 2
            System.err.println("用法/配置错误: " + e.getMessage());
            return 2;
        }
    }

    private Integer doCall() {
        String packName = BUILTIN_PACKS.get(platform.toLowerCase(Locale.ROOT));
        if (packName == null) {
            System.err.println("未知平台 [" + platform + "]：可选 amazon / temu / tiktok");
            return 2;
        }
        RulePack pack = RulePackLoader.loadBuiltin(packName);
        if (rulesDir != null) {
            pack = mergeCustomRules(pack, rulesDir);
        }

        List<Path> files = listingFiles(path);
        if (files.isEmpty()) {
            System.err.println("未找到 listing JSON: " + path);
            return 2;
        }

        Reporter reporter = reporter(format);
        Severity threshold = threshold(failOn);
        AuditService service = new AuditService();

        boolean breach = false;
        StringBuilder out = new StringBuilder();
        for (Path file : files) {
            Listing listing;
            try {
                listing = ListingJsonReader.read(file, platform);
            } catch (Exception e) {
                System.err.println("listing 解析失败: " + file + " (" + e.getMessage() + ")");
                breach = true; // 无法解析即无法证明合规
                continue;
            }
            AuditResult result = service.audit(listing, pack);
            String rendered = reporter.render(result);
            out.append(rendered);
            if (!rendered.endsWith("\n")) {
                out.append('\n');
            }
            if (breaches(result.overall(), threshold)) {
                breach = true;
            }
        }
        System.out.print(out.toString());
        return breach ? 1 : 0;
    }

    private RulePack mergeCustomRules(RulePack builtin, Path dir) {
        if (!Files.isDirectory(dir)) {
            throw new IllegalArgumentException("--rules-dir 必须是目录: " + dir);
        }
        List<Rule> merged = new ArrayList<>(builtin.rules());
        try (Stream<Path> yamls = Files.list(dir)) {
            yamls.filter(p -> p.toString().toLowerCase(Locale.ROOT).endsWith(".yaml")
                            || p.toString().toLowerCase(Locale.ROOT).endsWith(".yml"))
                    .sorted()
                    .forEach(p -> merged.addAll(RulePackLoader.load(p).rules()));
        } catch (IOException e) {
            throw new IllegalArgumentException("规则目录读取失败: " + dir, e);
        }
        return new RulePack(builtin.name(), builtin.platform(), builtin.market(),
                builtin.version(), builtin.updated(), List.copyOf(merged));
    }

    private static List<Path> listingFiles(Path path) {
        try {
            if (Files.isRegularFile(path)) {
                return List.of(path);
            }
            if (Files.isDirectory(path)) {
                try (Stream<Path> s = Files.list(path)) {
                    return s.filter(p -> p.toString().toLowerCase(Locale.ROOT).endsWith(".json"))
                            .sorted().toList();
                }
            }
            return List.of();
        } catch (IOException e) {
            return List.of();
        }
    }

    private static Reporter reporter(String format) {
        return switch (format.toLowerCase(Locale.ROOT)) {
            case "json" -> new JsonReporter();
            case "sarif" -> new SarifReporter();
            case "text" -> new TextReporter();
            default -> throw new IllegalArgumentException("未知格式 [" + format + "]：可选 text / json / sarif");
        };
    }

    private static Severity threshold(String failOn) {
        if ("never".equalsIgnoreCase(failOn)) {
            return null;
        }
        try {
            return Severity.valueOf(failOn.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("未知阈值 [" + failOn + "]：可选 red / yellow / never");
        }
    }

    /** overall 达到或超过阈值即 breach（RED 最严重，ordinal 最小）。 */
    private static boolean breaches(Severity overall, Severity threshold) {
        return threshold != null && overall.ordinal() <= threshold.ordinal();
    }
}
