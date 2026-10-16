/**
 * SECTION: mcp-test
 * MCP server 协议测试：以子进程方式启动 server.mjs，走真实 stdio JSON-RPC 通道，
 * 覆盖握手、tools/list、四个工具的正常与错误分支。
 * 运行：node mcp/server.test.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, 'server.mjs');

const REQUESTS = [
  { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'parity-test', version: '1' } } },
  { method: 'notifications/initialized' },
  { id: 2, method: 'tools/list' },
  /* 主用例：与 examples/red-sample.json 逐字一致（不含 aiDisclosure 字段）。
     这样 MCP 输出可直接对照 CLI 的 golden 基线：8 findings、overall=RED、闸门 exit 1。 */
  { id: 3, method: 'tools/call', params: { name: 'audit_listing', arguments: {
    platform: 'amazon',
    title: 'Best Seller Wireless Earbuds F-R-E-E Shipping',
    bullets: ['100% natural cure for joint pain', '#1 best seller guaranteed results'],
    description: 'Cheapest price in the world, wholesale welcome.',
    keywords: ['earbuds', 'cheap', 'free shipping'],
    failOn: 'red'
  } } },
  { id: 4, method: 'tools/call', params: { name: 'list_rule_packs', arguments: {} } },
  { id: 5, method: 'tools/call', params: { name: 'search_rules', arguments: { platform: 'temu', query: '秒杀' } } },
  { id: 6, method: 'tools/call', params: { name: 'suggest_rewrite', arguments: {
    platform: 'amazon', title: 'FDA approved cure for pain, free shipping', aiDisclosure: 'ai_generated'
  } } },
  /* AI 披露漏标路径：声明 human 但文案 AI 痕迹 >= 2 → 应报 RED 的 ai-disclosure-human-risk */
  { id: 11, method: 'tools/call', params: { name: 'audit_listing', arguments: {
    platform: 'amazon',
    title: 'Unleash a seamless experience',
    bullets: ['Cutting-edge revolutionary design'],
    description: 'Delve into unparalleled performance.',
    aiDisclosure: 'human'
  } } },
  /* 错误分支：未知平台应以 isError:true 返回，而不是崩掉进程 */
  { id: 7, method: 'tools/call', params: { name: 'audit_listing', arguments: { platform: 'nope', title: 'x' } } },
  /* 错误分支：空输入 */
  { id: 8, method: 'tools/call', params: { name: 'audit_listing', arguments: { platform: 'amazon' } } },
  /* 错误分支：未知工具应回 JSON-RPC error */
  { id: 9, method: 'tools/call', params: { name: 'does_not_exist', arguments: {} } },
  { id: 10, method: 'ping' }
];

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
let out = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', c => { out += c; });
child.stderr.setEncoding('utf8');
child.stderr.on('data', () => { /* 日志走 stderr，属正常 */ });

REQUESTS.forEach(r => child.stdin.write(JSON.stringify(r) + '\n'));
child.stdin.end();

