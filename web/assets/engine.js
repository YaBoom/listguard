/* SECTION: engine
 * listguard 规则引擎的 JavaScript 移植版。
 * 目标：与 Java 版（src/main/java/com/zhuyt/listguard/）产出逐条一致的 Finding，
 *      包括命中顺序、去重键、分级聚合与 AI 披露短路逻辑。
 *
 * 与 Java 语义对齐的四个关键点（改这里之前先读）：
 * 1. Java 的 \s 只匹配 ASCII 空白，JS 的 \s 还包含 \u00a0 / \u3000 等。
 *    因此 fold 内部与规则正则都改用显式 ASCII 空白类，见 ASCII_WS / javaWhitespace。
 * 2. Character.isLetterOrDigit 对应 Unicode 类别 L* 与 Nd，故 condense 用 [\p{L}\p{Nd}]。
 * 3. Pattern.compile(expr, CASE_INSENSITIVE) 未开 UNICODE_CASE，只折叠 ASCII 大小写；
 *    JS 侧不加 u 标志以保持 \b / \w 的 ASCII 语义，与 Java 一致。
 * 4. Finding 顺序为「字段优先、规则次之」，去重键 ruleId|field|condense(hit)，
 *    使用插入有序映射并保留先命中者（对应 LinkedHashMap.putIfAbsent）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.ListguardEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 常量 ---------- */

  var CATEGORIES = ['banned_word', 'promo_word', 'absolute_claim',
    'certification_claim', 'trademark_risk', 'ai_disclosure'];

  var REGEX_PREFIX = 're:';

  /* Severity：ordinal 越小越严重（RED=0, YELLOW=1, GREEN=2），与 Java enum 声明顺序一致 */
  var SEVERITY = { RED: 0, YELLOW: 1, GREEN: 2 };

  /* Java Character.isWhitespace 认可的字符（不含 \u00a0 / \u2007 / \u202f） */
  var JAVA_WS = /[\t\n\v\f\r \u001c-\u001f\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/;

  /* Java Pattern 中 \s 的实际含义：纯 ASCII 空白 */
  var ASCII_WS_CLASS = '[ \\t\\n\\x0B\\f\\r]';

  /* AI 生成痕迹特征词与阈值，与 AiDisclosureChecker 一致 */
  var AI_SIGNALS = [
    'delve', 'unparalleled', 'seamless', 'elevate your', 'cutting-edge',
    'revolutionary', 'unleash', 'game-changer', 'harness the power',
    '赋能', '极致体验', '颠覆性', '重新定义', '一站式解决'
  ];
  var RED_THRESHOLD = 2;      // human 声明但痕迹 >= 2 → RED（漏标风险）
  var YELLOW_THRESHOLD = 3;   // assisted 声明但痕迹 >= 3 → YELLOW
  var KNOWN_DISCLOSURE = ['human', 'assisted', 'ai_generated'];

  var isCjk = function (ch) {
    var c = ch.charCodeAt(0);
    return c >= 0x4e00 && c <= 0x9fff;
  };

  /* ---------- 文本归一化（对应 TextNormalizer） ---------- */

  var toHalfWidth = function (c) {
    var code = c.charCodeAt(0);
    if (code >= 0xff01 && code <= 0xff5e) {
      return String.fromCharCode(code - 0xfee0);
    }
    if (code === 0x3000) {
      return ' ';
    }
    return c;
  };

  /**
   * fold：全角 ASCII 转半角、转小写、CJK 字符之间的空白移除、其余连续空白折叠为单个空格。
   * @returns {string}
   */
  var fold = function (text) {
    return foldWithMap(text).out;
  };

  /**
   * fold 的位置感知版本：map[k] 为输出第 k 个字符对应的原始下标。
   * 供 UI 把命中片段高亮回原文使用；折叠/合并时空白段取首个空白的原始下标。
   */
  var foldWithMap = function (text) {
    if (text === null || text === undefined || text === '') {
      return { out: '', map: [] };
    }
    var src = String(text);
    /* 第一步：逐字符做半角化 + 空白判定 + 小写化，记录原始下标 */
    var chars = [];
    var idx = [];
    for (var i = 0; i < src.length; i++) {
      var half = toHalfWidth(src.charAt(i));
      var outCh;
      if (JAVA_WS.test(half)) {
        outCh = ' ';
      } else {
        /* Java Character.toLowerCase 是单字符映射；这里对单字符取小写，语义等价 */
        outCh = half.toLowerCase();
      }
      /* 单字符 toLowerCase 极少数情况会展开为多字符（如 U+0130）；按 Java 语义只取首字符 */
      if (outCh.length > 1) {
        outCh = outCh.charAt(0);
      }
      chars.push(outCh);
      idx.push(i);
    }

    /* 第二步：移除 CJK 与 CJK 之间的空白段（对应 Java CJK_GAP 的 lookbehind/lookahead）。
       手写扫描而非 lookbehind 正则：一是与 Java 在原始串上求值的语义完全一致，
       二是避免旧版 Safari 解析 lookbehind 字面量时抛 SyntaxError 导致整页白屏。 */
    var kept = [];
    var keptIdx = [];
    var n = chars.length;
    var p = 0;
    while (p < n) {
      if (chars[p] === ' ') {
        var q = p;
        while (q < n && chars[q] === ' ') { q++; }
        var prev = p > 0 ? chars[p - 1] : '';
        var next = q < n ? chars[q] : '';
        if (prev && next && isCjk(prev) && isCjk(next)) {
          p = q; /* 整段丢弃 */
          continue;
        }
        kept.push(chars[p]);
        keptIdx.push(idx[p]);
        p = q;
        continue;
      }
      kept.push(chars[p]);
      keptIdx.push(idx[p]);
      p++;
    }

    /* 第三步：连续空白折叠为单个空格，再 trim */
    var out = [];
    var outMap = [];
    var prevSpace = false;
    for (var k = 0; k < kept.length; k++) {
      if (kept[k] === ' ') {
        if (prevSpace) { continue; }
        prevSpace = true;
        out.push(' ');
        outMap.push(keptIdx[k]);
      } else {
        prevSpace = false;
        out.push(kept[k]);
        outMap.push(keptIdx[k]);
      }
    }
    while (out.length && out[0] === ' ') { out.shift(); outMap.shift(); }
    while (out.length && out[out.length - 1] === ' ') { out.pop(); outMap.pop(); }

    return { out: out.join(''), map: outMap };
  };

  var LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;

  /** condense：fold 后仅保留字母与数字（含中日韩文字），对抗 f-r-e-e / 全 场 最 低 价 类混淆 */
  var condense = function (text) {
    return condenseWithMap(foldWithMap(text)).out;
  };

  var condenseWithMap = function (folded) {
    var out = [];
    var outMap = [];
    for (var i = 0; i < folded.out.length; i++) {
      var c = folded.out.charAt(i);
      if (LETTER_OR_DIGIT.test(c)) {
        out.push(c);
        outMap.push(folded.map[i]);
      }
    }
    return { out: out.join(''), map: outMap };
  };

  /* ---------- 规则正则的 Java 兼容化 ---------- */

  /**
   * 把规则正则里的 \s / \S 改写为 Java Pattern 的 ASCII 语义。
   * Java 的 \s = [ \t\n\x0B\f\r]，而 JS 的 \s 额外包含 \u00a0、\u3000 等，
   * 不改写会让同一份规则包在两端对非断行空格产生不同判定。
   * 逐字符扫描以正确跳过 \\s（被转义的反斜杠 + 字面 s）这类情况。
   */
  var toJavaAsciiWhitespace = function (source) {
    var out = '';
    var i = 0;
    while (i < source.length) {
      var c = source.charAt(i);
      if (c === '\\') {
        var next = source.charAt(i + 1);
        if (next === '\\') { out += '\\\\'; i += 2; continue; }
        if (next === 's') { out += ASCII_WS_CLASS; i += 2; continue; }
        if (next === 'S') { out += '[^' + ASCII_WS_CLASS.slice(1, -1) + ']'; i += 2; continue; }
        out += c + next;
        i += 2;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  };

  var compileRuleRegex = function (expr, ruleId) {
    try {
      return new RegExp(toJavaAsciiWhitespace(expr), 'i');
    } catch (e) {
      throw new Error('非法正则 [' + expr + ']: 规则 ' + ruleId);
    }
  };

  /* ---------- 规则包校验（对应 RulePackLoader 的 parseRule 约束） ---------- */

  var validatePack = function (pack, location) {
    if (!pack || typeof pack !== 'object') {
      throw new Error('规则包必须是对象: ' + location);
    }
    ['name', 'platform', 'market', 'version', 'updated'].forEach(function (k) {
      if (!pack[k] || !String(pack[k]).trim()) {
        throw new Error('缺少字段 [' + k + ']: ' + location);
      }
    });
    var rules = pack.rules || [];
    rules.forEach(function (r) {
      if (!r.id || !String(r.id).trim()) { throw new Error('缺少字段 [id]: ' + location); }
      if (CATEGORIES.indexOf(r.category) === -1) {
        throw new Error('非法 category [' + r.category + ']: ' + r.id + '@' + location);
      }
      var sev = String(r.severity || '').toUpperCase();
      if (SEVERITY[sev] === undefined) {
        throw new Error('非法 severity [' + r.severity + ']: ' + r.id + '@' + location);
      }
      if (sev === 'GREEN') {
        throw new Error('规则 severity 不能为 GREEN（GREEN 仅用于整体分级）: ' + r.id + '@' + location);
      }
      var patterns = r.patterns || [];
      if (patterns.length === 0 && r.category !== 'ai_disclosure') {
        throw new Error('规则 patterns 不能为空: ' + r.id + '@' + location);
      }
      patterns.forEach(function (p) {
        if (p === null || p === undefined || !String(p).trim()) {
          throw new Error('规则 pattern 不能为空: ' + r.id + '@' + location);
        }
        if (String(p).indexOf(REGEX_PREFIX) !== 0 && condense(p) === '') {
          /* 压缩后为空的纯符号 pattern 会使 indexOf('') 恒为 0，全字段误报 */
          throw new Error('规则 pattern 不能是纯符号（压缩后为空）: ' + r.id + '@' + location);
        }
      });
    });
    return true;
  };

  /* ---------- 规则编译 ---------- */

  var compileRule = function (rule) {
    var literals = [];
    var regexes = [];
    (rule.patterns || []).forEach(function (p) {
      var s = String(p);
      if (s.indexOf(REGEX_PREFIX) === 0) {
        regexes.push(compileRuleRegex(s.substring(REGEX_PREFIX.length), rule.id));
      } else {
        literals.push(fold(s));
      }
    });
    return { rule: rule, literals: literals, regexes: regexes };
  };

  /** 返回该规则在当前字段的全部命中片段（去重后），无命中返回空数组。对应 CompiledRule.matchAll */
  var matchAll = function (compiled, foldedText, condensedText) {
    var hits = [];
    var pushHit = function (h) { if (hits.indexOf(h) === -1) { hits.push(h); } };

    compiled.literals.forEach(function (literal) {
      if (foldedText.indexOf(literal) !== -1 ||
          condensedText.indexOf(condense(literal)) !== -1) {
        pushHit(literal);
      }
    });
    compiled.regexes.forEach(function (re) {
      /* 全局副本：避免 lastIndex 在多次 find 之间残留 */
      var g = new RegExp(re.source, re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags);
      var m;
      while ((m = g.exec(foldedText)) !== null) {
        pushHit(m[0]);
        if (m[0] === '') { g.lastIndex++; } /* 零宽匹配防死循环 */
      }
    });
    return hits;
  };

  /* ---------- 规则引擎（对应 RuleEngine） ---------- */

  var RuleEngine = function (rulePack) {
    this.rulePack = rulePack;
    this.rules = [];
    var self = this;
    (rulePack.rules || []).forEach(function (rule) {
      if (rule.category === 'ai_disclosure') { return; } /* 由披露检查器专用消费 */
      self.rules.push(compileRule(rule));
    });
  };

  RuleEngine.prototype.scan = function (listing) {
    var uniq = new Map(); /* 插入有序，等价 LinkedHashMap */
    var fields = [];
    fields.push(['title', listing.title]);
    var bullets = listing.bullets || [];
    for (var i = 0; i < bullets.length; i++) {
      fields.push(['bullets[' + i + ']', bullets[i]]);
    }
    fields.push(['description', listing.description]);
    var keywords = listing.keywords || [];
    for (var k = 0; k < keywords.length; k++) {
      fields.push(['keywords[' + k + ']', keywords[k]]);
    }
    for (var f = 0; f < fields.length; f++) {
      this.collect(fields[f][0], fields[f][1], uniq);
    }
    return Array.from(uniq.values());
  };

  RuleEngine.prototype.collect = function (field, text, uniq) {
    if (text === null || text === undefined || String(text).trim() === '') { return; }
    var folded = fold(text);
    var condensed = condense(text);
    for (var r = 0; r < this.rules.length; r++) {
      var cr = this.rules[r];
      var hits = matchAll(cr, folded, condensed);
      for (var h = 0; h < hits.length; h++) {
        var hit = hits[h];
        /* 同一处违规被变体 patterns（如 best seller / bestseller）双层命中时只报一次：
           按压缩形态归并，保留先命中的 fold 形态 */
        var key = cr.rule.id + '|' + field + '|' + condense(hit);
        if (!uniq.has(key)) {
          uniq.set(key, {
            ruleId: cr.rule.id,
            category: cr.rule.category,
            severity: String(cr.rule.severity).toUpperCase(),
            field: field,
            matchedText: hit,
            message: cr.rule.message,
            suggestion: cr.rule.suggestion
          });
        }
      }
    }
  };

  /* ---------- AI 披露检查（对应 AiDisclosureChecker） ---------- */

  var countSignals = function (listing) {
    var all = '';
    if (listing.title) { all += listing.title + '\n'; }
    var bullets = listing.bullets || [];
    for (var i = 0; i < bullets.length; i++) { all += bullets[i] + '\n'; }
    if (listing.description) { all += listing.description + '\n'; }
    /* 注意：与 Java 一致，keywords 不参与 AI 痕迹计数 */
    var text = all.toLowerCase();
    var count = 0;
    for (var s = 0; s < AI_SIGNALS.length; s++) {
      if (text.indexOf(AI_SIGNALS[s].toLowerCase()) !== -1) { count++; }
    }
    return count;
  };

  var checkDisclosure = function (listing) {
    var findings = [];
    var disclosure = listing.aiDisclosure;
    if (disclosure === null || disclosure === undefined || String(disclosure).trim() === '') {
      findings.push({
        ruleId: 'ai-disclosure-missing', category: 'ai_disclosure', severity: 'YELLOW',
        field: 'aiDisclosure', matchedText: '未声明',
        message: 'AI 生成内容披露字段未声明（2026-08 新规：商品信息模板新增 AI 生成内容下拉框，' +
          '存量商品 2026-11-01 前须完成补全，否则触发警告）',
        suggestion: '在卖家后台商品信息模板中如实选择：完全人工 / 部分AI辅助 / 完全AI生成'
      });
      return findings;
    }
    var d = String(disclosure).trim().toLowerCase();
    if (KNOWN_DISCLOSURE.indexOf(d) === -1) {
      findings.push({
        ruleId: 'ai-disclosure-unknown', category: 'ai_disclosure', severity: 'YELLOW',
        field: 'aiDisclosure', matchedText: String(disclosure),
        message: '未知的 AI 披露值: ' + disclosure +
          '（合法值：human / assisted / ai_generated），无法判定披露状态，视为未声明风险',
        suggestion: '修正为合法值之一后在后台如实填写披露字段'
      });
      return findings;
    }
    if (d === 'ai_generated') { return findings; } /* 已如实声明，直接通过 */

    var signals = countSignals(listing);
    if (d === 'human' && signals >= RED_THRESHOLD) {
      findings.push({
        ruleId: 'ai-disclosure-human-risk', category: 'ai_disclosure', severity: 'RED',
        field: 'text', matchedText: signals + ' 处 AI 痕迹特征',
        message: '文案疑似 AI 生成但披露为完全人工，平台 AI 扫描检测（2026 准确率约 89%）' +
          '可能判定漏标，触发处罚',
        suggestion: '如部分由 AI 生成，改为「部分AI辅助」并保留生成记录'
      });
    } else if (d === 'assisted' && signals >= YELLOW_THRESHOLD) {
      findings.push({
        ruleId: 'ai-disclosure-assisted-heavy', category: 'ai_disclosure', severity: 'YELLOW',
        field: 'text', matchedText: signals + ' 处 AI 痕迹特征',
        message: 'AI 痕迹密集且已标注辅助，建议人工润色降低同质化判定',
        suggestion: '对高痕迹段落人工重写后复检'
      });
    }
    return findings;
  };

  /* ---------- 审计编排（对应 AuditService） ---------- */

  var severityMax = function (a, b) {
    return SEVERITY[a] <= SEVERITY[b] ? a : b;
  };

  /** 审计单条 listing，返回 { listingId, findings, overall, rulePack } */
  var audit = function (listing, rulePack) {
    validatePack(rulePack, rulePack && rulePack.name ? rulePack.name : 'rulepack');
    var engine = new RuleEngine(rulePack);
    var findings = engine.scan(listing);
    findings = findings.concat(checkDisclosure(listing));

    var overall = 'GREEN';
    for (var i = 0; i < findings.length; i++) {
      overall = severityMax(overall, findings[i].severity);
    }
    return {
      listingId: listing.id || '',
      overall: overall,
      findings: findings,
      rulePack: {
        name: rulePack.name, platform: rulePack.platform, market: rulePack.market,
        version: rulePack.version, updated: rulePack.updated
      }
    };
  };

  /* ---------- 原文定位（UI 高亮专用，Java 版无此需求） ---------- */

  /**
   * 定位必须复用判定语义，不能盲搜。
   * 反面案例：规则 `re:\bcure\b` 只命中独立单词 cure，若用 indexOf('cure') 回标，
   * 会把 "Secure" 里的 cure 也标红——在没有违规的地方画红框，直接摧毁报告可信度。
   *
   * 因此按 matchAll 的三个判定分支分别取位置：
   * 1. 正则命中：重跑该正则，取 exec 的 m.index（天然遵守词边界，只标真正判违规的那处）
   * 2. 字面量在 fold 空间命中：所有出现处都是真违规，全部标注
   * 3. 字面量在 condense 空间命中（混淆变体）：沿 condensed → 原文下标映射标注
   *
   * @param {string} originalText 原始文案
   * @param {string} hit Finding.matchedText
   * @param {object} [rule] 命中的规则对象；缺省时退化为纯字面量定位（不建议）
   * @returns {Array<{start:number,end:number}>} 原文下标区间，可能多处
   */
  var locate = function (originalText, hit, rule) {
    if (!originalText || !hit) { return []; }
    var folded = foldWithMap(originalText);
    var ranges = [];
    var pos;
    var from;

    /* 分支 1：正则命中 —— 用 exec 的真实下标，词边界准确 */
    if (rule && rule.patterns) {
      for (var i = 0; i < rule.patterns.length; i++) {
        var p = String(rule.patterns[i]);
        if (p.indexOf(REGEX_PREFIX) !== 0) { continue; }
        var re;
        try {
          re = new RegExp(toJavaAsciiWhitespace(p.substring(REGEX_PREFIX.length)), 'ig');
        } catch (e) { continue; }
        var m;
        while ((m = re.exec(folded.out)) !== null) {
          if (m[0] === hit) {
            var last = m.index + m[0].length - 1;
            if (folded.map[last] !== undefined) {
              ranges.push({ start: folded.map[m.index], end: folded.map[last] + 1 });
            }
          }
          if (m[0] === '') { re.lastIndex++; }
        }
      }
      if (ranges.length > 0) { return dedupeRanges(ranges); }
    }

    /* 分支 2：字面量在 fold 空间命中 */
    from = 0;
    while ((pos = folded.out.indexOf(hit, from)) !== -1) {
      var endIdx = pos + hit.length - 1;
      if (folded.map[endIdx] !== undefined) {
        ranges.push({ start: folded.map[pos], end: folded.map[endIdx] + 1 });
      }
      from = pos + Math.max(1, hit.length);
    }
    if (ranges.length > 0) { return dedupeRanges(ranges); }

    /* 分支 3：字面量在 condense 空间命中（f-r-e-e / 全 场 最 低 价 类混淆）。
       condenseWithMap 的下标表直接指向原文，无需二次映射。 */
    var condensed = condenseWithMap(folded);
    var target = condense(hit);
    if (target !== '') {
      from = 0;
      while ((pos = condensed.out.indexOf(target, from)) !== -1) {
        var cEnd = pos + target.length - 1;
        if (condensed.map[cEnd] !== undefined) {
          ranges.push({ start: condensed.map[pos], end: condensed.map[cEnd] + 1 });
        }
        from = pos + Math.max(1, target.length);
      }
    }
    return dedupeRanges(ranges);
  };

  /** 按起点排序并合并完全相同/被包含的区间，避免同一处被多条 pattern 重复标注 */
  var dedupeRanges = function (ranges) {
    var sorted = ranges.slice().sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    var out = [];
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      var prev = out[out.length - 1];
      if (prev && r.start >= prev.start && r.end <= prev.end) { continue; } /* 被包含，丢弃 */
      out.push(r);
    }
    return out;
  };

  /** 便捷入口：按 ruleId 在规则包内解析规则后定位，供 UI 直接传 Finding 使用 */
  var locateFinding = function (originalText, finding, rulePack) {
    if (!finding) { return []; }
    var rule = null;
    if (rulePack && rulePack.rules) {
      for (var i = 0; i < rulePack.rules.length; i++) {
        if (rulePack.rules[i].id === finding.ruleId) { rule = rulePack.rules[i]; break; }
      }
    }
    return locate(originalText, finding.matchedText, rule);
  };

  return {
    fold: fold,
    foldWithMap: foldWithMap,
    condense: condense,
    condenseWithMap: condenseWithMap,
    toJavaAsciiWhitespace: toJavaAsciiWhitespace,
    validatePack: validatePack,
    RuleEngine: RuleEngine,
    matchAll: matchAll,
    compileRule: compileRule,
    checkDisclosure: checkDisclosure,
    countSignals: countSignals,
    severityMax: severityMax,
    audit: audit,
    locate: locate,
    locateFinding: locateFinding,
    dedupeRanges: dedupeRanges,
    SEVERITY: SEVERITY,
    CATEGORIES: CATEGORIES,
    AI_SIGNALS: AI_SIGNALS
  };
});
