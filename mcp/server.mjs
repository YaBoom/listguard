#!/usr/bin/env node
/**
 * SECTION: mcp-server
 * ListGuard MCP Server —— 让 AI agent 直接调用 listing 合规审计能力。
 *
 * 设计取舍：
 * - 零 npm 依赖：MCP 的传输层就是 stdio 上的 JSON-RPC 2.0，手写 3 个方法即可，
 *   不引入 SDK 是为了保持仓库「依赖只有 4 个」的现状，也让 npx 一键启动无需安装步骤。
 * - 复用 web/assets/engine.js 与 rulepacks.js：不再写第三份引擎实现。
 *   这两份文件已被 web/tests/engine-parity.test.mjs 证明与 Java CLI 逐条一致，
 *   MCP 侧因此自动继承同一套判定语义，不会出现「agent 调出来的结果和 CI 不一样」。
 *
 * 运行：node mcp/server.mjs
 * 配置（Claude Desktop / Cline / Cursor 等）：
 *   { "mcpServers": { "listguard": { "command": "node", "args": ["<repo>/mcp/server.mjs"] } } }
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const Engine = require(join(ROOT, 'web', 'assets', 'engine.js'));
const Packs = require(join(ROOT, 'web', 'assets', 'rulepacks.js'));

const SERVER_NAME = 'listguard';
const SERVER_VERSION = readServerVersion();
const PROTOCOL_VERSION = '2025-06-18';

function readServerVersion() {
  try {
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    return JSON.parse(pkg).version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

/* ================= 工具定义 ================= */

const PLATFORM_ENUM = Packs.packs.map(p => p.platform);
const PLATFORM_DESC = Packs.packs
  .map(p => `${p.platform} (${p.name}, market=${p.market}, ${p.rules.length} rules)`)
  .join(', ');

const DISCLOSURE_DESC =
  'AI content disclosure status (Amazon 2026-08 rule). ' +
  'One of: "human" (fully human written), "assisted" (partially AI assisted), ' +
  '"ai_generated" (fully AI generated), or empty/null when not yet declared. ' +
  'Declare it honestly: claiming "human" while the copy shows dense AI traces is a RED finding.';

const TOOLS = [
  {
    name: 'audit_listing',
    description:
      'Audit a cross-border e-commerce product listing for compliance violations BEFORE it gets ' +
      'flagged or removed by the platform. Detects banned words, promo words, absolute claims ' +
      '(cure/heals/100%), unsupported certification claims (FDA/CE/organic), trademark risks, and ' +
      'missing AI content disclosure. Uses deterministic versioned rule packs — not an LLM — so every ' +
      'finding carries a rule id and rationale and is fully reproducible. Matching is three-level ' +
      '(fullwidth fold / obfuscation condense / regex with word boundaries), so "F-R-E-E shipping", ' +
      '"ＦＲＥＥ", and "全 场 最 低 价" are still caught while "secure" is not falsely flagged as "cure".',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: PLATFORM_ENUM,
          description: `Target platform rule pack. Available: ${PLATFORM_DESC}`
        },
        title: { type: 'string', description: 'Product title' },
        bullets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Bullet points (Amazon five-point description)'
        },
        description: { type: 'string', description: 'Product description / detail copy' },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Search keywords (backend search terms)'
        },
        aiDisclosure: { type: ['string', 'null'], description: DISCLOSURE_DESC },
        failOn: {
          type: 'string',
          enum: ['red', 'yellow', 'never'],
          description:
            'CI gate threshold. The listing breaches the gate when overall severity reaches this level. ' +
            'Defaults to "red".'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'list_rule_packs',
    description:
      'List the available compliance rule packs with their platform, market, version, update date ' +
      'and rule count. Use this to discover which platforms are supported before calling audit_listing.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'search_rules',
    description:
      'Search inside a rule pack by keyword. Returns matching rules with id, severity, category, ' +
      'patterns, rationale and fix suggestion. Useful to answer "why was this flagged?" or ' +
      '"what words are banned for supplements on Temu?".',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: PLATFORM_ENUM,
          description: `Rule pack to search. Available: ${PLATFORM_DESC}`
        },
        query: {
          type: 'string',
          description: 'Keyword to match against rule id, patterns, message and suggestion. Empty returns all rules.'
        },
        severity: {
          type: 'string',
          enum: ['RED', 'YELLOW', 'ALL'],
          description: 'Filter by severity. Defaults to ALL.'
        }
      },
      required: ['platform']
    }
  },
  {
    name: 'suggest_rewrite',
    description:
      'Turn audit findings into concrete rewrite guidance. For each finding it returns the offending ' +
      'fragment, why it violates platform policy, and the suggested replacement — grouped by field so ' +
      'the caller can patch the listing copy directly. Deterministic suggestions only (from the rule pack); ' +
      'this tool never invents copy.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: PLATFORM_ENUM, description: 'Target platform rule pack' },
        title: { type: 'string', description: 'Product title' },
        bullets: { type: 'array', items: { type: 'string' }, description: 'Bullet points' },
        description: { type: 'string', description: 'Product description' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'Search keywords' },
        aiDisclosure: { type: ['string', 'null'], description: DISCLOSURE_DESC }
      },
      required: ['platform']
    }
  }
];

