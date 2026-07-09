#!/usr/bin/env node
'use strict';

// BNBU Map — SEO 生成脚本
// 读取 POI.json，生成：
//   1. sitemap.xml         —— 站点地图（首页/目录/评论/隐私）
//   2. poi-directory.html  —— 静态可索引的 POI 完整目录页（含 JSON-LD 结构化数据）
//
// 分类与名称解析逻辑与 index.html 保持一致，确保目录页与地图显示口径相同。
// 无第三方依赖，仅使用 node 内置 fs/path。

const fs = require('fs');
const path = require('path');

const SITE = 'https://u-map.haotian22.top';
const OG_IMAGE = 'https://github.com/user-attachments/assets/2e67a00b-6643-4cf6-b852-9559dd854acb';
const DIR = __dirname;
const POI_FILE = path.join(DIR, 'POI.json');

// ===== 分类配置（与 index.html 同步）=====
const categoryColors = {
  dormitory: { color: '#60A5FA', label: 'Dormitory / 宿舍楼' },
  university: { color: '#2563EB', label: 'Academic Building / 教学楼' },
  building_other: { color: '#94A3B8', label: 'Other Building / 其他建筑' },
  restaurant: { color: '#EF4444', label: 'Restaurant / 餐厅' },
  cafe: { color: '#F87171', label: 'Cafe / 咖啡厅' },
  food_court: { color: '#DC2626', label: 'Food Court / 食堂' },
  fast_food: { color: '#FCA5A5', label: 'Fast Food / 快餐' },
  shop: { color: '#F59E0B', label: 'Shop / 商店' },
  office: { color: '#8B5CF6', label: 'Office / 办公室' },
  amenity: { color: '#10B981', label: 'Amenity / 设施' },
  parking: { color: '#059669', label: 'Parking / 停车' },
  healthcare: { color: '#EC4899', label: 'Healthcare / 医疗' },
  tourism: { color: '#14B8A6', label: 'Tourism / 旅游' },
  leisure: { color: '#F97316', label: 'Leisure / 休闲' },
  default: { color: '#6B7280', label: 'POI / 地点' }
};

const categoryGroups = {
  buildings: { categories: ['dormitory', 'university', 'building_other'], label: 'Buildings / 建筑' },
  dining: { categories: ['restaurant', 'cafe', 'food_court', 'fast_food'], label: 'Dining / 餐饮' },
  shop: { categories: ['shop'], label: 'Shop / 商店' },
  office: { categories: ['office'], label: 'Office / 办公室' },
  facilities: { categories: ['amenity', 'parking'], label: 'Facilities / 设施' },
  healthcare: { categories: ['healthcare'], label: 'Healthcare / 医疗' },
  tourism: { categories: ['tourism'], label: 'Tourism / 旅游' },
  leisure: { categories: ['leisure'], label: 'Leisure / 休闲' },
  default: { categories: ['default'], label: 'Other / 其他' }
};

// 根据属性确定类别（与 index.html getCategoryInfo 一致）
function getCategoryInfo(props) {
  if (props.building === 'dormitory') return categoryColors.dormitory;
  if (props.building === 'university') return categoryColors.university;
  if (props.building && props.building !== 'yes') return categoryColors.building_other;
  if (props.amenity === 'restaurant') return categoryColors.restaurant;
  if (props.amenity === 'cafe') return categoryColors.cafe;
  if (props.amenity === 'food_court') return categoryColors.food_court;
  if (props.amenity === 'fast_food') return categoryColors.fast_food;
  if (props.shop) return categoryColors.shop;
  if (props.office) return categoryColors.office;
  if (props.amenity && (props.amenity.includes('parking') || props.amenity === 'bicycle_parking')) return categoryColors.parking;
  if (props.healthcare || props.amenity === 'doctors' || props.emergency === 'defibrillator') return categoryColors.healthcare;
  if (props.tourism) return categoryColors.tourism;
  if (props.leisure) return categoryColors.leisure;
  if (props.amenity) return categoryColors.amenity;
  return categoryColors.default;
}

function categoryKey(info) {
  return Object.keys(categoryColors).find(k => categoryColors[k] === info) || 'default';
}

function groupKey(catKey) {
  for (const [gk, gv] of Object.entries(categoryGroups)) {
    if (gv.categories.includes(catKey)) return gk;
  }
  return 'default';
}