child.on('close', code => {
  const lines = out.split(/\r?\n/).filter(Boolean);
  const byId = {};
  let parseErr = null;
  for (const l of lines) {
    let m;
    try { m = JSON.parse(l); } catch (e) { parseErr = l; continue; }
    if (m.id !== undefined && m.id !== null) byId[m.id] = m;
  }

  check('stdout 全部为合法 JSON', parseErr === null, parseErr ? `非法行: ${parseErr.slice(0, 80)}` : '');
  check('进程正常退出', code === 0, `exit=${code}`);

  /* initialize */
  const init = byId[1];
  check('initialize 返回 serverInfo', !!(init && init.result && init.result.serverInfo), JSON.stringify(init));
  check('initialize 声明 tools 能力', !!(init && init.result && init.result.capabilities && init.result.capabilities.tools));
  check('initialize 带 protocolVersion', !!(init && init.result && init.result.protocolVersion), init && init.result && init.result.protocolVersion);

  /* tools/list */
  const tl = byId[2];
  const names = (tl && tl.result && tl.result.tools || []).map(t => t.name);
  check('tools/list 返回 4 个工具', names.length === 4, names.join(','));
  ['audit_listing', 'list_rule_packs', 'search_rules', 'suggest_rewrite'].forEach(n =>
    check(`工具已声明: ${n}`, names.includes(n), names.join(',')));
  const auditTool = (tl.result.tools || []).find(t => t.name === 'audit_listing');
  check('audit_listing schema 要求 platform',
    !!(auditTool && auditTool.inputSchema && (auditTool.inputSchema.required || []).includes('platform')));
  check('audit_listing platform enum 为三个平台',
    JSON.stringify(auditTool && auditTool.inputSchema.properties.platform.enum) === JSON.stringify(['amazon', 'temu', 'tiktok']),
    JSON.stringify(auditTool && auditTool.inputSchema.properties.platform.enum));

  /* audit_listing 正常路径：应与 CLI 对 red-sample 的判定一致（8 findings / RED） */
  const a = byId[3];
  const atext = a && a.result && a.result.content && a.result.content[0] && a.result.content[0].text || '';
  check('audit_listing 未标记 isError', !!(a && a.result && a.result.isError === false), JSON.stringify(a && a.result && a.result.isError));
  check('audit_listing 判定 RED', /Overall: RED/.test(atext), atext.split('\n')[1]);
  check('audit_listing 报 8 条命中（与 CLI golden 一致）', /findings: 8 /.test(atext), atext.split('\n')[1]);
  check('audit_listing 闸门为 BREACH/exit 1', /BREACH \(exit code 1\)/.test(atext));
  check('audit_listing 捕获混淆写法 F-R-E-E', /F-R-E-E|free shipping/i.test(atext));
  check('audit_listing 附结构化 JSON 块', /```json/.test(atext));

  /* AI 披露漏标路径由专用用例校验：主用例文案无 AI 痕迹词，不应误报 */
  const ai = byId[11];
  const ait = ai && ai.result && ai.result.content && ai.result.content[0] && ai.result.content[0].text || '';
  check('未声明披露时报 ai-disclosure-missing', /ai-disclosure-missing/.test(atext));
  check('主用例不误报 AI 漏标', !/ai-disclosure-human-risk/.test(atext));
  check('human + AI 痕迹密集报 RED 漏标风险',
    /ai-disclosure-human-risk/.test(ait) && /Overall: RED/.test(ait), ait.split('\n')[1]);

  /* 结构化 JSON 块可被解析，且字段与 CLI JsonReporter 对齐 */
  const jm = atext.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  let parsed = null;
  try { parsed = jm ? JSON.parse(jm[1]) : null; } catch (e) { parsed = null; }
  check('结构化 JSON 可解析', !!parsed);
  if (parsed) {
    check('JSON 含 overall/exitCode/findings',
      parsed.overall === 'RED' && parsed.exitCode === 1 && Array.isArray(parsed.findings));
    check('JSON findings 字段齐全',
      parsed.findings.every(f => ['ruleId', 'category', 'severity', 'field', 'matchedText', 'message', 'suggestion']
        .every(k => f[k] !== undefined)));
    check('JSON rulePack 元信息齐全',
      !!(parsed.rulePack && parsed.rulePack.name && parsed.rulePack.version && parsed.rulePack.market && parsed.rulePack.updated));
  }

  /* list_rule_packs */
  const lp = byId[4];
  const lpt = lp && lp.result.content[0].text || '';
  check('list_rule_packs 报 3 个规则包', /3 versioned rule packs/.test(lpt), lpt.split('\n')[0]);
  check('list_rule_packs 含 amazon-us', /amazon-us/.test(lpt));
  check('list_rule_packs 有 structuredContent',
    !!(lp.result.structuredContent && lp.result.structuredContent.packs.length === 3));

  /* search_rules */
  const sr = byId[5];
  const srt = sr.result.content[0].text || '';
  check('search_rules 命中「秒杀」规则', /banned-cn-promo/.test(srt), srt.split('\n')[0]);
  check('search_rules 返回 structuredContent',
    !!(sr.result.structuredContent && sr.result.structuredContent.matched >= 1));

  /* suggest_rewrite */
  const rw = byId[6];
  const rwt = rw.result.content[0].text || '';
  check('suggest_rewrite 给出分组建议', /^## (title|description|bullets|keywords)/m.test(rwt), rwt.split('\n')[2]);
  check('suggest_rewrite 覆盖 FDA 与 cure', /cert-fda/.test(rwt) && /absolute-cure/.test(rwt));
  check('suggest_rewrite 文本含促销词规则', /promo-free-shipping/.test(rwt));
  check('suggest_rewrite 有 structuredContent.groups',
    !!(rw.result.structuredContent && Array.isArray(rw.result.structuredContent.groups) &&
       rw.result.structuredContent.groups.length > 0));

  /* 错误分支 */
  const bad = byId[7];
  check('未知平台返回 isError 而非崩溃', !!(bad && bad.result && bad.result.isError === true), JSON.stringify(bad));
  check('未知平台错误文本含可用平台提示',
    /Available: amazon, temu, tiktok/.test(bad && bad.result.content[0].text || ''));
  const empty = byId[8];
  check('空输入返回 isError', !!(empty && empty.result && empty.result.isError === true));
  const unk = byId[9];
  check('未知工具返回 JSON-RPC error', !!(unk && unk.error && unk.error.code === -32602), JSON.stringify(unk));
  check('ping 有响应', !!(byId[10] && byId[10].result !== undefined));

  /* notifications/initialized 不应产生响应；11 个带 id 的请求应有 11 条响应 */
  check('通知未产生多余响应', lines.length === 11, `收到 ${lines.length} 条响应`);

  console.log('\n' + '='.repeat(64));
  console.log(`MCP 协议测试: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\n失败明细:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('MCP server 协议与工具行为全部正确。');
});
