/**
 * SECTION: rulesync
 * 规则包同步测试：src/main/resources/rules/*.yaml 是规则的单一事实来源，
 * web/assets/rulepacks.js 是它的浏览器端副本。两份数据必须逐字段一致，
 * 否则会出现「网页版比 CLI 宽松」这类静默漂移。
 *
 * 运行：node web/tests/rulepack-sync.test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const RULES_DIR = join(ROOT, 'src', 'main', 'resources', 'rules');

const Packs = require(join(__dirname, '..', 'assets', 'rulepacks.js'));

/* ---------- 极简 YAML 读取：只解析本项目规则包用到的子集 ----------
 * 不用第三方依赖，保持仓库零额外依赖的现状。
 * 支持的形态：顶层 key: value、rules: 列表、列表项内的 key: value 与
 * patterns: ["a", "b"] 行内数组 / patterns: [] 空数组。
 */
function parseRulePack(text, file) {
  const lines = text.split(/\r?\n/);
  const pack = { rules: [] };
  let inRules = false;   /* 已进入 rules: 列表区域 */
  let cur = null;        /* 当前正在填充的规则对象 */
  let i = 0;

  const stripComment = (s) => {
    /* 行首整行注释与引号外的 # 注释都剥掉；引号内的 # 保留 */
    let out = '';
    let quote = null;
    for (const ch of s) {
      if (quote) {
        out += ch;
        if (ch === quote) { quote = null; }
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; out += ch; continue; }
      if (ch === '#') { break; }
      out += ch;
    }
    return out;
  };

  const unquote = (s) => {
    const v = s.trim();
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
      /* YAML 双引号标量会处理反斜杠转义："re:\\bcure\\b" → re:\bcure\b。
         漏掉这一步会让正则规则在比对时永远不一致。 */
      return v.slice(1, -1).replace(/\\(.)/g, function (m, ch) {
        switch (ch) {
          case 'n': return '\n';
          case 't': return '\t';
          case 'r': return '\r';
          case '"': return '"';
          case '/': return '/';
          case '\\': return '\\';
          default: return ch;
        }
      });
    }
    if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
      /* YAML 单引号标量只有 '' → ' 一种转义，其余字符按字面处理 */
      return v.slice(1, -1).replace(/''/g, "'");
    }
    return v;
  };

  while (i < lines.length) {
    const raw = stripComment(lines[i]);
    if (!raw.trim()) { i++; continue; }

    const listMatch = raw.match(/^\s+-\s+(.*)$/);
    if (listMatch && inRules) {
      const rest = listMatch[1].trim();
      const kv = rest.match(/^([\w-]+)\s*:\s*(.*)$/);
      if (kv) {
        cur = { patterns: [] };
        pack.rules.push(cur);
        applyKv(cur, kv[1], kv[2], unquote);
      }
      i++;
      continue;
    }

    const topMatch = raw.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (topMatch && !inRules) {
      const key = topMatch[1];
      if (key === 'rules') { inRules = true; i++; continue; }
      pack[key] = unquote(topMatch[2]);
      i++;
      continue;
    }

    /* 规则项内部的后续字段 */
    if (cur) {
      const kv = raw.match(/^\s+([\w-]+)\s*:\s*(.*)$/);
      if (kv) { applyKv(cur, kv[1], kv[2], unquote); i++; continue; }
    }
    i++;
  }

  function applyKv(target, key, value, uq) {
    const v = value.trim();
    if (key === 'patterns') {
      if (v === '' ) { target.patterns = []; return; }
      if (v.startsWith('[') && v.endsWith(']')) {
        const inner = v.slice(1, -1).trim();
        if (inner === '') { target.patterns = []; return; }
        target.patterns = splitInlineArray(inner).map(uq);
        return;
      }
      throw new Error(`${file}: patterns 只支持行内数组，实际为 ${JSON.stringify(v)}`);
    }
    target[key] = uq(v);
  }

  return pack;
}

