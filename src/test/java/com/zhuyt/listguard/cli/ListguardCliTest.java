package com.zhuyt.listguard.cli;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import picocli.CommandLine;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ListguardCliTest {

    private final ByteArrayOutputStream out = new ByteArrayOutputStream();
    private final ByteArrayOutputStream err = new ByteArrayOutputStream();
    private PrintStream originalOut;
    private PrintStream originalErr;

    @BeforeEach
    void captureStreams() {
        originalOut = System.out;
        originalErr = System.err;
        System.setOut(new PrintStream(out, true, StandardCharsets.UTF_8));
        System.setErr(new PrintStream(err, true, StandardCharsets.UTF_8));
    }

    @AfterEach
    void restoreStreams() {
        System.setOut(originalOut);
        System.setErr(originalErr);
    }

    private int execute(String... args) {
        return new CommandLine(new ListguardCli()).execute(args);
    }

    private String stdout() {
        return out.toString(StandardCharsets.UTF_8);
    }

    private String stderr() {
        return err.toString(StandardCharsets.UTF_8);
    }

    @Test
    void check_exitCode1_whenRed_andSarifToStdout() {
        int code = execute("check", "examples/red-sample.json",
                "--platform", "amazon", "--format", "sarif");
        assertEquals(1, code);
        assertTrue(stdout().contains("\"ruleId\""));
        assertTrue(stdout().contains("\"version\" : \"2.1.0\""));
    }

    @Test
    void check_exitCode0_whenClean() {
        int code = execute("check", "examples/clean-sample.json", "--platform", "amazon");
        assertEquals(0, code);
    }

    @Test
    void check_textReport_containsCountsAndFindings() {
        execute("check", "examples/red-sample.json", "--platform", "amazon", "--format", "text");
        assertTrue(stdout().contains("listing: RED-SAMPLE-001"));
        assertTrue(stdout().contains("counts: RED:"));
    }

    @Test
    void check_failOnYellow_thresholdControlsExitCode() {
        int withRedDefault = execute("check", "examples/yellow-sample.json", "--platform", "amazon");
        assertEquals(0, withRedDefault);
        int withYellow = execute("check", "examples/yellow-sample.json",
                "--platform", "amazon", "--fail-on", "yellow");
        assertEquals(1, withYellow);
    }

    @Test
    void check_unknownPlatform_reportsError() {
        int code = execute("check", "examples/clean-sample.json", "--platform", "ebay");
        assertEquals(2, code);
        assertTrue(stderr().contains("ebay"));
    }

    @Test
    void check_invalidJson_reportsFileOnStderr_andExit1(@TempDir Path tmp) throws Exception {
        Path bad = tmp.resolve("bad.json");
        java.nio.file.Files.writeString(bad, "{not valid json");
        int code = execute("check", bad.toString(), "--platform", "amazon");
        assertEquals(1, code);
        assertTrue(stderr().contains("bad.json"));
    }

    @Test
    void check_directory_scansAllJsonFiles() {
        int code = execute("check", "examples", "--platform", "amazon");
        assertEquals(1, code); // 目录里含 red 样本
        assertTrue(stdout().contains("RED-SAMPLE-001"));
        assertTrue(stdout().contains("CLEAN-SAMPLE-001"));
    }

    @Test
    void rules_listsBuiltinPacks() {
        int code = execute("rules");
        assertEquals(0, code);
        assertTrue(stdout().contains("amazon-us"));
        assertTrue(stdout().contains("temu-global"));
        assertTrue(stdout().contains("tiktok-us"));
        assertTrue(stdout().contains("rules="));
    }
}
