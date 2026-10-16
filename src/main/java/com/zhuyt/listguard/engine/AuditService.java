package com.zhuyt.listguard.engine;

import com.zhuyt.listguard.disclosure.AiDisclosureChecker;
import com.zhuyt.listguard.model.Finding;
import com.zhuyt.listguard.model.Listing;
import com.zhuyt.listguard.model.RulePack;
import com.zhuyt.listguard.model.Severity;

import java.util.ArrayList;
import java.util.List;

/** 审计编排：规则引擎 + AI 披露检查合并，聚合整体分级。 */
public class AuditService {

    private final AiDisclosureChecker disclosureChecker = new AiDisclosureChecker();

    public AuditResult audit(Listing listing, RulePack rulePack) {
        return audit(listing, rulePack, new RuleEngine(rulePack));
    }

    public List<AuditResult> auditAll(List<Listing> listings, RulePack rulePack) {
        RuleEngine engine = new RuleEngine(rulePack);
        List<AuditResult> results = new ArrayList<>();
        for (Listing l : listings) {
            results.add(audit(l, rulePack, engine));
        }
        return List.copyOf(results);
    }

    private AuditResult audit(Listing listing, RulePack rulePack, RuleEngine engine) {
        List<Finding> findings = new ArrayList<>();
        findings.addAll(engine.scan(listing));
        findings.addAll(disclosureChecker.check(listing));

        Severity overall = Severity.GREEN;
        for (Finding f : findings) {
            overall = Severity.max(overall, f.severity());
        }
        return new AuditResult(listing.id(), List.copyOf(findings), overall, rulePack);
    }
}
