/**
 * SECTION: difftest
 * 差分测试：同一批 listing 分别跑 Java CLI 与 JS 移植引擎，逐条比对 Finding。
 * 用途：证明浏览器端引擎与命令行引擎语义一致（移植没有漂移）。
 * 运行：node web/tests/engine-parity.test.mjs
 * 前置：mvn -DskipTests package（需要 target/listguard.jar 作为 Java 侧权威实现）
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');   /* web/tests/ → 仓库根 */
const JAR = join(ROOT, 'target', 'listguard.jar');

const Engine = require(join(__dirname, '..', 'assets', 'engine.js'));
const Packs = require(join(__dirname, '..', 'assets', 'rulepacks.js'));

const TMP = join(ROOT, 'target', 'difftest-tmp');
mkdirSync(TMP, { recursive: true });

/* ---------- 测试用例：覆盖 examples + 移植风险边界 ---------- */
const CASES = [
  { name: 'examples/red-sample (amazon)', platform: 'amazon', listing: {
    id: 'RED-SAMPLE-001',
    title: 'Best Seller Wireless Earbuds F-R-E-E Shipping',
    bullets: ['100% natural cure for joint pain', '#1 best seller guaranteed results'],
    description: 'Cheapest price in the world, wholesale welcome.',
    keywords: ['earbuds', 'cheap', 'free shipping'],
    platform: 'amazon'
  } },
  { name: 'examples/yellow-sample (amazon)', platform: 'amazon', listing: {
    id: 'YELLOW-SAMPLE-001',
    title: 'Wireless Earbuds with Noise Cancelling',
    bullets: ['Up to 30 hours of playtime with the charging case'],
    description: 'In-ear earbuds with clear calls and comfortable fit.',
    keywords: ['earbuds', 'noise cancelling'],
    platform: 'amazon'
  } },
  { name: 'examples/clean-sample (amazon)', platform: 'amazon', listing: {
    id: 'CLEAN-SAMPLE-001',
    title: 'Wireless Earbuds with Noise Cancelling',
    bullets: ['Up to 30 hours of playtime with the charging case',
      'Bluetooth 5.3 connection for stable pairing'],
    description: 'In-ear earbuds with clear calls and comfortable fit.',
    keywords: ['earbuds', 'noise cancelling'],
    platform: 'amazon', aiDisclosure: 'human'
  } },
  /* 全角 ASCII：ＦＲＥＥ 必须被 fold 捕获 */
  { name: 'fullwidth FREE (amazon)', platform: 'amazon', listing: {
    id: 'FW-001', title: 'Ｅａｒｂｕｄｓ　ＦＲＥＥ　ＳＨＩＰＰＩＮＧ',
    bullets: ['ＢＥＳＴ　ＳＥＬＬＥＲ'], description: 'Ｔｏｐ　Ｒａｔｅｄ ｐｒｏｄｕｃｔ',
    keywords: ['ａｉｒｐｏｄｓ'], platform: 'amazon', aiDisclosure: 'ai_generated'
  } },
  /* 混淆分隔符：f-r-e-e / b.e.s.t seller 必须被 condense 捕获 */
  { name: 'separator obfuscation (amazon)', platform: 'amazon', listing: {
    id: 'SEP-001', title: 'Earbuds with f-r-e-e shipping and b.e.s.t seller badge',
    bullets: ['m.o.n.e.y-b.a.c.k guarantee'], description: 'f_d_a approved device',
    keywords: ['e-c-o-f-r-i-e-n-d-l-y'], platform: 'amazon', aiDisclosure: 'ai_generated'
  } },
  /* 词边界防误报：secure / sculpture / securest 不应命中 cure */
  { name: 'word boundary no false positive (amazon)', platform: 'amazon', listing: {
    id: 'WB-001', title: 'Secure Wireless Earbuds, Sculpture Design',
    bullets: ['Securely paired, no cure needed for setup', 'Procedural guidance included'],
    description: 'Enclosure made of organic-looking resin', keywords: ['secure'],
    platform: 'amazon', aiDisclosure: 'ai_generated'
  } },
  /* CJK 空白移除：全 场 最 低 价 必须命中 temu 的 全网最低 之外的中文规则 */
  { name: 'CJK gap collapse (temu)', platform: 'temu', listing: {
    id: 'CJK-001', title: '秒杀 款 假一赔十 正品', bullets: ['包 治 百 病 神 器'],
    description: '医用级 材料 无副作用', keywords: ['拼多多'], platform: 'temu',
    aiDisclosure: 'human'
  } },
  /* AI 披露：human + 痕迹 >=2 → RED */
  { name: 'AI disclosure human-risk (amazon)', platform: 'amazon', listing: {
    id: 'AI-001', title: 'Unleash a seamless experience',
    bullets: ['Cutting-edge revolutionary design', 'Elevate your daily routine'],
    description: 'Delve into unparalleled performance.', keywords: ['earbuds'],
    platform: 'amazon', aiDisclosure: 'human'
  } },
  /* AI 披露：assisted + 痕迹 >=3 → YELLOW */
  { name: 'AI disclosure assisted-heavy (amazon)', platform: 'amazon', listing: {
    id: 'AI-002', title: 'Seamless and revolutionary',
    bullets: ['Cutting-edge design', 'Elevate your experience'],
    description: 'Unparalleled performance.', keywords: ['earbuds'],
    platform: 'amazon', aiDisclosure: 'assisted'
  } },
  /* AI 披露：非法值 → YELLOW unknown */
  { name: 'AI disclosure unknown value (amazon)', platform: 'amazon', listing: {
    id: 'AI-003', title: 'Wireless Earbuds', bullets: ['Long battery life'],
    description: 'Comfortable fit.', keywords: ['earbuds'], platform: 'amazon',
    aiDisclosure: 'maybe'
  } },
  /* ai_generated 且无违规 → GREEN */
  { name: 'clean with ai_generated (temu)', platform: 'temu', listing: {
    id: 'CL-001', title: '蓝牙耳机 主动降噪', bullets: ['续航 30 小时'],
    description: '佩戴舒适，通话清晰。', keywords: ['耳机'], platform: 'temu',
    aiDisclosure: 'ai_generated'
  } },
  /* tiktok 全规则面 */
  { name: 'tiktok broad (tiktok)', platform: 'tiktok', listing: {
    id: 'TT-001', title: 'Burn fat fast - look 10 years younger',
    bullets: ['Link in bio for 50% off today only', 'Better than any alternative to detox'],
    description: 'Anti-aging guaranteed, erase wrinkles, whitening effect, all natural 100% organic',
    keywords: ['nike style', 'airpods style', 'freebie'], platform: 'tiktok'
  } },
  /* 空 listing：应只报披露缺失 */
  { name: 'empty listing (amazon)', platform: 'amazon', listing: {
    id: 'EMPTY-001', title: '', bullets: [], description: '', keywords: [],
    platform: 'amazon'
  } }
];