/* ================= 工具实现 ================= */

const SEVERITY_ORDER = { RED: 0, YELLOW: 1, GREEN: 2 };

function normalizeListing(args) {
  return {
    id: args.id || 'mcp-listing',
    title: args.title || '',
    bullets: Array.isArray(args.bullets) ? args.bullets.map(String) : [],
    description: args.description || '',
    keywords: Array.isArray(args.keywords) ? args.keywords.map(String) : [],
    aiDisclosure: args.aiDisclosure === undefined ? null : args.aiDisclosure
  };
}

function requirePack(platform) {
  const pack = Packs.get(platform);
  if (!pack) {
    throw new Error(
      `Unknown platform "${platform}". Available: ${PLATFORM_ENUM.join(', ')}. ` +
      `Call list_rule_packs to see supported rule packs.`
    );
  }
  return pack;
}

/** 与 CheckCommand.breaches 一致：overall 达到或超过阈值即 breach */
function breaches(overall, failOn) {
  if (!failOn || String(failOn).toLowerCase() === 'never') return false;
  const th = String(failOn).toUpperCase();
  if (SEVERITY_ORDER[th] === undefined) {
    throw new Error(`Unknown failOn "${failOn}". Use red / yellow / never.`);
  }
  return SEVERITY_ORDER[overall] <= SEVERITY_ORDER[th];
}

const CATEGORY_LABEL = {
  banned_word: 'banned word',
  promo_word: 'promo word',
  absolute_claim: 'absolute claim',
  certification_claim: 'certification claim',
  trademark_risk: 'trademark risk',
  ai_disclosure: 'AI disclosure'
};

function toolAuditListing(args) {
  const pack = requirePack(args.platform);
  const failOn = args.failOn || 'red';
  const listing = normalizeListing(args);

  const hasText =
    listing.title.trim() ||
    listing.bullets.some(b => b.trim()) ||
    listing.description.trim() ||
    listing.keywords.length > 0;
  if (!hasText) {
    throw new Error('Nothing to audit: provide at least one of title, bullets, description or keywords.');
  }

  const result = Engine.audit(listing, pack);
  const nRed = result.findings.filter(f => f.severity === 'RED').length;
  const nYel = result.findings.filter(f => f.severity === 'YELLOW').length;
  const gateBreached = breaches(result.overall, failOn);

  const lines = [];
  lines.push(`ListGuard audit · rule pack ${result.rulePack.name} v${result.rulePack.version} ` +
    `(market=${result.rulePack.market}, updated ${result.rulePack.updated})`);
  lines.push(`Overall: ${result.overall} · findings: ${result.findings.length} (RED ${nRed}, YELLOW ${nYel})`);
  lines.push(`CI gate (--fail-on ${failOn}): ${gateBreached ? 'BREACH (exit code 1)' : 'pass (exit code 0)'}`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('No violations found within this rule pack. Note: the rule pack does not cover every ' +
      'possible violation — high-risk categories (supplements, baby products, cosmetics) still need human review.');
  } else {
    result.findings.forEach((f, i) => {
      lines.push(`[${i + 1}] ${f.severity} · ${f.ruleId} (${CATEGORY_LABEL[f.category] || f.category}) @ ${f.field}`);
      lines.push(`    matched: ${f.matchedText}`);
      lines.push(`    why:     ${f.message}`);
      lines.push(`    fix:     ${f.suggestion}`);
    });
  }

  /* 结构化数据放在 text 末尾的 JSON 块里：agent 既能读人类可读摘要，也能精确解析 */
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    overall: result.overall,
    gateBreached,
    exitCode: gateBreached ? 1 : 0,
    rulePack: result.rulePack,
    counts: { total: result.findings.length, red: nRed, yellow: nYel },
    findings: result.findings
  }, null, 2));
  lines.push('```');

  return { content: [{ type: 'text', text: lines.join('\n') }], isError: false };
}

