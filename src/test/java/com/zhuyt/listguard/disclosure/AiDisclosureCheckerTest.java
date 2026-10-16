package com.zhuyt.listguard.disclosure;

import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Listing;
import com.zhuyt.listguard.model.Severity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiDisclosureCheckerTest {

    private final AiDisclosureChecker checker = new AiDisclosureChecker();

    @Test
    void nullDisclosure_yellow() {
        var l = new Listing("1", "t", List.of(), "", List.of(), "amazon", null);
        var f = checker.check(l);
        assertEquals(1, f.size());
        assertEquals(Severity.YELLOW, f.get(0).severity());
        assertTrue(f.get(0).message().contains("未声明"));
    }

    @Test
    void claimedHuman_butAiSignals_red() {
        var l = new Listing("1", "t", List.of(),
                "delve into unparalleled seamless experience, elevate your lifestyle with cutting-edge innovation",
                List.of(), "amazon", "human");
        var f = checker.check(l);
        assertTrue(f.stream().anyMatch(x -> x.severity() == Severity.RED));
    }

    @Test
    void claimedHuman_fewSignals_ok() {
        var l = new Listing("1", "t", List.of(), "great product for daily use", List.of(), "amazon", "human");
        assertTrue(checker.check(l).isEmpty());
    }

    @Test
    void assisted_withManySignals_yellow() {
        var l = new Listing("1", "t", List.of(),
                "delve into unparalleled seamless experience, elevate your lifestyle with cutting-edge innovation",
                List.of(), "amazon", "assisted");
        var f = checker.check(l);
        assertTrue(f.stream().anyMatch(x -> x.severity() == Severity.YELLOW));
    }

    @Test
    void declaredAi_noFinding() {
        var l = new Listing("1", "t", List.of(), "", List.of(), "amazon", "ai_generated");
        assertTrue(checker.check(l).isEmpty());
    }
}