/* ---------- 跑 Java 侧 ---------- */
/**
 * 两处 Windows 陷阱：
 * 1. CLI 的闸门语义是「命中红线 → 退出码 1」，这不是错误。用 --fail-on never 让报告照常输出、
 *    退出码稳定为 0，避免把正常闸门当成执行失败（也顺带单独校验闸门语义）。
 * 2. JVM 在 Windows 默认按控制台码页（GBK）写 stdout，Node 按 UTF-8 解码会得到乱码。
 *    用 -Dstdout.encoding=UTF-8 固定输出编码，再以 Buffer 收流、显式 UTF-8 解码。
 */
function runJava(listing, platform) {
  const file = join(TMP, `case-${listing.id.replace(/[^\w.-]/g, '_')}.json`);
  writeFileSync(file, JSON.stringify(listing, null, 2), 'utf8');
  const res = spawnSync('java', [
    '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8',
    '-jar', JAR, 'check', file, '--platform', platform,
    '--format', 'json', '--fail-on', 'never'
  ], { cwd: ROOT });
  if (res.error) throw new Error('spawn 失败: ' + res.error.message);
  if (res.status !== 0) {
    throw new Error(`退出码 ${res.status}: ${new TextDecoder('utf-8').decode(res.stderr || Buffer.alloc(0))}`);
  }
  const text = new TextDecoder('utf-8').decode(res.stdout);
  return JSON.parse(text);
}