function toolListRulePacks() {
  const lines = [`ListGuard ships ${Packs.packs.length} versioned rule packs:`];
  Packs.packs.forEach(p => {
    const bySev = p.rules.reduce((acc, r) => {
      const s = String(r.severity).toUpperCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const byCat = {};
    p.rules.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + 1; });
    lines.push('');
    lines.push(`- platform: ${p.platform}`);
    lines.push(`  pack:     ${p.name} (market=${p.market}, version=${p.version}, updated=${p.updated})`);
    lines.push(`  rules:    ${p.rules.length} total · RED ${bySev.RED || 0} · YELLOW ${bySev.YELLOW || 0}`);
    lines.push(`  categories: ${Object.keys(byCat).map(c => `${c}(${byCat[c]})`).join(', ')}`);
  });
  lines.push('');
  lines.push('Rule packs are plain YAML under src/main/resources/rules/ and are updated monthly ' +
    'as platform policies change. Custom packs can be added via the CLI --rules-dir flag.');

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      packs: Packs.packs.map(p => ({
        platform: p.platform, name: p.name, market: p.market,
        version: p.version, updated: p.updated, ruleCount: p.rules.length
      }))
    },
    isError: false
  };
}

function toolSearchRules(args) {
  const pack = requirePack(args.platform);
  const q = String(args.query || '').trim().toLowerCase();
  const sev = String(args.severity || 'ALL').toUpperCase();

  const rows = pack.rules.filter(r => {
    if (sev !== 'ALL' && String(r.severity).toUpperCase() !== sev) return false;
    if (!q) return true;
    const hay = [r.id, r.category, r.message, r.suggestion, (r.patterns || []).join(' ')]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });

  const lines = [];
  lines.push(`${pack.name}: ${rows.length} / ${pack.rules.length} rules matched` +
    (q ? ` query="${args.query}"` : '') + (sev !== 'ALL' ? ` severity=${sev}` : ''));
  if (rows.length === 0) {
    lines.push('No rule matched. Try a broader query or severity=ALL.');
  } else {
    rows.forEach(r => {
      lines.push('');
      lines.push(`- ${String(r.severity).toUpperCase()} · ${r.id} (${CATEGORY_LABEL[r.category] || r.category})`);
      lines.push(`  patterns: ${(r.patterns || []).length ? r.patterns.join(' | ') : '(handled by a dedicated checker)'}`);
      lines.push(`  why:   ${r.message}`);
      lines.push(`  fix:   ${r.suggestion}`);
    });
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      pack: pack.name,
      matched: rows.length,
      total: pack.rules.length,
      rules: rows.map(r => ({
        id: r.id, severity: r.severity, category: r.category,
        patterns: r.patterns || [], message: r.message, suggestion: r.suggestion
      }))
    },
    isError: false
  };
}

