// 静态设计原型：仅演示信息层级与响应式布局，不读取或修改游戏存档。
const params = new URLSearchParams(location.search);
const variant = ['a', 'b', 'c'].includes(params.get('theme'))
  ? params.get('theme')
  : 'a';
const embedded = params.get('view') === 'app';
const root = document.querySelector('#proposal');
const schemes = {
  a: {
    name: '石墨',
    line: '克制的暗色 · 清晰的操作层级',
    note: '棋盘居中，详细信息集中到一个侧栏。手机用底部面板承接人物和房间操作。',
    tags: ['低饱和石墨灰', '单一信息侧栏', '固定底部操作'],
  },
  b: {
    name: '纸面',
    line: '暖白与墨色 · 轻盈的数字桌游',
    note: '桌游说明书般的排版，左侧管理人物，棋盘保留留白。手机用页签切换地图和资料。',
    tags: ['暖白阅读界面', '人物侧栏', '页签式手机布局'],
  },
  c: {
    name: '夜巡',
    line: '地图优先 · 沉静的探索空间',
    note: '沿用原有房间美术，将地图铺满视野，状态和行动贴近底部。手机保留地图，按需展开操作抽屉。',
    tags: ['复用原有房间图', '全幅地图', '轻量浮动操作台'],
  },
};
const paths = {
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z"/><path d="M9 3v16M15 5v16"/>',
  users:
    '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
  book: '<path d="M4 3h7a4 4 0 0 1 4 4v14a4 4 0 0 0-4-3H4V3ZM15 7a4 4 0 0 1 4-4h2v15h-2a4 4 0 0 0-4 3"/>',
  bag: '<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2M9 12h6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
  locate:
    '<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01"/>',
  ring: '<circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="4"/><path d="m9 5 3-3 3 3"/>',
  pistol: '<path d="M3 6h17v5H9l3 9H6l-2-9H3V6Zm9 5v4h4v-4M20 7h2v3h-2"/>',
  potion:
    '<path d="M9 3h6M10 3v6l-5 8a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-8V3M7 15h10"/>',
};
const icon = (id) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id] || paths.info}</svg>`;
const portrait = (id, cls = '') =>
  `<img class="portrait ${cls}" src="../../public/art/portraits/${id}.png" alt="" />`;
const itemIcon = (id) =>
  `<img class="item-symbol" src="../../public/art/game-icons/${id}.svg" alt="" />`;

if (!embedded) {
  const selected = schemes[variant];
  document.body.className = 'gallery';
  root.innerHTML = `<header class="gallery-head"><div><span class="proposal-label">预兆之屋 / 界面方向研究</span><h1>${variant.toUpperCase()} · ${selected.name}<span>${selected.line}</span></h1></div><nav aria-label="选择设计方向">${Object.entries(
    schemes,
  )
    .map(
      ([key, value]) =>
        `<a class="${key === variant ? 'selected' : ''}" href="?theme=${key}">${key.toUpperCase()} ${value.name}</a>`,
    )
    .join('')}</nav></header>
  <section class="showcase" aria-label="桌面与手机对比"><div class="desktop-preview"><div class="preview-caption">桌面 · 1440 × 960 <a href="/docs/ui-proposals/index.html?view=app&theme=${variant}" target="_blank">打开原型 ↗</a></div><div class="desktop-crop"><iframe title="桌面版设计" src="/docs/ui-proposals/index.html?view=app&theme=${variant}"></iframe></div></div><div class="phone-preview"><div class="preview-caption">手机 · 390 × 844</div><div class="phone-crop"><iframe title="手机版设计" src="/docs/ui-proposals/index.html?view=app&theme=${variant}"></iframe></div></div></section>
  <footer class="gallery-foot"><p>${selected.note}</p><div>${selected.tags.map((tag) => `<span>${tag}</span>`).join('')}</div><small>静态交互原型 · 使用现有头像与物品图标 · 地图为布局示意，不代表真实门路与结算结果</small></footer>`;
} else {
  document.body.className = `theme-${variant} app-preview`;
}

const rooms = [
  { name: '图书室', x: 110, y: 90, kind: 'visited', art: 'shelf' },
  { name: '音乐室', x: 300, y: 90, kind: 'reachable', art: 'piano' },
  { name: '探索新房间', x: 490, y: 90, kind: 'frontier', art: '' },
  { name: '长廊', x: 110, y: 250, kind: 'reachable', art: 'hall' },
  { name: '门厅', x: 300, y: 250, kind: 'current', art: 'foyer' },
  { name: '实验室', x: 490, y: 250, kind: 'reachable', art: 'lab' },
  { name: '温室', x: 110, y: 410, kind: 'visited', art: 'garden' },
  { name: '大楼梯', x: 300, y: 410, kind: 'reachable', art: 'stairs' },
  { name: '锅炉房', x: 490, y: 410, kind: 'visited', art: 'boiler' },
];
function furniture(kind) {
  const details = {
    shelf:
      '<path d="M20 14v48h12V14m14 0v48h12V14m14 0v48h12V14"/><rect x="45" y="76" width="70" height="22" rx="2"/>',
    piano:
      '<path d="M45 25h65v40H45zM45 25l48-14 17 14M50 67v15m50-15v15M55 88h42v10H55z"/><path d="M51 56h54m-48 0v8m9-8v8m9-8v8m9-8v8m9-8v8"/>',
    hall: '<rect x="60" y="14" width="44" height="90" rx="2"/><path d="M14 28h18v20H14zm118 43h18v20h-18z"/>',
    foyer:
      '<rect x="32" y="24" width="100" height="75" rx="3"/><rect x="42" y="34" width="80" height="55" rx="2"/><circle cx="82" cy="61" r="20"/>',
    lab: '<path d="M16 16h130v22H16zm14 50h104v22H30z"/><circle cx="49" cy="25" r="6"/><circle cx="110" cy="25" r="6"/><path d="M58 66v22m44-22v22"/>',
    garden:
      '<path d="M20 16h34v30H20zm80 0h40v30h-40zM20 78h34v30H20zm80 0h40v30h-40z"/><circle cx="35" cy="31" r="9"/><circle cx="120" cy="31" r="11"/><circle cx="35" cy="92" r="10"/><circle cx="120" cy="92" r="10"/>',
    stairs:
      '<path d="M46 14h72v90H46zm0 12h72M46 38h72M46 50h72M46 62h72M46 74h72M46 86h72"/>',
    boiler:
      '<circle cx="82" cy="53" r="33"/><circle cx="82" cy="53" r="23"/><path d="M20 14h32v14H20zm91 75h30v15h-30zM82 20V8m33 45h37M49 53H12"/>',
  };
  return `<g class="furniture" fill="none" stroke="currentColor" stroke-width="1.4">${details[kind] || ''}</g>`;
}
// 与正式游戏的图集编号一致；只是原型展示，不创建另一份美术资源。
const roomAtlas = {
  shelf: 1,
  piano: 3,
  hall: 8,
  foyer: 0,
  lab: 7,
  garden: 5,
  stairs: 0,
  boiler: 7,
};
function roomArtwork(room) {
  if (variant !== 'c')
    return `<g transform="translate(4 4)">${furniture(room.art)}</g>`;
  const tile = roomAtlas[room.art];
  return `<foreignObject class="original-room-art" x="0" y="0" width="170" height="170" pointer-events="none"><div xmlns="http://www.w3.org/1999/xhtml" class="room-atlas" style="background-position:${(tile % 3) * 50}% ${Math.floor(tile / 3) * 50}%"></div></foreignObject><rect class="room-outline overlay-outline" x="0" y="0" width="170" height="170" rx="3"/>`;
}
const roomIndicators = {
  图书室: [
    {
      label: '物品 2',
      detail: '地面物品：家族戒指、急救箱（示例）。进入房间后可查看并拾取。',
      kind: 'item',
    },
  ],
  音乐室: [
    {
      label: '☾ 月光',
      detail: '月光：本室狼人力量值 +1，不移动属性轨道。',
      kind: 'effect',
    },
  ],
  长廊: [
    {
      label: '⌁ 捕兽夹',
      detail: '友方捕兽夹：友方免触发；敌方进入时受2点身体伤害并停止移动。',
      kind: 'trap',
    },
    {
      label: '≋ 蒸汽',
      detail:
        '蒸汽：每名角色在每个受影响房间首次进入或开始回合时进行速度4+检定；失败受到1点肉体伤害并停止移动。',
      kind: 'effect',
    },
  ],
  实验室: [
    {
      label: '◆ 标记 2',
      detail: '房间指示物：示例计数为2；具体作用由当前剧本说明。',
      kind: 'marker',
    },
  ],
  大楼梯: [
    {
      label: '↕ 二楼',
      detail: '楼梯连接二楼平台；上下楼需要符合移动规则。',
      kind: 'stairs',
    },
  ],
  锅炉房: [
    {
      label: '◉ 阀门开启',
      detail: '锅炉房蒸汽阀已开启，蒸汽喷入相邻房间。',
      kind: 'marker',
    },
  ],
};
function indicatorMarkup(room) {
  if (variant !== 'c') return '';
  return (roomIndicators[room.name] || [])
    .map(
      (indicator, index) =>
        `<g class="map-indicator indicator-${indicator.kind}" transform="translate(7 ${8 + index * 26})"><title>${indicator.detail}</title><rect width="${indicator.label.length * 11 + 15}" height="23" rx="4"/><text x="7" y="16">${indicator.label}</text></g>`,
    )
    .join('');
}
function mapMarkup() {
  const square = variant === 'c';
  const height = square ? 170 : 140;
  return `<svg class="manor-map" viewBox="0 0 770 ${square ? 740 : 650}" role="group" aria-label="宅邸平面示意：门厅为当前位置，可选择房间查看"><defs><pattern id="floor" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 20V0h20" fill="none" stroke="currentColor" opacity=".06"/></pattern></defs>
  <g class="map-connectors" fill="none" stroke="currentColor" stroke-width="2"><path d="${square ? 'M385 240v20M385 430v20M195 240v20M195 430v20M575 430v20M280 345h20M470 345h20M280 535h20M470 535h20M280 155h20' : 'M385 230v20M385 390v20M195 230v20M195 390v20M575 390v20M280 320h20M470 320h20M280 480h20M470 480h20M280 160h20'}"/></g>
  ${rooms
    .map(
      (
        room,
      ) => `<g class="map-room ${room.kind}" data-room="${room.name}" transform="translate(${room.x} ${square ? 70 + Math.round((room.y - 90) / 160) * 190 : room.y})" tabindex="0" role="button" aria-label="查看${room.name}${variant === 'c' ? (roomIndicators[room.name] || []).map((entry) => '，' + entry.label).join('') : ''}"><title>${room.name}${variant === 'c' ? (roomIndicators[room.name] || []).map((entry) => '：' + entry.detail).join('') : ''}</title>
  <rect class="room-outline" x="0" y="0" width="170" height="${height}" rx="3"/><rect class="room-floor" x="5" y="5" width="160" height="${height - 10}" fill="url(#floor)" rx="1"/>
  ${room.kind === 'frontier' ? '<path class="explore-plus" d="M78 45v24m-12-12h24" fill="none" stroke="currentColor" stroke-width="1.5"/>' : `${roomArtwork(room)}<path class="door" d="M72 0h26M0 ${square ? 72 : 56}v26M170 ${square ? 72 : 56}v26M72 ${height}h26"/>`}
  ${indicatorMarkup(room)}
  <text x="85" y="${square ? 153 : 119}" text-anchor="middle">${room.name}</text>
  ${room.kind === 'current' ? `<g class="you-token" transform="translate(85 ${square ? 85 : 62})"><circle r="22"/><image href="../../public/art/portraits/lin-lan.png" x="-17" y="-17" width="34" height="34" clip-path="circle(17px at 17px 17px)"/></g><rect class="current-label-bg" x="55" y="-12" width="60" height="20" rx="3"/><text class="current-label" x="85" y="2" text-anchor="middle">当前位置</text>` : ''}
  ${room.name === '温室' ? `<g class="enemy-token" transform="translate(85 ${square ? 85 : 60})"><circle r="17"/><image href="../../public/art/game-icons/wolf.svg" x="-11" y="-11" width="22" height="22"/></g>` : ''}
  </g>`,
    )
    .join('')}
  <text class="map-wing" x="385" y="44" text-anchor="middle">宅 邸 · 东 翼</text><text class="map-wing lower" x="385" y="${square ? 700 : 610}" text-anchor="middle">通 往 庭 院</text></svg>`;
}
const heroValues = [
  { name: '力量', current: 4, track: [2, 3, 3, 4, 5, 5, 6, 7] },
  { name: '速度', current: 5, track: [2, 3, 4, 5, 5, 6, 7, 8] },
  { name: '理智', current: 4, track: [2, 3, 3, 4, 5, 6, 6, 7] },
  { name: '知识', current: 5, track: [1, 2, 3, 4, 5, 5, 6, 7] },
];
function heroMarkup() {
  const values = heroValues;
  return `<section class="hero-block"><div class="hero-heading">${portrait('lin-lan')}<div><strong>林岚</strong><span>调查员 · 你的回合</span></div><span class="move-count">${icon('arrow')}<b>4</b><small>移动</small></span></div><div class="traits">${values.map(({ name, current, track }) => `<div class="trait"><span>${name}</span><div>${track.map((n, i) => `<i class="${i === (name === '速度' ? 3 : name === '知识' ? 4 : 3) ? 'marked' : ''}">${n}</i>`).join('')}</div><b>${current}</b></div>`).join('')}</div><div class="statuses"><button data-demo="status"><span class="status-dot"></span>感染Ⅰ ${icon('info')}</button></div></section>`;
}
function compactTracks() {
  return `<div class="compact-track-list" aria-label="人物属性轨道">${heroValues.map(({ name, track }, index) => `<div class="compact-track"><span>${name}</span><div>${track.map((value, position) => `<i class="${position === (index === 3 ? 4 : 3) ? 'marked' : ''}">${value}</i>`).join('')}</div></div>`).join('')}</div>`;
}
function bagMarkup() {
  return `<section class="inventory"><div class="section-title"><h3>随身物品</h3><span>3 件</span></div><div class="items"><button data-item="家族戒指">${icon('ring')}<span>家族戒指</span></button><button data-item="力量药剂">${icon('potion')}<span>力量药剂</span></button><button data-item="手枪">${icon('pistol')}<span>手枪</span><small>未装银弹</small></button></div></section>`;
}
function roomMarkup() {
  return `<section class="room-inspector"><div class="section-title"><h3>当前房间</h3>${icon('info')}</div><h2 class="chosen-room">门厅</h2><p class="room-rule">连接宅邸各处的中心。选择相邻房间，继续探索。</p><div class="room-meta"><span>一楼</span><span>布局示例</span></div><div class="room-indicator-details"></div><div class="context-actions"><button data-demo="room" class="primary">选择目的地 ${icon('arrow')}</button><button data-demo="roll">${icon('dice')} 检定示例</button></div></section>`;
}
function renderGame() {
  root.innerHTML = `<div class="game-shell"><header class="game-top"><div class="brand">${icon('map')}<strong>预兆之屋</strong><span>血月之夜</span></div><div class="phase">${icon('moon')}<span>第 3 轮</span><i></i><span>满月</span></div><button class="icon-button" aria-label="更多" data-demo="settings">${icon('more')}</button></header>
  <nav class="team-strip" aria-label="探险队"><span class="team-label">探险队</span><button class="active" data-demo="hero">${portrait('lin-lan')}<span>林岚<small>行动中</small></span></button><button data-demo="hero">${portrait('shen-mo')}<span>沈墨<small>等待</small></span></button><button data-demo="hero">${portrait('gu-ye')}<span>顾野<small>等待</small></span></button><button data-demo="hero">${itemIcon('wolf')}<span>狼人<small>等待</small></span></button><span class="turn-order">林岚 → 沈墨 → 顾野 → 狼人</span></nav>
  <div class="play-area"><aside class="player-side">${heroMarkup()}${bagMarkup()}<div class="side-goal"><span>英雄目标</span><p>击杀初始狼人</p><small>普通伤害只能使其虚弱；寻找银弹。</small></div></aside>
  <section class="board"><div class="board-head"><div class="floor-tabs" role="group" aria-label="查看楼层"><button data-floor="地下室">地下室</button><button data-floor="一楼" class="selected">一楼</button><button data-floor="二楼">二楼</button></div><button class="icon-button" aria-label="定位当前位置" data-demo="locate">${icon('locate')}</button></div><div class="map-viewport">${mapMarkup()}</div><div class="map-bottom"><div class="legend"><span><i class="legend-current"></i>当前位置</span><span><i class="legend-reach"></i>可前往</span><span><i class="legend-other"></i>其他房间</span></div><div class="zoom-controls"><button aria-label="缩小" data-zoom="out">−</button><span>100%</span><button aria-label="放大" data-zoom="in">+</button></div></div><div class="map-toast" role="status" hidden></div></section>
  <aside class="context-side"><div class="context-tabs"><button class="selected" data-tab="room">房间</button><button data-tab="journal">手记</button><button data-tab="goal">目标</button></div><div class="context-content">${roomMarkup()}</div><section class="journal-peek"><div class="section-title"><h3>最近发生</h3><button data-tab="journal">全部 ${icon('arrow')}</button></div><p><i></i>林岚进入门厅<span>本回合</span></p><p><i></i>满月升起<span>第 3 轮</span></p></section></aside></div>
  <footer class="action-dock"><div class="dock-person">${portrait('lin-lan')}<span><strong>林岚</strong><small>门厅 · 移动力 4</small></span></div>${variant === 'c' ? compactTracks() : '<div class="dock-stats"><span>力量<b>4</b></span><span>速度<b>5</b></span><span>理智<b>4</b></span><span>知识<b>5</b></span><button data-demo="status">感染Ⅰ</button></div>'}${variant === 'c' ? '<button class="dock-status" data-demo="status">感染Ⅰ</button>' : ''}<div class="dock-items"><button data-drawer="items">${icon('bag')}<span>物品</span><small>3</small></button><button data-drawer="hero">${icon('users')}<span>人物</span></button><button data-drawer="journal">${icon('book')}<span>手记</span></button></div><span class="dock-hint">选择房间以移动</span><button class="end-turn" data-demo="turn">结束行动 ${icon('arrow')}</button></footer>
  <nav class="mobile-nav"><button class="selected" data-drawer="map">${icon('map')}地图</button><button data-drawer="hero">${icon('users')}人物</button><button data-drawer="items">${icon('bag')}物品</button><button data-drawer="journal">${icon('book')}手记</button></nav>
  <section class="mobile-info"><button class="sheet-handle" aria-label="展开人物与房间" data-drawer="hero"><span></span></button><div class="mobile-person">${portrait('lin-lan')}<div><strong>林岚</strong><span class="status-inline">感染Ⅰ</span><small>门厅 · 移动力 4</small></div>${variant === 'c' ? '' : '<div class="compact-traits"><span>力量<b>4</b></span><span>速度<b>5</b></span><span>理智<b>4</b></span><span>知识<b>5</b></span></div>'}</div>${variant === 'c' ? compactTracks() : ''}<div class="mobile-actions"><button data-demo="room" class="primary">选择目的地 ${icon('arrow')}</button><button data-demo="turn">结束行动</button></div></section>
  <div class="drawer-shade" hidden></div><section class="detail-drawer" role="dialog" aria-modal="true" aria-label="详情" hidden><header><h2>详情</h2><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></header><div class="drawer-content"></div></section></div>`;
  wireInteractions();
  if (innerWidth < 700) {
    const viewport = document.querySelector('.map-viewport');
    const map = document.querySelector('.manor-map');
    viewport.style.display = 'block';
    viewport.scrollLeft = Math.max(
      0,
      (map.clientWidth - viewport.clientWidth) / 2,
    );
    viewport.scrollTop = Math.max(
      0,
      (map.clientHeight - viewport.clientHeight) / 2,
    );
  }
}
function showDrawer(title, html) {
  const drawer = document.querySelector('.detail-drawer');
  drawer.querySelector('h2').textContent = title;
  drawer.querySelector('.drawer-content').innerHTML = html;
  drawer.hidden = false;
  document.querySelector('.drawer-shade').hidden = false;
  drawer.querySelector('[data-close]').focus();
}
function closeDrawer() {
  document.querySelector('.detail-drawer').hidden = true;
  document.querySelector('.drawer-shade').hidden = true;
}
function journalContent() {
  return '<div class="journal-full"><p><b>林岚进入门厅</b><span>第 3 轮 · 本回合</span></p><p><b>满月升起</b><span>第 3 轮开始</span></p><p><b>林岚获得家族戒指</b><span>第 2 轮 · 图书室</span></p></div>';
}
let toastTimer;
function toast(text) {
  const node = document.querySelector('.map-toast');
  clearTimeout(toastTimer);
  node.textContent = text;
  node.hidden = false;
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 2800);
}
function wireInteractions() {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('button, [data-room]');
    if (!target) return;
    if (
      target.hasAttribute('data-close') ||
      target.classList.contains('drawer-shade')
    )
      return closeDrawer();
    if (target.dataset.room) {
      const name = target.dataset.room;
      document
        .querySelectorAll('.map-room')
        .forEach((room) => room.classList.toggle('inspected', room === target));
      document
        .querySelectorAll('.map-room')
        .forEach((room) => room.classList.toggle('inspected', room === target));
      if (!document.querySelector('.chosen-room')) {
        document.querySelector('.context-content').innerHTML = roomMarkup();
        document
          .querySelectorAll('.context-tabs button')
          .forEach((button) =>
            button.classList.toggle('selected', button.dataset.tab === 'room'),
          );
      }
      document.querySelector('.chosen-room').textContent = name;
      document.querySelector('.room-indicator-details').innerHTML = (
        roomIndicators[name] || []
      )
        .map(
          (entry) =>
            `<div class="indicator-detail"><strong>${entry.label}</strong><p>${entry.detail}</p></div>`,
        )
        .join('');
      document.querySelector('.room-inspector .section-title h3').textContent =
        name === '门厅' ? '当前房间' : '房间详情';
      document.querySelector('.room-rule').textContent =
        name === '实验室'
          ? '制备药剂 · 知识 5+。成功后选择一种药剂；失败本次无产出。独立行动每回合一次。'
          : name === '锅炉房'
            ? '开启蒸汽后，进入或开始回合时按房间分别进行速度检定。具体效果在结算前显示。'
            : '静态原型：此处展示房间详情，未执行移动或结算。';
      if (innerWidth < 700 || variant === 'c')
        showDrawer(name, document.querySelector('.room-inspector').outerHTML);
      return;
    }
    if (target.dataset.floor) {
      document
        .querySelectorAll('[data-floor]')
        .forEach((button) =>
          button.classList.toggle('selected', button === target),
        );
      toast(`正在预览${target.dataset.floor}（示意地图）`);
    }
    if (target.dataset.tab) {
      const tab = target.dataset.tab;
      if (tab === 'room')
        document.querySelector('.context-content').innerHTML = roomMarkup();
      else
        document.querySelector('.context-content').innerHTML =
          tab === 'journal'
            ? journalContent()
            : '<section class="room-inspector"><h2>英雄目标</h2><p>击杀初始狼人。</p><p>普通身体伤害使初始狼人虚弱，银弹可以将其击杀。</p></section>';
      document
        .querySelectorAll('.context-tabs button')
        .forEach((button) =>
          button.classList.toggle('selected', button.dataset.tab === tab),
        );
    }
    if (target.dataset.drawer) {
      const kind = target.dataset.drawer;
      if (kind === 'map') return closeDrawer();
      showDrawer(
        kind === 'items'
          ? '随身物品'
          : kind === 'journal'
            ? '探索手记'
            : '林岚',
        kind === 'items'
          ? bagMarkup()
          : kind === 'journal'
            ? journalContent()
            : heroMarkup(),
      );
    }
    if (target.dataset.item)
      showDrawer(
        target.dataset.item,
        `<div class="item-detail"><h3>${target.dataset.item}</h3><p>${target.dataset.item === '家族戒指' ? '每轮一次，可重掷一枚结果为0或2的自己的骰子，必须接受新结果。' : target.dataset.item === '力量药剂' ? '力量轨道右移2格；下次自己的回合开始回退1格，不致死。' : '射程1～2房间。目标进行速度4+检定，失败分配2点身体伤害。'}</p><p class="prototype-note">展示原型，不执行物品效果。</p></div>`,
      );
    if (target.dataset.zoom) {
      const map = document.querySelector('.manor-map');
      const scale = target.dataset.zoom === 'in' ? 1.15 : 1;
      map.style.transform = `scale(${scale})`;
      document.querySelector('.zoom-controls span').textContent =
        `${Math.round(scale * 100)}%`;
    }
    if (target.dataset.demo === 'status')
      showDrawer(
        '感染Ⅰ',
        '<p>感染状态在这里展示来源、具体影响和解除方式。完整内容将在正式界面中直接引用规则定义。</p>',
      );
    if (target.dataset.demo === 'roll')
      showDrawer(
        '检定布局示例',
        `<div class="dice-sample"><h3>制备药剂 · 知识 5+</h3><p>成功：选择一种药剂。失败：本次无产出。</p><div><i>2</i><i>1</i><i>2</i><i>0</i><i>1</i></div><strong>总点数 6</strong><button class="primary" data-close>确认结果</button></div>`,
      );
    if (target.dataset.demo === 'turn')
      toast('轮到沈墨（只演示轻量提示，不切换对局）');
    if (target.dataset.demo === 'room')
      toast('点击地图房间可查看详情；原型不会消耗移动力。');
    if (target.dataset.demo === 'locate')
      document.querySelector('.manor-map').style.transform = '';
    if (target.dataset.demo === 'hero') showDrawer('探险队', heroMarkup());
    if (target.dataset.demo === 'settings')
      showDrawer(
        '原型说明',
        '<p>本页只演示视觉与布局，不接入对局规则、网络或存档。可尝试点击房间、物品、楼层和检定示例。</p>',
      );
  });
  document
    .querySelector('.drawer-shade')
    .addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
    if (
      ['Enter', ' '].includes(event.key) &&
      event.target.matches('[data-room]')
    ) {
      event.preventDefault();
      event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
}

if (embedded) renderGame();
else {
  const preview = document.querySelector('.desktop-crop');
  new ResizeObserver(([entry]) => {
    preview.style.setProperty('--desk-scale', entry.contentRect.width / 1440);
  }).observe(preview);
}