/** 单独校验闸门退出码语义：0=通过，1=命中阈值（与 CheckCommand.breaches 一致） */
function runJavaExitCode(listing, platform, failOn) {
  const file = join(TMP, `exit-${listing.id.replace(/[^\w.-]/g, '_')}.json`);
  writeFileSync(file, JSON.stringify(listing, null, 2), 'utf8');
  const res = spawnSync('java', [
    '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8',
    '-jar', JAR, 'check', file, '--platform', platform,
    '--format', 'text', '--fail-on', failOn
  ], { cwd: ROOT });
  return res.status;
}

/* ---------- 跑 JS 侧 ---------- */
function runJs(listing, platform) {
  const pack = Packs.get(platform);
  if (!pack) throw new Error('unknown platform ' + platform);
  const result = Engine.audit(listing, pack);
  return {
    listingId: result.listingId,
    overall: result.overall,
    rulePack: result.rulePack,
    findings: result.findings
  };
}

/* ---------- 比对 ---------- */
let pass = 0, fail = 0;
const failures = [];

for (const c of CASES) {
  let j, s;
  try { j = runJava(c.listing, c.platform); }
  catch (e) { failures.push(`[${c.name}] Java 执行失败: ${e.message}`); fail++; continue; }
  try { s = runJs(c.listing, c.platform); }
  catch (e) { failures.push(`[${c.name}] JS 执行失败: ${e.message}`); fail++; continue; }

  const diffs = [];
  if (j.overall !== s.overall) diffs.push(`overall: java=${j.overall} js=${s.overall}`);
  if (j.listingId !== s.listingId) diffs.push(`listingId: java=${j.listingId} js=${s.listingId}`);
  if ((j.rulePack || {}).name !== (s.rulePack || {}).name) {
    diffs.push(`rulePack.name: java=${j.rulePack?.name} js=${s.rulePack?.name}`);
  }
  const jf = j.findings || [], sf = s.findings || [];
  if (jf.length !== sf.length) diffs.push(`findings 数量: java=${jf.length} js=${sf.length}`);
  const n = Math.max(jf.length, sf.length);
  for (let i = 0; i < n; i++) {
    const a = jf[i], b = sf[i];
    if (!a || !b) { diffs.push(`#${i} 缺失: java=${JSON.stringify(a)} js=${JSON.stringify(b)}`); continue; }
    for (const k of ['ruleId', 'category', 'severity', 'field', 'matchedText', 'message', 'suggestion']) {
      if (String(a[k]) !== String(b[k])) diffs.push(`#${i} ${k}: java=${JSON.stringify(a[k])} js=${JSON.stringify(b[k])}`);
    }
  }

  if (diffs.length === 0) {
    pass++;
    console.log(`  PASS  ${c.name}  (${sf.length} findings, overall=${s.overall})`);
  } else {
    fail++;
    failures.push(`[${c.name}]\n      - ` + diffs.join('\n      - '));
    console.log(`  FAIL  ${c.name}`);
  }
}

/* ---------- 闸门退出码语义校验（网页版 breaches 需与 CheckCommand 一致） ---------- */
/** JS 侧复刻闸门判定：overall 达到或超过阈值即 breach（ordinal 越小越严重） */
function jsBreaches(overall, failOn) {
  if (failOn === 'never') return false;
  return Engine.SEVERITY[overall] <= Engine.SEVERITY[String(failOn).toUpperCase()];
}

console.log('\n-- 闸门退出码语义 --');
for (const c of CASES) {
  for (const failOn of ['red', 'yellow', 'never']) {
    let javaCode;
    try { javaCode = runJavaExitCode(c.listing, c.platform, failOn); }
    catch (e) { failures.push(`[gate ${c.name} ${failOn}] Java 执行失败: ${e.message}`); fail++; continue; }
    const overall = runJs(c.listing, c.platform).overall;
    const expected = jsBreaches(overall, failOn) ? 1 : 0;
    if (javaCode !== expected) {
      fail++;
      failures.push(`[gate ${c.name} fail-on=${failOn}] java exit=${javaCode} js=${expected} (overall=${overall})`);
    } else {
      pass++;
    }
  }
}

rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '='.repeat(64));
console.log(`差分测试: ${pass} passed, ${fail} failed, ${CASES.length} total`);
if (fail > 0) {
  console.log('\n失败明细:\n' + failures.map(f => '  ' + f).join('\n'));
  process.exit(1);
}
console.log('JS 引擎与 Java CLI 输出逐条一致。');
