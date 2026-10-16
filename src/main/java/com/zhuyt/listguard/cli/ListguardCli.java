package com.zhuyt.listguard.cli;

import picocli.CommandLine;
import picocli.CommandLine.Command;

@Command(name = "listguard", mixinStandardHelpOptions = true,
        version = "listguard 0.1.0",
        description = "Cross-border e-commerce listing compliance audit engine.")
public class ListguardCli implements Runnable {

    @Override
    public void run() {
        CommandLine.usage(this, System.out);
    }

    public static void main(String[] args) {
        int code = new CommandLine(new ListguardCli()).execute(args);
        System.exit(code);
    }
}