/** 拆分行内数组，尊重引号（'re:\\borganic\\b' 里的逗号不会被误拆） */
function splitInlineArray(inner) {
  const out = [];
  let buf = '';
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      buf += ch;
      if (ch === quote) { quote = null; }
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === ',') { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) { out.push(buf.trim()); }
  return out;
}

/* ---------- 比对 ---------- */
const FIELD_ORDER = ['id', 'category', 'severity', 'message', 'suggestion'];
let pass = 0, fail = 0;
const failures = [];

const yamlFiles = readdirSync(RULES_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).sort();

if (yamlFiles.length === 0) {
  console.error('未找到任何规则包 YAML：' + RULES_DIR);
  process.exit(1);
}

for (const file of yamlFiles) {
  const text = readFileSync(join(RULES_DIR, file), 'utf8');
  let y;
  try { y = parseRulePack(text, file); }
  catch (e) { failures.push(`[${file}] YAML 解析失败: ${e.message}`); fail++; continue; }

  const js = Packs.packs.find(p => p.name === y.name);
  if (!js) { failures.push(`[${file}] 网页端缺少规则包 name=${y.name}`); fail++; continue; }

  const diffs = [];
  for (const k of ['name', 'platform', 'market', 'version', 'updated']) {
    if (String(y[k]) !== String(js[k])) {
      diffs.push(`${k}: yaml=${JSON.stringify(y[k])} js=${JSON.stringify(js[k])}`);
    }
  }
  if (y.rules.length !== js.rules.length) {
    diffs.push(`规则数量: yaml=${y.rules.length} js=${js.rules.length}`);
  }
  const n = Math.max(y.rules.length, js.rules.length);
  for (let r = 0; r < n; r++) {
    const a = y.rules[r], b = js.rules[r];
    if (!a || !b) { diffs.push(`#${r} 规则缺失: yaml=${a && a.id} js=${b && b.id}`); continue; }
    for (const k of FIELD_ORDER) {
      if (String(a[k]) !== String(b[k])) {
        diffs.push(`#${r} ${a.id || b.id} ${k}: yaml=${JSON.stringify(a[k])} js=${JSON.stringify(b[k])}`);
      }
    }
    const ap = a.patterns || [], bp = b.patterns || [];
    if (ap.length !== bp.length) {
      diffs.push(`#${r} ${a.id} patterns 数量: yaml=${ap.length} js=${bp.length}`);
    } else {
      for (let p = 0; p < ap.length; p++) {
        if (String(ap[p]) !== String(bp[p])) {
          diffs.push(`#${r} ${a.id} patterns[${p}]: yaml=${JSON.stringify(ap[p])} js=${JSON.stringify(bp[p])}`);
        }
      }
    }
  }

  if (diffs.length === 0) {
    pass++;
    console.log(`  PASS  ${file} → ${js.name} (${js.rules.length} rules)`);
  } else {
    fail++;
    failures.push(`[${file}]\n      - ` + diffs.join('\n      - '));
    console.log(`  FAIL  ${file}`);
  }
}

/* 反向检查：网页端不应存在 YAML 里没有的规则包 */
const yamlNames = new Set();
for (const file of yamlFiles) {
  const y = parseRulePack(readFileSync(join(RULES_DIR, file), 'utf8'), file);
  if (y.name) { yamlNames.add(y.name); }
}
for (const p of Packs.packs) {
  if (!yamlNames.has(p.name)) {
    fail++;
    failures.push(`[网页端多余规则包] ${p.name} 在 YAML 中不存在`);
  }
}

console.log('\n' + '='.repeat(64));
console.log(`规则包同步: ${pass} passed, ${fail} failed, ${yamlFiles.length} packs`);
if (fail > 0) {
  console.log('\n差异明细:\n' + failures.map(f => '  ' + f).join('\n'));
  process.exit(1);
}
console.log('YAML 与网页端规则副本逐字段一致。');