// 应用特殊名称处理（与 index.html 一致）
function applySpecialNames(props) {
  const p = Object.assign({}, props);
  if (p.emergency === 'defibrillator' && !p.name) {
    p['name:en'] = 'AED'; p['name:zh'] = '自动体外除颤器'; p.name = 'AED';
  }
  if ((p.amenity === 'lost_property_office' || p.office === 'lost_property') && !p.name) {
    p['name:en'] = 'Lost and Found'; p['name:zh'] = '失物招领处'; p.name = 'Lost and Found';
  }
  if (p.amenity === 'fire_station' && !p.name) {
    p['name:en'] = 'Fire Station'; p['name:zh'] = '消防站'; p.name = 'Fire Station';
  }
  if (p.amenity === 'parking_entrance' && !p.name) {
    p['name:en'] = 'Parking Entrance'; p['name:zh'] = '停车场入口'; p.name = 'Parking Entrance';
  }
  if (p.amenity === 'waste_disposal' && !p.name) {
    p['name:en'] = 'Waste Disposal'; p['name:zh'] = '垃圾回收点'; p.name = 'Waste Disposal';
  }
  if (p.amenity === 'parking' && !p.name) {
    p['name:en'] = 'Parking'; p['name:zh'] = '停车场'; p.name = 'Parking';
  }
  if (p.amenity === 'bicycle_parking' && !p.name) {
    p['name:en'] = 'Bicycle Parking'; p['name:zh'] = '自行车停车点'; p.name = 'Bicycle Parking';
  }
  if (p.amenity === 'waste_transfer_station' && !p.name) {
    p['name:en'] = 'Waste Transfer Station'; p['name:zh'] = '垃圾中转站'; p.name = 'Waste Transfer Station';
  }
  if (p.emergency === 'fire_hydrant' && !p.name) {
    p['name:en'] = 'Fire Hydrant'; p['name:zh'] = '消防栓'; p.name = 'Fire Hydrant';
  }
  return p;
}

// 解析坐标
function getCoord(el) {
  if (el.type === 'node') return { lat: el.lat, lon: el.lon };
  if ((el.type === 'way' || el.type === 'relation') && el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

// HTML 转义
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== 读取并解析 POI =====
let raw;
try {
  raw = fs.readFileSync(POI_FILE, 'utf8');
} catch (e) {
  console.error('✗ 无法读取 POI.json:', e.message);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('✗ POI.json 解析失败:', e.message);
  process.exit(1);
}

const pois = [];
(data.elements || []).forEach(el => {
  const coord = getCoord(el);
  if (!coord) return;
  const props = applySpecialNames(el.tags || {});
  const info = getCategoryInfo(props);
  const catKey = categoryKey(info);
  const nameEn = props['name:en'] || '';
  const nameZh = props['name:zh'] || props.name || '';
  let display;
  if (nameEn && nameZh) display = `${nameEn} / ${nameZh}`;
  else display = nameEn || nameZh || '未命名 / Unnamed';
  pois.push({
    id: el.id,
    lat: coord.lat,
    lon: coord.lon,
    nameEn, nameZh, display,
    catKey, catLabel: info.label, color: info.color,
    props
  });
});

// 按分组归类
const grouped = {};
const groupOrder = Object.keys(categoryGroups);
pois.forEach(p => {
  const gk = groupKey(p.catKey);
  (grouped[gk] = grouped[gk] || []).push(p);
});
// 每组按名称排序
Object.keys(grouped).forEach(gk => {
  grouped[gk].sort((a, b) => (a.nameEn || a.nameZh || '').localeCompare(b.nameEn || b.nameZh || ''));
});

const ts = new Date().toISOString().slice(0, 10);

// ===== 生成 sitemap.xml =====
const sitemapUrls = [
  { loc: SITE + '/', prio: '1.0', freq: 'daily' },
  { loc: SITE + '/poi-directory.html', prio: '0.9', freq: 'daily' },
  { loc: SITE + '/comments.html', prio: '0.6', freq: 'daily' },
  { loc: SITE + '/privacy.html', prio: '0.3', freq: 'yearly' }
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${ts}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.prio}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(DIR, 'sitemap.xml'), sitemap, 'utf8');
console.log(`✓ 已生成 sitemap.xml（${sitemapUrls.length} 个 URL）`);

// ===== 生成 poi-directory.html =====

// JSON-LD：学校 + POI 列表
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: 'Beijing Normal University-Hong Kong Baptist University (BNBU)',
  alternateName: '北师香港浸会大学',
  url: SITE,
  logo: SITE + '/icon.png',
  sameAs: ['https://github.com/HaoTian22/BNBU-Map']
};

const itemListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'BNBU Campus Points of Interest',
  numberOfItems: pois.length,
  itemListElement: pois.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Place',
      name: p.display,
      geo: { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lon },
      url: `${SITE}/#poi=${p.id}`
    }
  }))
};

// 类别 section 渲染
const sectionsHtml = groupOrder
  .filter(gk => grouped[gk] && grouped[gk].length)
  .map(gk => {
    const g = categoryGroups[gk];
    const items = grouped[gk];
    // 该组涉及的颜色指示器
    const dots = g.categories
      .filter(c => categoryColors[c])
      .map(c => `<span class="dot" style="background:${categoryColors[c].color}"></span>`)
      .join('');
    const list = items.map(p => {
      const coord = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
      const extra = [];
      if (p.props.amenity) extra.push(esc(p.props.amenity));
      if (p.props.building && p.props.building !== 'yes') extra.push(esc(p.props.building));
      if (p.props.shop) extra.push(esc(p.props.shop));
      if (p.props.cuisine) extra.push(esc(p.props.cuisine));
      if (p.props['level:ref']) extra.push('Floor ' + esc(p.props['level:ref']));
      if (p.props.opening_hours) extra.push('Hours: ' + esc(p.props.opening_hours));
      const extraStr = extra.length ? `<span class="poi-extra">${extra.join(' · ')}</span>` : '';
      return `      <a class="poi-item" href="index.html#poi=${encodeURIComponent(p.id)}">
        <span class="poi-dot" style="background:${p.color}"></span>
        <span class="poi-name">${esc(p.display)}</span>
        <span class="poi-cat">${esc(p.catLabel)}</span>
        ${extraStr}
        <span class="poi-coord">${esc(coord)}</span>
      </a>`;
    }).join('\n');
    return `    <section class="group">
      <h2 class="group-title">${dots}${esc(g.label)} <span class="group-count">(${items.length})</span></h2>
      <div class="poi-list">
${list}
      </div>
    </section>`;
  }).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BNBU Campus Map Directory | BNBU 校园地图地点目录</title>
  <meta name="description" content="Complete directory of buildings, dormitories, restaurants, cafes, shops and facilities on the BNBU (Beijing Normal University-Hong Kong Baptist University) campus. 北师香港浸会大学校园所有建筑、宿舍、餐厅、咖啡厅、商店与设施地点目录。">
  <meta name="keywords" content="BNBU, BNBU map, BNBU campus map, 联合国际学院, 北师港浸大, 校园地图, BNBU dormitory, BNBU restaurant, UIC map">
  <link rel="canonical" href="${SITE}/poi-directory.html">
  <link rel="icon" href="/favicon.ico">
  <meta name="theme-color" content="#1a73e8">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="BNBU Map">
  <meta property="og:title" content="BNBU Campus Map Directory | BNBU 校园地图地点目录">
  <meta property="og:description" content="Complete directory of buildings, dormitories, restaurants, cafes, shops and facilities on the BNBU campus. BNBU 校园所有建筑、餐厅、商店与设施地点目录。">
  <meta property="og:url" content="${SITE}/poi-directory.html">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:locale:alternate" content="en_US">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="BNBU Campus Map Directory | BNBU 校园地图地点目录">
  <meta name="twitter:description" content="Complete directory of POIs on the BNBU campus. BNBU 校园地点目录。">
  <meta name="twitter:image" content="${OG_IMAGE}">

  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(itemListJsonLd)}</script>

  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; background: #f3f7fb;
      font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #333; line-height: 1.6;
    }
    .header {
      background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid #e5e7eb; padding: 16px 24px; display: flex; align-items: center; gap: 16px;
      position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.07);
    }
    .header-back {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
      background: #eff6ff; color: #2563EB; border: 1.5px solid #bfdbfe; border-radius: 30px;
      font-size: 13px; font-weight: 500; text-decoration: none; transition: background 0.2s; white-space: nowrap;
    }
    .header-back:hover { background: #dbeafe; }
    .header-title { font-size: 17px; font-weight: bold; color: #1e3a5f; }
    .header-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .container { max-width: 980px; margin: 0 auto; padding: 32px 20px 60px; }
    .intro {
      background: white; border-radius: 14px; padding: 22px 26px; margin-bottom: 28px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .intro h1 { font-size: 24px; color: #1f2937; margin: 0 0 10px; }
    .intro p { margin: 0 0 8px; color: #4b5563; font-size: 14px; }
    .intro .stats { font-size: 13px; color: #2563EB; font-weight: 500; }
    .group {
      background: white; border-radius: 14px; padding: 20px 22px; margin-bottom: 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .group-title {
      font-size: 17px; font-weight: bold; color: #1f2937; margin: 0 0 14px;
      padding-bottom: 10px; border-bottom: 2px solid #e5e7eb; display: flex; align-items: center; gap: 8px;
    }
    .group-count { font-size: 13px; color: #9ca3af; font-weight: normal; }
    .dots { display: inline-flex; gap: 4px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
    .poi-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .poi-item {
      display: flex; flex-direction: column; gap: 3px; padding: 12px 14px;
      background: #f9fafb; border: 1px solid #eef2f7; border-radius: 10px;
      text-decoration: none; transition: all 0.2s; position: relative; padding-left: 18px;
    }
    .poi-item:hover { background: #eff6ff; border-color: #bfdbfe; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(37,99,235,0.1); }
    .poi-dot { position: absolute; left: 8px; top: 16px; width: 7px; height: 7px; border-radius: 50%; }
    .poi-name { font-size: 14px; font-weight: 600; color: #1f2937; }
    .poi-cat { font-size: 11px; color: #6b7280; }
    .poi-extra { font-size: 11px; color: #9ca3af; }
    .poi-coord { font-size: 10px; color: #b0b8c4; font-family: 'Courier New', monospace; }
    .footer {
      text-align: center; font-size: 12px; color: #9ca3af; padding: 24px 0 0; line-height: 1.7;
    }
    .footer a { color: #2563EB; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    @media (max-width: 600px) {
      .header { padding: 12px 16px; }
      .container { padding: 20px 12px 48px; }
      .intro { padding: 16px 18px; }
      .intro h1 { font-size: 20px; }
      .group { padding: 16px 14px; }
      .poi-list { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <a class="header-back" href="index.html">← 返回地图 / Back to Map</a>
    <div>
      <div class="header-title">校园地点目录 / Campus POI Directory</div>
      <div class="header-sub">BNBU Map · 共 ${pois.length} 个地点 · ${ts}</div>
    </div>
  </div>

  <div class="container">
    <div class="intro">
      <h1>BNBU Campus POI Directory | BNBU 校园地点目录</h1>
      <p>A complete directory of points of interest on the Beijing Normal University-Hong Kong Baptist University (BNBU) campus — including academic buildings, dormitories, restaurants, cafes, shops, offices, parking, healthcare and tourism facilities. Each entry links back to the interactive map.</p>
      <p>北京师范大学-香港浸会大学联合国际学院（BNBU）校园兴趣点完整目录，涵盖教学楼、宿舍楼、餐厅、咖啡厅、商店、办公室、停车场、医疗与旅游设施等。每个地点均可点击跳转至互动地图对应位置。</p>
      <p class="stats">${pois.length} 个地点 · ${groupOrder.filter(gk => grouped[gk]).length} 个分类</p>
    </div>

${sectionsHtml}

    <div class="footer">
      Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL) ·
      Updated daily via Overpass API<br>
      <a href="index.html">互动地图</a> ·
      <a href="comments.html">全部评论</a> ·
      <a href="privacy.html">隐私政策</a> ·
      <a href="https://github.com/HaoTian22/BNBU-Map/issues" target="_blank" rel="noopener">反馈</a>
    </div>
  </div>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, 'poi-directory.html'), html, 'utf8');
console.log(`✓ 已生成 poi-directory.html（${pois.length} 个 POI，${groupOrder.filter(gk => grouped[gk]).length} 个分组）`);
