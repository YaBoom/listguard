/* SECTION: rulepacks
 * listguard 规则包数据 —— 与 src/main/resources/rules/*.yaml 一一对应，逐条原样移植。
 * 单一事实来源仍是 YAML；本文件为浏览器端与 Node 端共用的只读副本。
 * 修改规则时请同步 YAML 与构建脚本，不要只改这里。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.ListguardRulePacks = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---- amazon-us：Amazon 美国站，词表依据 2026-10 平台政策与公开处罚案例整理 ---- */
  var AMAZON_US = {
    name: 'amazon-us',
    platform: 'amazon',
    market: 'US',
    version: '0.1.0',
    updated: '2026-10-16',
    rules: [
      {
        id: 'promo-free-shipping', category: 'promo_word', severity: 'RED',
        patterns: ['free shipping'],
        message: '促销短语 free shipping 属于平台禁用促销表述，易被判诱导点击',
        suggestion: '删除该短语，运费信息只放在价格/配送属性字段'
      },
      {
        id: 'promo-best-seller', category: 'promo_word', severity: 'RED',
        patterns: ['best seller', 'bestseller'],
        message: '促销表述 best seller 属排名类宣传，无依据即违规',
        suggestion: '删除，改为描述产品功能本身'
      },
      {
        id: 'promo-money-back', category: 'promo_word', severity: 'RED',
        patterns: ['money-back guarantee', 'money back guarantee'],
        message: '退款保证类表述超出平台允许的承诺范围',
        suggestion: '删除，售后政策在店铺与平台规则内如实展示'
      },
      {
        id: 'promo-quality-guaranteed', category: 'promo_word', severity: 'RED',
        patterns: ['100% quality guaranteed', 'quality guaranteed', 'satisfaction guaranteed'],
        message: '绝对化质量承诺属高危促销用语',
        suggestion: '删除该承诺，改为具体质保参数（如 12-month warranty）'
      },
      {
        id: 'promo-free-gift', category: 'promo_word', severity: 'RED',
        patterns: ['free gift', 'free giveaway'],
        message: '赠品促销表述可能触发促销审查',
        suggestion: '删除，促销活动通过平台广告/促销工具进行'
      },
      {
        id: 'promo-sale', category: 'promo_word', severity: 'RED',
        patterns: ['on sale', 'discount price', 'lowest price'],
        message: '降价促销词在标题与五点中禁用',
        suggestion: '删除，价格促销只使用平台优惠机制'
      },
      {
        id: 'absolute-no1', category: 'absolute_claim', severity: 'RED',
        patterns: ['#1 best', 'number one', 'no.1', 'top rated'],
        message: '绝对化排名/评级用语，无第三方依据即违规',
        suggestion: '删除排名表述，改用可验证的产品参数'
      },
      {
        id: 'absolute-guaranteed-results', category: 'absolute_claim', severity: 'RED',
        patterns: ['re:\\bguaranteed\\s+results\\b', 're:\\bworks\\s+instantly\\b'],
        message: '保证功效/立竿见影类绝对化声明',
        suggestion: '删除功效承诺，改为客观描述产品属性'
      },
      {
        id: 'absolute-cure', category: 'absolute_claim', severity: 'RED',
        patterns: ['re:\\bcure\\b', 're:\\btreat disease\\b', 're:\\bheals\\b'],
        message: '疾病治疗类声明，非药品类目严格禁止',
        suggestion: '删除所有疾病治疗相关表述'
      },
      {
        id: 'cert-fda', category: 'certification_claim', severity: 'RED',
        patterns: ['fda approved', 'fda certified'],
        message: 'FDA 认证声明须有真实注册号，无证声明属虚假宣传',
        suggestion: '无 FDA 注册立即删除；有证在描述中附注册信息'
      },
      {
        id: 'cert-eco', category: 'certification_claim', severity: 'YELLOW',
        patterns: ['eco-friendly', 'biodegradable', 'sustainable material'],
        message: '环保声明需第三方认证支撑，平台重点审查绿色宣传',
        suggestion: '无认证删除，或注明具体认证机构与证书编号'
      },
      {
        id: 'cert-antibacterial', category: 'certification_claim', severity: 'RED',
        patterns: ['anti-bacterial', 'antibacterial', 'kills 99.9%'],
        message: '抗菌/灭菌声明需 EPA 或实验室报告支撑',
        suggestion: '无报告删除该声明'
      },
      {
        id: 'cert-ce', category: 'certification_claim', severity: 'YELLOW',
        patterns: ['ce marked', 'ce certified', 'fcc certified'],
        message: '认证标记声明须与实际证书一致，目标市场必查项',
        suggestion: '核对证书后保留或删除；欧洲站需 GPSR 责任人信息配套'
      },
      {
        id: 'cert-organic', category: 'certification_claim', severity: 'YELLOW',
        patterns: ['re:\\borganic\\b'],
        message: '有机声明需 USDA 等认证，食品/美妆类目高敏感',
        suggestion: '无认证删除 organic 表述'
      },
      {
        id: 'banned-covid', category: 'banned_word', severity: 'RED',
        patterns: ['covid-19', 'coronavirus'],
        message: '时效性禁用词，曾被大量用于蹭流量后被平台封禁',
        suggestion: '删除'
      },
      {
        id: 'tm-emoji', category: 'trademark_risk', severity: 'RED',
        patterns: ['emoji'],
        message: 'emoji 已被抢注为注册商标，常见侵权词',
        suggestion: '删除该词，避免商标侵权下架'
      },
      {
        id: 'tm-frisbee', category: 'trademark_risk', severity: 'RED',
        patterns: ['frisbee'],
        message: 'Frisbee 是 Wham-O 注册商标，通用名称应为 flying disc',
        suggestion: '改为 flying disc'
      },
      {
        id: 'tm-hulahoop', category: 'trademark_risk', severity: 'YELLOW',
        patterns: ['hula hoop'],
        message: 'Hula Hoop 存在商标争议记录，建议用通用名',
        suggestion: '改为 fitness hoop 等通用表述'
      },
      {
        id: 'tm-velcro', category: 'trademark_risk', severity: 'YELLOW',
        patterns: ['velcro'],
        message: 'Velcro 为注册商标，通用名应为 hook and loop',
        suggestion: '改为 hook and loop fastener'
      },
      {
        id: 'ai-disclosure-rule', category: 'ai_disclosure', severity: 'YELLOW',
        patterns: [],
        message: 'AI 披露规则由专用检查器执行（2026-08 新规：商品信息模板 AI 生成内容字段）',
        suggestion: '在卖家后台如实填写 AI 生成内容披露字段，存量商品 2026-11-01 前完成补全'
      }
    ]
  };

  /* ---- temu-global：Temu 全球站，词表依据 2026-10 平台处罚案例整理（扣款/下架/限制上新） ---- */
  var TEMU_GLOBAL = {
    name: 'temu-global',
    platform: 'temu',
    market: 'GLOBAL',
    version: '0.1.0',
    updated: '2026-10-16',
    rules: [
      {
        id: 'promo-cheapest', category: 'promo_word', severity: 'RED',
        patterns: ['cheapest', 'lowest price'],
        message: '最低价声明无法验证且易引发价格欺诈认定',
        suggestion: '删除，价格竞争力由平台比价系统呈现'
      },
      {
        id: 'promo-free-gift', category: 'promo_word', severity: 'RED',
        patterns: ['free gift', 'buy one get one free'],
        message: '赠品促销表述需走平台活动流程，文案直写易被扣款',
        suggestion: '删除，促销通过平台营销工具配置'
      },
      {
        id: 'promo-cashback', category: 'promo_word', severity: 'RED',
        patterns: ['cashback', 'rebate'],
        message: '返现类表述触发平台营销合规审查',
        suggestion: '删除'
      },
      {
        id: 'absolute-original', category: 'absolute_claim', severity: 'RED',
        patterns: ['100% original', 'authentic guaranteed', '百分百正品', '假一赔十'],
        message: '正品保证类绝对化用语，无授权链路证明即违规',
        suggestion: '删除；品牌商品在后台上传授权资质'
      },
      {
        id: 'absolute-no1', category: 'absolute_claim', severity: 'RED',
        patterns: ['第一品牌', '全网最低', '销量第一', 'top brand'],
        message: '排名类绝对化宣传，广告法与平台规则双重红线',
        suggestion: '删除，改为可验证的产品卖点'
      },
      {
        id: 'absolute-miracle', category: 'absolute_claim', severity: 'RED',
        patterns: ['miracle', 'weight loss miracle', '包治百病', '绝对有效'],
        message: '功效奇迹类声明，普通商品严禁医疗功效暗示',
        suggestion: '删除全部功效承诺'
      },
      {
        id: 'absolute-forever', category: 'absolute_claim', severity: 'YELLOW',
        patterns: ['lifetime warranty', '永不磨损', '永久保修'],
        message: '永久类承诺造成售后纠纷与平台判罚',
        suggestion: '改为具体年限（如 2-year warranty）'
      },
      {
        id: 'cert-medical', category: 'certification_claim', severity: 'RED',
        patterns: ['medical grade', '医用级', 'clinically proven'],
        message: '医用/临床声明需资质文件，Temu 类目审核重点',
        suggestion: '无资质删除；有报告在资质中心上传'
      },
      {
        id: 'cert-noside', category: 'certification_claim', severity: 'RED',
        patterns: ['no side effects', '无副作用'],
        message: '无副作用声明属医疗类绝对化宣传',
        suggestion: '删除'
      },
      {
        id: 'cert-foodsafe', category: 'certification_claim', severity: 'YELLOW',
        patterns: ['food grade', '食品级'],
        message: '食品级声明需检测报告支撑，质检类目重点核查',
        suggestion: '上传检测报告或删除该表述'
      },
      {
        id: 'banned-cn-promo', category: 'banned_word', severity: 'RED',
        patterns: ['秒杀', '免单', '清仓'],
        message: '中文促销词直出详情页，触发音控/营销合规',
        suggestion: '删除，站点文案使用目标市场语言'
      },
      {
        id: 'banned-pinduoduo', category: 'banned_word', severity: 'RED',
        patterns: ['拼多多', '淘宝', '京东'],
        message: '竞品平台名称属引流违禁词',
        suggestion: '删除'
      },
      {
        id: 'tm-disney', category: 'trademark_risk', severity: 'RED',
        patterns: ['disney', 'marvel', 'mickey'],
        message: '知名 IP 角色词，无授权即侵权下架并扣保证金',
        suggestion: '删除，除非持有 IP 授权'
      },
      {
        id: 'tm-levi', category: 'trademark_risk', severity: 'YELLOW',
        patterns: ['levis', "levi's"],
        message: '品牌词误用易触发商标投诉',
        suggestion: '删除品牌词，只描述商品属性'
      },
      {
        id: 'ai-disclosure-rule', category: 'ai_disclosure', severity: 'YELLOW',
        patterns: [],
        message: 'AI 披露规则由专用检查器执行（平台 AIGC 内容治理收紧中）',
        suggestion: '如实标注 AI 生成素材，保留生成记录备查'
      }
    ]
  };

  /* ---- tiktok-us：TikTok Shop 美国站，词表依据 2026-10 平台政策与公开处罚案例整理 ---- */
  var TIKTOK_US = {
    name: 'tiktok-us',
    platform: 'tiktok',
    market: 'US',
    version: '0.1.0',
    updated: '2026-10-16',
    rules: [
      {
        id: 'promo-free-gift', category: 'promo_word', severity: 'RED',
        patterns: ['free gift', 'freebie'],
        message: '赠品诱导表述触发促销合规审查',
        suggestion: '删除，促销活动走平台官方活动页'
      },
      {
        id: 'promo-linkinbio', category: 'promo_word', severity: 'YELLOW',
        patterns: ['link in bio', 'dm for price', 'dm to order'],
        message: '站外引流/私下成交表述违反平台交易闭环要求',
        suggestion: '删除，引导用户在站内完成下单'
      },
      {
        id: 'promo-follow-discount', category: 'promo_word', severity: 'YELLOW',
        patterns: ['follow for discount', 'discount code in comment'],
        message: '关注换优惠属诱导互动，限流风险',
        suggestion: '删除'
      },
      {
        id: 'promo-flash', category: 'promo_word', severity: 'RED',
        patterns: ['50% off today only', 'flash sale now'],
        message: '限时促销直写文案与平台活动机制冲突',
        suggestion: '删除，用平台限时购工具'
      },
      {
        id: 'absolute-burnfat', category: 'absolute_claim', severity: 'RED',
        patterns: ['burn fat', 'lose weight fast', 'slimming guaranteed'],
        message: '减脂功效承诺，美妆/保健品严格红线',
        suggestion: '删除功效承诺，改为成分与使用体验描述'
      },
      {
        id: 'absolute-antiaging', category: 'absolute_claim', severity: 'RED',
        patterns: ['anti-aging guaranteed', 'erase wrinkles', 'look 10 years younger'],
        message: '抗衰绝对化功效声明',
        suggestion: '改为化妆品允许的修饰表述（如改善肌肤外观）'
      },
      {
        id: 'absolute-detox', category: 'absolute_claim', severity: 'RED',
        patterns: ['detox', 'cleanse toxins'],
        message: '排毒类医疗暗示声明',
        suggestion: '删除'
      },
      {
        id: 'absolute-whitening', category: 'absolute_claim', severity: 'YELLOW',
        patterns: ['whitening', 'skin lightening'],
        message: '美白属特殊化妆品功效宣称，需备案支撑',
        suggestion: '无备案改为提亮/均匀肤色等合规表述'
      },
      {
        id: 'cert-fda', category: 'certification_claim', severity: 'RED',
        patterns: ['fda approved', 're:\\bcures\\b', 're:\\btreats\\b'],
        message: '医疗功效/认证声明，非药品严禁',
        suggestion: '删除'
      },
      {
        id: 'cert-organic', category: 'certification_claim', severity: 'YELLOW',
        patterns: ['100% organic', 'all natural'],
        message: '天然/有机声明需认证支撑',
        suggestion: '核对认证后保留或删除'
      },
      {
        id: 'banned-beforeafter', category: 'banned_word', severity: 'RED',
        patterns: ['before after', 're:\\bb/a\\s+photos?\\b'],
        message: '前后对比类内容在美区属敏感营销素材',
        suggestion: '移除对比表述，用场景图代替'
      },
      {
        id: 'banned-competitor', category: 'banned_word', severity: 'RED',
        patterns: ['better than', 'alternative to'],
        message: '贬损/比对竞品表述违反公平竞争规则',
        suggestion: '删除竞品对比，突出自身卖点'
      },
      {
        id: 'tm-apple', category: 'trademark_risk', severity: 'RED',
        patterns: ['for iphone', 'airpods style'],
        message: '兼容表述书写不当易被判商标滥用（airpods 为注册商标）',
        suggestion: '兼容商品使用 compatible with 并核对品牌词政策'
      },
      {
        id: 'tm-nike', category: 'trademark_risk', severity: 'RED',
        patterns: ['nike style', 'like nike'],
        message: '借名品牌词侵权',
        suggestion: '删除'
      },
      {
        id: 'ai-disclosure-rule', category: 'ai_disclosure', severity: 'YELLOW',
        patterns: [],
        message: 'AI 披露规则由专用检查器执行（平台要求标注 AIGC 内容）',
        suggestion: '如实标注 AI 生成内容，保留生成记录'
      }
    ]
  };

  var PACKS = [AMAZON_US, TEMU_GLOBAL, TIKTOK_US];

  var BY_PLATFORM = {};
  PACKS.forEach(function (p) { BY_PLATFORM[p.platform] = p; });

  return {
    packs: PACKS,
    byPlatform: BY_PLATFORM,
    get: function (platform) { return BY_PLATFORM[String(platform || '').toLowerCase()] || null; }
  };
});
