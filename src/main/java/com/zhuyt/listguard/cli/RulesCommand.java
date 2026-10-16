package com.zhuyt.listguard.cli;

import com.zhuyt.listguard.model.RulePack;
import com.zhuyt.listguard.rules.RulePackLoader;
import picocli.CommandLine.Command;

import java.util.List;
import java.util.concurrent.Callable;

/** rules 子命令：列出内置规则包及其规模。 */
@Command(name = "rules", description = "列出内置规则包（name / platform / market / version / rules 数）")
public class RulesCommand implements Callable<Integer> {

    private static final List<String> BUILTINS = List.of("amazon-us", "temu-global", "tiktok-us");

    @Override
    public Integer call() {
        for (String name : BUILTINS) {
            RulePack pack = RulePackLoader.loadBuiltin(name);
            System.out.printf("%s  platform=%s market=%s version=%s updated=%s rules=%d%n",
                    pack.name(), pack.platform(), pack.market(),
                    pack.version(), pack.updated(), pack.rules().size());
        }
        return 0;
    }
}