function toolSuggestRewrite(args) {
  const pack = requirePack(args.platform);
  const listing = normalizeListing(args);
  const result = Engine.audit(listing, pack);

  if (result.findings.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No rewrite needed: the listing passes ${pack.name} with no findings. ` +
          `Overall ${result.overall}.`
      }],
      structuredContent: { overall: result.overall, groups: [] },
      isError: false
    };
  }

  /* 按字段分组：调用方可以直接对着字段打补丁 */
  const groups = new Map();
  result.findings.forEach(f => {
    if (!groups.has(f.field)) groups.set(f.field, []);
    groups.get(f.field).push(f);
  });

  const lines = [];
  lines.push(`Rewrite guidance for ${pack.name} · overall ${result.overall} · ` +
    `${result.findings.length} finding(s) across ${groups.size} field(s)`);
  lines.push('');
  lines.push('Suggestions come from the versioned rule pack, not from an LLM: they are deterministic ' +
    'and reproducible. Rewrite the copy, then re-run audit_listing to verify.');

  let n = 0;
  for (const [field, items] of groups) {
    lines.push('');
    lines.push(`## ${field}`);
    const original = fieldText(listing, field);
    if (original) lines.push(`   current: ${original}`);
    items.forEach(f => {
      n++;
      /* 规则 ID 必须出现在文本里：agent 常直接引用它说明「因为哪条规则」，
         只放在 structuredContent 会让纯文本消费方丢失判定依据 */
      lines.push(`   ${n}. [${f.severity}] ${f.ruleId} — remove or replace "${f.matchedText}"`);
      lines.push(`      why: ${f.message}`);
      lines.push(`      fix: ${f.suggestion}`);
    });
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      overall: result.overall,
      groups: [...groups.entries()].map(([field, items]) => ({
        field,
        current: fieldText(listing, field),
        fixes: items.map(f => ({
          ruleId: f.ruleId, severity: f.severity, category: f.category,
          matchedText: f.matchedText, message: f.message, suggestion: f.suggestion
        }))
      }))
    },
    isError: false
  };
}

function fieldText(listing, field) {
  if (field === 'title') return listing.title || '';
  if (field === 'description') return listing.description || '';
  if (field === 'aiDisclosure' || field === 'text') return '';
  const bm = field.match(/^bullets\[(\d+)\]$/);
  if (bm) return listing.bullets[Number(bm[1])] || '';
  const km = field.match(/^keywords\[(\d+)\]$/);
  if (km) return listing.keywords[Number(km[1])] || '';
  return '';
}

/* ================= JSON-RPC over stdio ================= */

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message, data) {
  const err = { jsonrpc: '2.0', id, error: { code, message } };
  if (data !== undefined) err.error.data = data;
  send(err);
}

/* MCP 规定工具执行错误用 isError:true 的正常 result 返回，而不是 JSON-RPC error，
   这样 agent 能读到错误文本并自行纠正参数。 */
function toolResultError(id, name, message) {
  reply(id, {
    content: [{ type: 'text', text: `listguard:${name} failed — ${message}` }],
    isError: true
  });
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });

    case 'notifications/initialized':
    case 'initialized':
      return undefined; /* 通知无需响应 */

    case 'ping':
      return reply(id, {});

    case 'tools/list':
      return reply(id, { tools: TOOLS });

    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      try {
        if (name === 'audit_listing') return reply(id, toolAuditListing(args));
        if (name === 'list_rule_packs') return reply(id, toolListRulePacks());
        if (name === 'search_rules') return reply(id, toolSearchRules(args));
        if (name === 'suggest_rewrite') return reply(id, toolSuggestRewrite(args));
        return replyError(id, -32602, `Unknown tool: ${name}`);
      } catch (e) {
        return toolResultError(id, name || 'unknown', e.message || String(e));
      }
    }

    default:
      if (id === undefined) return undefined; /* 未知通知，忽略 */
      return replyError(id, -32601, `Method not found: ${method}`);
  }
}

/* 按行解析 stdio：MCP 的 stdio 传输是 newline-delimited JSON，不得在 stdout 打印日志 */
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      /* 单行解析失败不应中断整个会话：回一个 parse error 后继续 */
      replyError(null, -32700, 'Parse error');
      continue;
    }
    Promise.resolve(handleRequest(msg)).catch(e => {
      if (msg && msg.id !== undefined) replyError(msg.id, -32603, e.message || 'Internal error');
    });
  }
});
process.stdin.on('end', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

/* 日志一律走 stderr，避免污染 stdout 上的 JSON-RPC 流 */
process.stderr.write(`listguard MCP server v${SERVER_VERSION} ready · ${Packs.packs.length} rule packs · ${TOOLS.length} tools\n`);
