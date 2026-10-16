/* SECTION: app
 * 在线检测台交互层。引擎与规则数据分别来自 engine.js / rulepacks.js。
 * 约束：所有用户输入经 escapeHtml 后再进 DOM，不做任何 innerHTML 直插原文。
 */
(function () {
  'use strict';

  /* ================= 站点配置 ================= */

  /**
   * GitHub 仓库根地址，取自入口页顶部的站点配置。
   * 保持占位符或留空时，页面内所有仓库相关链接降级为不可点状态，
   * 不会指向任何猜测出来的 URL。
   */
  var SITE_CONFIG = (typeof window !== 'undefined' && window.LISTGUARD_CONFIG) ? window.LISTGUARD_CONFIG : {};
  var raw = String(SITE_CONFIG.repoUrl || '').trim();
  var REPO_URL = (!raw || raw.indexOf('__REPO_URL__') !== -1) ? '' : raw;

  var PACKS = (typeof ListguardRulePacks !== 'undefined') ? ListguardRulePacks : null;
  var ENGINE = (typeof ListguardEngine !== 'undefined') ? ListguardEngine : null;

  if (!PACKS || !ENGINE) {
    document.addEventListener('DOMContentLoaded', function () {
      var r = document.getElementById('report-root');
      if (r) {
        r.innerHTML = '<div class="report-empty"><p style="color:var(--red)">检测引擎未能加载</p>' +
          '<div class="sub">页面依赖的规则引擎脚本不可访问，请刷新重试；若仍失败，说明本页部署不完整，' +
          '请改用仓库内的命令行版本。</div></div>';
      }
    });
    return;
  }

  /* ================= 示例数据（取自仓库 examples/） ================= */

  var SAMPLES = {
    red: {
      label: '违规样例',
      listing: {
        id: 'RED-SAMPLE-001', platform: 'amazon',
        title: 'Best Seller Wireless Earbuds F-R-E-E Shipping',
        bullets: ['100% natural cure for joint pain', '#1 best seller guaranteed results'],
        description: 'Cheapest price in the world, wholesale welcome.',
        keywords: ['earbuds', 'cheap', 'free shipping']
      }
    },
    yellow: {
      label: '待披露样例',
      listing: {
        id: 'YELLOW-SAMPLE-001', platform: 'amazon',
        title: 'Wireless Earbuds with Noise Cancelling',
        bullets: ['Up to 30 hours of playtime with the charging case'],
        description: 'In-ear earbuds with clear calls and comfortable fit.',
        keywords: ['earbuds', 'noise cancelling']
      }
    },
    clean: {
      label: '合规样例',
      listing: {
        id: 'CLEAN-SAMPLE-001', platform: 'amazon',
        title: 'Wireless Earbuds with Noise Cancelling',
        bullets: ['Up to 30 hours of playtime with the charging case',
          'Bluetooth 5.3 connection for stable pairing'],
        description: 'In-ear earbuds with clear calls and comfortable fit.',
        keywords: ['earbuds', 'noise cancelling'],
        aiDisclosure: 'human'
      }
    },
    obfuscate: {
      label: '混淆规避样例',
      listing: {
        id: 'OBFUSCATE-001', platform: 'temu',
        title: '全 场 最 低 价 秒杀款 假一赔十',
        bullets: ['包 治 百 病 的 神 器', 'f-r-e-e gift 随单赠送'],
        description: '医用级材料，无副作用，disney 联名款。',
        keywords: ['拼多多', '清仓'],
        aiDisclosure: 'human'
      }
    }
  };

  var PLATFORMS = PACKS.packs.map(function (p) {
    return { key: p.platform, pack: p, label: platformLabel(p.platform), meta: p.market };
  });

  function platformLabel(k) {
    return k === 'amazon' ? 'Amazon' : k === 'temu' ? 'Temu' : k === 'tiktok' ? 'TikTok Shop' : k;
  }

  var CATEGORY_LABEL = {
    banned_word: '违禁词',
    promo_word: '促销词',
    absolute_claim: '绝对化声明',
    certification_claim: '认证声明',
    trademark_risk: '商标风险',
    ai_disclosure: 'AI 披露'
  };

  /* ================= 工具函数 ================= */

  function $(sel) { return document.querySelector(sel); }
  function el(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(msg, ok) {
    var t = el('toast');
    t.textContent = msg;
    t.className = 'toast show' + (ok ? ' ok' : '');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2200);
  }

  /* ================= 应用状态 ================= */

  var state = {
    platform: 'amazon',
    bullets: [''],
    keywords: [],
    result: null
  };

  /* ================= 仓库链接 ================= */

  function wireRepoLinks() {
    var ids = {
      'repo-link': '', 'repo-link-2': '', 'foot-repo': '',
      'foot-license': '/blob/main/LICENSE',
      'foot-issue': '/issues/new',
      'foot-roadmap': '/blob/main/README.md#路线图',
      'link-action': '/blob/main/action.yml',
      'link-sarif': '/blob/main/src/main/java/com/zhuyt/listguard/report/SarifReporter.java',
      'link-rules': '/blob/main/src/main/resources/rules/'
    };
    Object.keys(ids).forEach(function (id) {
      var node = el(id);
      if (!node) { return; }
      if (!REPO_URL) {
        /* 未配置仓库地址：不编造 URL，降级为不可点并提示 */
        node.removeAttribute('href');
        node.setAttribute('aria-disabled', 'true');
        node.title = '本页尚未配置公开仓库地址';
        node.style.opacity = '0.45';
        node.style.cursor = 'help';
        node.addEventListener('click', function (e) {
          e.preventDefault();
          toast('仓库地址未配置：在入口页顶部站点配置中填入公开仓库地址');
        });
        return;
      }
      node.setAttribute('href', REPO_URL.replace(/\/$/, '') + ids[id]);
      node.style.opacity = '';
      node.style.cursor = '';
      node.removeAttribute('aria-disabled');
    });
  }

  /* ================= 平台选择 ================= */

  function renderPlatformSeg() {
    var host = el('platform-seg');
    host.innerHTML = PLATFORMS.map(function (p) {
      var checked = p.key === state.platform ? ' checked' : '';
      return '<label class="seg">' +
        '<input type="radio" name="platform" value="' + escapeHtml(p.key) + '"' + checked + '>' +
        '<span><span class="p-name">' + escapeHtml(p.label) + '</span>' +
        '<span class="p-meta">' + escapeHtml(p.pack.name) + ' · ' + escapeHtml(p.meta) + '</span></span>' +
        '</label>';
    }).join('');

    host.querySelectorAll('input[name=platform]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.platform = r.value;
        state.result = null;
        updatePackMeta();
        renderEmptyReport('已切换平台，重新运行审计');
        if (el('rules-platform')) { syncRulesPlatform(); }
      });
    });
    updatePackMeta();
  }

  function updatePackMeta() {
    var pack = PACKS.get(state.platform);
    var n = el('pack-meta');
    if (n && pack) {
      n.textContent = pack.name + ' · v' + pack.version + ' · ' + pack.rules.length + ' 条规则';
    }
  }

  /* ================= 五点描述 ================= */

  function renderBullets() {
    var host = el('bullets-wrap');
    host.innerHTML = state.bullets.map(function (v, i) {
      return '<div class="bullet-row">' +
        '<span class="bullet-idx">' + (i + 1) + '</span>' +
        '<textarea rows="2" data-bullet="' + i + '" placeholder="第 ' + (i + 1) + ' 点卖点……">' + escapeHtml(v) + '</textarea>' +
        '<button type="button" class="icon-btn" data-del-bullet="' + i + '" aria-label="删除第 ' + (i + 1) + ' 点"' +
        (state.bullets.length <= 1 ? ' disabled' : '') + '>' +
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>' +
        '</button></div>';
    }).join('');

    host.querySelectorAll('textarea[data-bullet]').forEach(function (t) {
      t.addEventListener('input', function () {
        state.bullets[Number(t.dataset.bullet)] = t.value;
      });
    });
    host.querySelectorAll('button[data-del-bullet]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.dataset.delBullet);
        if (state.bullets.length <= 1) { return; }
        state.bullets.splice(i, 1);
        renderBullets();
      });
    });
  }

  /* ================= 关键词 ================= */

  function renderKeywords() {
    var host = el('kw-pills');
    if (state.keywords.length === 0) {
      host.innerHTML = '<span style="font-size:12.5px;color:var(--muted)">暂无关键词（选填，但平台会扫描这个字段）</span>';
      return;
    }
    host.innerHTML = state.keywords.map(function (k, i) {
      return '<span class="pill">' + escapeHtml(k) +
        '<span class="chip">' + i + '</span>' +
        '<button type="button" data-del-kw="' + i + '" aria-label="删除关键词 ' + escapeHtml(k) + '">&times;</button>' +
        '</span>';
    }).join('');
    host.querySelectorAll('button[data-del-kw]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.keywords.splice(Number(b.dataset.delKw), 1);
        renderKeywords();
      });
    });
  }

  function addKeyword(raw) {
    String(raw || '').split(/[,，]/).map(function (s) { return s.trim(); })
      .filter(Boolean).forEach(function (k) {
        if (state.keywords.indexOf(k) === -1) { state.keywords.push(k); }
      });
    renderKeywords();
  }

  /* ================= 采集输入 ================= */

  function collectListing() {
    return {
      id: 'ONLINE-CHECK',
      title: el('f-title').value,
      bullets: state.bullets.map(function (b) { return b; }),
      description: el('f-desc').value,
      keywords: state.keywords.slice(),
      platform: state.platform,
      aiDisclosure: el('f-disc').value || null
    };
  }

  function fillListing(l) {
    el('f-title').value = l.title || '';
    el('f-desc').value = l.description || '';
    el('f-disc').value = l.aiDisclosure || '';
    state.bullets = (l.bullets && l.bullets.length) ? l.bullets.slice() : [''];
    state.keywords = (l.keywords || []).slice();
    renderBullets();
    renderKeywords();
  }

  function clearAll() {
    el('f-title').value = '';
    el('f-desc').value = '';
    el('f-disc').value = '';
    state.bullets = [''];
    state.keywords = [];
    state.result = null;
    renderBullets();
    renderKeywords();
    renderEmptyReport('已清空，等待输入');
  }

  /* ================= 运行审计 ================= */

  function runAudit() {
    var listing = collectListing();
    var pack = PACKS.get(state.platform);
    if (!pack) { toast('未知平台'); return; }

    var hasText = String(listing.title || '').trim() ||
      listing.bullets.some(function (b) { return String(b || '').trim(); }) ||
      String(listing.description || '').trim() ||
      listing.keywords.length > 0;

    if (!hasText) {
      toast('请先填写文案，或载入一个示例');
      renderEmptyReport('输入为空，无法审计');
      return;
    }

    try {
      state.result = { listing: listing, report: ENGINE.audit(listing, pack) };
    } catch (e) {
      toast('审计失败：' + e.message);
      return;
    }
    renderReport();
    renderHighlight();
    el('report-root').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ================= 渲染报告 ================= */

  var VERDICT_TEXT = {
    RED: '命中红线违规，<strong>该 listing 不应发布</strong>；CI 场景下应阻断流水线。',
    YELLOW: '存在需复核的警告项，<strong>发布前建议逐条确认</strong>。',
    GREEN: '未发现规则库覆盖范围内的风险项，可进入发布流程。'
  };

  function renderEmptyReport(msg) {
    el('report-meta').textContent = '等待输入';
    el('report-root').innerHTML =
      '<div class="report-empty">' +
      '<svg width="44" height="44" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>' +
      '<p>' + escapeHtml(msg || '还没有审计结果') + '</p>' +
      '<div class="sub">填写左侧文案后点「运行合规审计」，或先载入一个示例试试。</div>' +
      '</div>';
  }

  function renderReport() {
    if (!state.result) { return; }
    var rep = state.result.report;
    var f = rep.findings;
    var nRed = f.filter(function (x) { return x.severity === 'RED'; }).length;
    var nYel = f.filter(function (x) { return x.severity === 'YELLOW'; }).length;

    el('report-meta').textContent = rep.overall + ' · ' + f.length + ' findings';

    var html = '';
    /* 结论条 */
    html += '<div class="verdict">' +
      '<span class="badge ' + rep.overall + '"><span class="badge-dot"></span>' + rep.overall + '</span>' +
      '<span class="verdict-txt">' + VERDICT_TEXT[rep.overall] + '</span>' +
      '<span class="counts">' +
      '<span class="count r"><span class="cdot"></span>' + nRed + '</span>' +
      '<span class="count y"><span class="cdot"></span>' + nYel + '</span>' +
      '<span class="count g"><span class="cdot"></span>' + (f.length === 0 ? 1 : 0) + '</span>' +
      '</span></div>';

    /* 元信息 */
    html += '<div class="meta-bar">' +
      '<span>规则包 <b>' + escapeHtml(rep.rulePack.name) + '</b></span>' +
      '<span>版本 <b>' + escapeHtml(rep.rulePack.version) + '</b></span>' +
      '<span>市场 <b>' + escapeHtml(rep.rulePack.market) + '</b></span>' +
      '<span>更新 <b>' + escapeHtml(rep.rulePack.updated) + '</b></span>' +
      '</div>';

    /* 命中明细 */
    if (f.length === 0) {
      html += '<div class="all-clear">' +
        '<svg width="42" height="42" viewBox="0 0 16 16" fill="none" stroke="var(--green)" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M5 8.2l2.1 2.1L11 6.4"/></svg>' +
        '<div class="t">GREEN · 未发现风险项</div>' +
        '<div class="b">在 ' + escapeHtml(rep.rulePack.name) + ' 规则包覆盖范围内没有命中。注意：规则库不覆盖全部违规情形，高风险类目仍建议人工复核。</div>' +
        '</div>';
    } else {
      html += '<div class="findings">' + f.map(function (x, i) {
        return '<article class="finding ' + x.severity + '" data-finding="' + i + '">' +
          '<div class="finding-hd">' +
          '<span class="sev ' + x.severity + '">' + x.severity + '</span>' +
          '<span class="rid">' + escapeHtml(x.ruleId) + '</span>' +
          '<span class="cat">' + escapeHtml(CATEGORY_LABEL[x.category] || x.category) + '</span>' +
          '<span class="fld">' + escapeHtml(x.field) + '</span>' +
          '</div>' +
          '<div class="finding-bd">' +
          '<div class="hit"><span class="hk">命中</span><span class="hv">' + escapeHtml(x.matchedText) + '</span></div>' +
          '<div class="msg">' + escapeHtml(x.message) + '</div>' +
          '<div class="sug">' +
          '<svg class="sug-ico" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9zM6 14h4v1H6z"/></svg>' +
          '<span><b>建议 </b>' + escapeHtml(x.suggestion) + '</span>' +
          '</div></div></article>';
      }).join('') + '</div>';
    }

    /* 操作条 */
    var gateCode = gateExitCode(rep.overall);
    html += '<div class="report-actions">' +
      '<button type="button" class="btn-sm" id="btn-copy-text">' +
      '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V2.5H2.5V11H5"/></svg>复制报告</button>' +
      '<button type="button" class="btn-sm" id="btn-copy-json">复制 JSON</button>' +
      '<span class="gate-line">等效 CLI 退出码 <b class="' + rep.overall + '">' + gateCode + '</b></span>' +
      '</div>';

    el('report-root').innerHTML = html;

    /* 命中卡片悬停 → 联动原文高亮 */
    el('report-root').querySelectorAll('[data-finding]').forEach(function (card) {
      var i = card.dataset.finding;
      card.addEventListener('mouseenter', function () { setActiveFinding(i); });
      card.addEventListener('mouseleave', function () { setActiveFinding(null); });
    });
    el('btn-copy-text').addEventListener('click', function () { copyTextReport(this); });
    el('btn-copy-json').addEventListener('click', function () { copyJsonReport(this); });
  }

  /** 与 CheckCommand.breaches 一致：默认阈值 red，overall 达到或超过即 exit 1 */
  function gateExitCode(overall) {
    return ENGINE.SEVERITY[overall] <= ENGINE.SEVERITY.RED ? 1 : 0;
  }

  function textReport() {
    var rep = state.result.report;
    var lines = [];
    lines.push('ListGuard 审计报告');
    lines.push('规则包: ' + rep.rulePack.name + ' v' + rep.rulePack.version +
      ' (' + rep.rulePack.market + ', updated ' + rep.rulePack.updated + ')');
    lines.push('整体分级: ' + rep.overall);
    lines.push('命中数量: ' + rep.findings.length);
    lines.push('等效 CLI 退出码: ' + gateExitCode(rep.overall));
    lines.push('');
    if (rep.findings.length === 0) {
      lines.push('未发现规则库覆盖范围内的风险项。');
    } else {
      rep.findings.forEach(function (f, i) {
        lines.push('[' + (i + 1) + '] ' + f.severity + ' · ' + f.ruleId +
          ' (' + (CATEGORY_LABEL[f.category] || f.category) + ') @ ' + f.field);
        lines.push('    命中: ' + f.matchedText);
        lines.push('    原因: ' + f.message);
        lines.push('    建议: ' + f.suggestion);
        lines.push('');
      });
    }
    lines.push('说明: 本工具为辅助检测，不构成平台官方判定。');
    return lines.join('\n');
  }

  function copyWith(btn, text, label) {
    var done = function () {
      btn.classList.add('done');
      var old = btn.textContent;
      btn.textContent = '✓ 已复制';
      toast(label + '已复制到剪贴板', true);
      setTimeout(function () { btn.classList.remove('done'); btn.textContent = old; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  }

  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { toast('复制失败，请手动选择文本'); }
    document.body.removeChild(ta);
  }

  function copyTextReport(btn) { copyWith(btn, textReport(), '报告'); }
  function copyJsonReport(btn) { copyWith(btn, JSON.stringify(state.result.report, null, 2), 'JSON'); }

  /* ================= 原文高亮 ================= */

  /**
   * 把每条 Finding 的命中片段映射回原始文案，做字符级标注后渲染。
   * 用字符级数组而不是逐条 range 拼接：命中区间可能互相重叠，
   * 字符级标注能自然处理「RED 优先于 YELLOW」与「一个字符属于多条规则」。
   */
  function fieldTexts() {
    var l = state.result.listing;
    var map = {};
    map['title'] = l.title || '';
    (l.bullets || []).forEach(function (b, i) { map['bullets[' + i + ']'] = b || ''; });
    map['description'] = l.description || '';
    (l.keywords || []).forEach(function (k, i) { map['keywords[' + i + ']'] = k || ''; });
    return map;
  }

  function renderHighlight() {
    if (!state.result) { return; }
    var findings = state.result.report.findings;
    var texts = fieldTexts();
    var pack = PACKS.get(state.platform); /* 定位需要规则原文，用完整规则包而非报告摘要 */

    /* 按字段建字符标注表 */
    var marks = {}; /* field -> [{sev, idx}] */
    findings.forEach(function (f, i) {
      if (f.category === 'ai_disclosure') { return; } /* 披露项不对应原文片段 */
      var text = texts[f.field];
      if (!text) { return; }
      var ranges = ENGINE.locateFinding(text, f, pack);
      if (!marks[f.field]) { marks[f.field] = new Array(text.length).fill(null); }
      ranges.forEach(function (r) {
        for (var p = r.start; p < r.end && p < text.length; p++) {
          var cur = marks[f.field][p];
          if (!cur) { marks[f.field][p] = { sev: f.severity, idx: [i] }; }
          else {
            if (ENGINE.SEVERITY[f.severity] < ENGINE.SEVERITY[cur.sev]) { cur.sev = f.severity; }
            if (cur.idx.indexOf(i) === -1) { cur.idx.push(i); }
          }
        }
      });
    });

    var fields = Object.keys(marks);
    if (fields.length === 0) { return; }

    var body = fields.map(function (field) {
      var text = texts[field];
      var arr = marks[field];
      var out = '';
      var run = null; /* {sev, idx, buf} */
      var flush = function () {
        if (!run) { return; }
        if (run.buf === '') { run = null; return; }
        out += '<mark class="hl' + (run.sev === 'YELLOW' ? ' y' : '') + '" data-f="' + run.idx.join(',') + '">' +
          escapeHtml(run.buf) + '</mark>';
        run = null;
      };
      for (var i = 0; i < text.length; i++) {
        var m = arr[i];
        if (m) {
          if (run && run.sev === m.sev && run.idx.join() === m.idx.join()) { run.buf += text[i]; }
          else { flush(); run = { sev: m.sev, idx: m.idx.slice(), buf: text[i] }; }
        } else { flush(); out += escapeHtml(text[i]); }
      }
      flush();
      return '<div class="hl-field">' +
        '<div class="hl-fname">' + escapeHtml(field) + '</div>' +
        '<div class="hl-text">' + out + '</div>' +
        '</div>';
    }).join('');

    var total = fields.reduce(function (n, f) {
      return n + marks[f].filter(Boolean).length;
    }, 0);

    var panel = document.createElement('div');
    panel.className = 'hl-panel';
    panel.id = 'hl-panel';
    panel.innerHTML = '<div class="hl-hd">' +
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" stroke-width="1.6" aria-hidden="true"><path d="M2 13l3-1 7-7-2-2-7 7-1 3z"/></svg>' +
      '<h4>原文定位</h4>' +
      '<span class="sp">' + fields.length + ' 个字段 · ' + total + ' 个字符被标注</span>' +
      '</div><div class="hl-body">' + body + '</div>';

    var old = el('hl-panel');
    if (old) { old.remove(); }
    el('report-root').appendChild(panel);
  }

  function setActiveFinding(i) {
    var panel = el('hl-panel');
    if (!panel) { return; }
    panel.querySelectorAll('mark.hl').forEach(function (m) {
      if (i === null) { m.classList.remove('active'); return; }
      var ids = (m.dataset.f || '').split(',');
      if (ids.indexOf(String(i)) !== -1) { m.classList.add('active'); }
      else { m.classList.remove('active'); }
    });
  }

  /* ================= 示例按钮 ================= */

  function renderSampleButtons() {
    var host = el('sample-btns');
    host.innerHTML = Object.keys(SAMPLES).map(function (k) {
      return '<button type="button" class="btn-mini" data-sample="' + k + '">' +
        escapeHtml(SAMPLES[k].label) + '</button>';
    }).join('');
    host.querySelectorAll('button[data-sample]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = SAMPLES[b.dataset.sample];
        state.platform = s.listing.platform || state.platform;
        renderPlatformSeg();
        fillListing(s.listing);
        runAudit();
        toast('已载入「' + s.label + '」', true);
      });
    });
  }

  /* ================= 规则库表格 ================= */

  var rulesFilter = { platform: null, q: '', sev: 'ALL' };

  function renderRulesPlatformButtons() {
    var host = el('rules-platform');
    var all = PLATFORMS.map(function (p) {
      return { key: p.key, label: p.label, n: p.pack.rules.length };
    });
    host.innerHTML = all.map(function (p) {
      var on = p.key === rulesFilter.platform ? 'true' : 'false';
      return '<button type="button" data-plat="' + p.key + '" aria-pressed="' + on + '">' +
        escapeHtml(p.label) + ' (' + p.n + ')</button>';
    }).join('');
    host.querySelectorAll('button[data-plat]').forEach(function (b) {
      b.addEventListener('click', function () {
        rulesFilter.platform = b.dataset.plat;
        syncRulesPlatform();
        renderRulesTable();
      });
    });
  }

  function syncRulesPlatform() {
    rulesFilter.platform = state.platform;
    var host = el('rules-platform');
    if (!host) { return; }
    host.querySelectorAll('button[data-plat]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.plat === rulesFilter.platform ? 'true' : 'false');
    });
  }

  function renderRulesTable() {
    var pack = PACKS.get(rulesFilter.platform || state.platform);
    var tbody = el('rules-tbody');
    if (!pack || !tbody) { return; }
    var q = rulesFilter.q.trim().toLowerCase();
    var rows = pack.rules.filter(function (r) {
      if (rulesFilter.sev === 'RED' && String(r.severity).toUpperCase() !== 'RED') { return false; }
      if (!q) { return true; }
      var hay = (r.id + ' ' + r.category + ' ' + r.message + ' ' + r.suggestion + ' ' +
        (r.patterns || []).join(' ')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    el('rules-count').textContent = pack.name + ' · ' + rows.length + ' / ' + pack.rules.length + ' 条';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">没有匹配的规则</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      var sev = String(r.severity).toUpperCase();
      var pats = (r.patterns || []).map(function (p) {
        return '<span class="p">' + escapeHtml(p) + '</span>';
      }).join('') || '<span class="p" style="color:var(--muted)">（由专用检查器执行）</span>';
      return '<tr>' +
        '<td class="rid-cell">' + escapeHtml(r.id) + '</td>' +
        '<td><span class="sev-dot ' + sev + '">' + sev + '</span></td>' +
        '<td>' + escapeHtml(CATEGORY_LABEL[r.category] || r.category) + '</td>' +
        '<td class="pat-cell">' + pats + '</td>' +
        '<td>' + escapeHtml(r.message) + '<br><span style="color:var(--green);font-size:12px">建议：' +
        escapeHtml(r.suggestion) + '</span></td>' +
        '</tr>';
    }).join('');
  }

  /* ================= 初始化 ================= */

  function init() {
    wireRepoLinks();
    renderPlatformSeg();
    renderBullets();
    renderKeywords();
    renderSampleButtons();

    /* 统计数字与页脚版本按真实规则包计算，不写死 */
    var total = PACKS.packs.reduce(function (n, p) { return n + p.rules.length; }, 0);
    el('stat-rules').textContent = String(total);
    el('stat-packs').textContent = String(PACKS.packs.length);
    var amz = PACKS.get('amazon');
    if (amz) {
      el('foot-version').textContent = 'listguard v' + amz.version + ' · 规则包 ' + PACKS.packs.length + ' 个';
      el('foot-updated').textContent = amz.updated;
    }

    el('add-bullet').addEventListener('click', function () {
      if (state.bullets.length >= 8) { toast('五点描述通常最多 5-8 条'); return; }
      state.bullets.push('');
      renderBullets();
      var tas = el('bullets-wrap').querySelectorAll('textarea');
      if (tas.length) { tas[tas.length - 1].focus(); }
    });

    var kw = el('f-kw');
    kw.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
        e.preventDefault();
        addKeyword(kw.value);
        kw.value = '';
      } else if (e.key === 'Backspace' && kw.value === '' && state.keywords.length) {
        state.keywords.pop();
        renderKeywords();
      }
    });
    kw.addEventListener('blur', function () {
      if (kw.value.trim()) { addKeyword(kw.value); kw.value = ''; }
    });

    el('btn-run').addEventListener('click', runAudit);
    el('btn-clear').addEventListener('click', function () { clearAll(); toast('已清空'); });

    /* Ctrl/Cmd + Enter 快捷运行 */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runAudit(); }
    });

    /* 规则库 */
    rulesFilter.platform = state.platform;
    renderRulesPlatformButtons();
    renderRulesTable();
    var search = el('rules-search');
    var t = null;
    search.addEventListener('input', function () {
      if (t) { clearTimeout(t); }
      t = setTimeout(function () { rulesFilter.q = search.value; renderRulesTable(); }, 140);
    });
    el('rules-sev').querySelectorAll('button[data-sev]').forEach(function (b) {
      b.addEventListener('click', function () {
        rulesFilter.sev = b.dataset.sev;
        el('rules-sev').querySelectorAll('button[data-sev]').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        renderRulesTable();
      });
    });

    renderEmptyReport('还没有审计结果');

    /* 首次进入自动载入违规样例并出报告：让访客 0 操作就看到价值 */
    var s = SAMPLES.red;
    state.platform = s.listing.platform;
    renderPlatformSeg();
    syncRulesPlatform();
    renderRulesTable();
    fillListing(s.listing);
    runAudit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
