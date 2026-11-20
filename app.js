/* Mood Pick — 기분 해시태그로 영화·애니 추천 (AI API 없음, 정적 데이터 + 규칙) */
'use strict';

const GROUPS = [
  { id: 'sad',     icon: '😢', name: '슬플 때',            hue: 225, tags: ['#혼자있고싶어', '#우울해', '#펑펑울고싶어', '#이별했어'] },
  { id: 'fun',     icon: '😆', name: '신나고 싶을 때',      hue: 40,  tags: ['#실컷웃고싶어', '#같이떠들고싶어', '#스트레스풀기', '#아무생각없이'] },
  { id: 'love',    icon: '💗', name: '설레고 싶을 때',      hue: 335, tags: ['#설레고싶어', '#첫사랑', '#연애하고싶어', '#두근두근'] },
  { id: 'comfort', icon: '🫂', name: '위로받고 싶을 때',    hue: 150, tags: ['#위로받고싶어', '#힘든하루', '#따뜻한이야기', '#나만그런거아냐'] },
  { id: 'thrill',  icon: '🔥', name: '자극이 필요할 때',    hue: 10,  tags: ['#의욕없어', '#심장쫄깃', '#통쾌하게', '#반전'] },
  { id: 'mood',    icon: '🌙', name: '분위기 타고 싶을 때', hue: 265, tags: ['#새벽감성', '#비오는날', '#잔잔하게', '#곱씹고싶어'] },
];
const ALL_TAGS = GROUPS.flatMap(g => g.tags);
const MAX_PICK = 3;      // 한 번에 고를 수 있는 해시태그
const MAX_RESULTS = 5;   // 추천 카드 수
const KEY_FAVS = 'moodpick.favs';
const KEY_LOGS = 'moodpick.logs';

/* ---------- 상태 ---------- */
let WORKS = [];
const state = {
  screen: 'home',
  openGroup: null,         // 펼친 기분 그룹 id
  picked: [],              // 고른 해시태그
  last: null,              // { mode: 'recommend'|'random', tags, items }
  mineTab: 'favs',         // 'favs' | 'logs'
  logFilter: null,         // 감상 기록 필터 해시태그
};

/* ---------- 저장소 (localStorage) ---------- */
function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { toast('저장 공간이 부족하거나 막혀 있어요'); return false; }
}
const getFavs = () => load(KEY_FAVS, []);
const getLogs = () => load(KEY_LOGS, []);

/* ---------- 작은 도우미 ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
// replaceChildren은 null/배열을 글자로 바꿔 버리므로, 걸러서 넣는다
function mount(root, ...kids) {
  root.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
}
const $ = (sel) => document.querySelector(sel);
const byId = (id) => WORKS.find(w => w.id === id);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
function hueOf(str) { let n = 0; for (const c of str) n = (n * 31 + c.charCodeAt(0)) % 360; return n; }
function today() { return new Date().toLocaleDateString('sv-SE'); }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- 추천 로직 ---------- */
function recommend(tags) {
  const scored = shuffle(WORKS)   // 먼저 섞어서 점수가 같으면 매번 다른 순서가 나오게
    .map(w => ({ w, score: w.tags.filter(t => tags.includes(t)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map(x => x.w);
}
function pickRandom(tags, excludeId) {
  let pool = tags.length ? WORKS.filter(w => w.tags.some(t => tags.includes(t))) : WORKS;
  if (!pool.length) pool = WORKS;
  const others = pool.filter(w => w.id !== excludeId);
  const list = others.length ? others : pool;
  return list[Math.floor(Math.random() * list.length)];
}

/* ---------- 화면 전환 ---------- */
function show(name) {
  state.screen = name;
  for (const s of ['home', 'result', 'mine']) $('#screen-' + s).hidden = s !== name;
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.screen === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  if (name === 'home') renderHome();
  if (name === 'result') renderResult();
  if (name === 'mine') renderMine();
  window.scrollTo(0, 0);
}

/* ---------- 홈 ---------- */
function renderHome() {
  const root = $('#screen-home');
  const n = state.picked.length;

  mount(root,
    h('h1', { class: 'hero' }, '오늘 마음은', h('br'), '어떤가요?'),
    h('p', { class: 'sub' }, `가까운 기분을 열고, 마음에 닿는 해시태그를 ${MAX_PICK}개까지 골라 주세요.`),

    h('div', { class: 'rows', role: 'list', 'aria-label': '기분 그룹' },
      GROUPS.map(g => {
        const open = g.id === state.openGroup;
        const cnt = state.picked.filter(t => g.tags.includes(t)).length;
        return h('div', { class: 'row-wrap', role: 'listitem' },
          h('button', {
            class: 'row', style: `--h:${g.hue}`, 'aria-expanded': String(open),
            onclick: () => { state.openGroup = open ? null : g.id; renderHome(); },
          },
            h('span', { class: 'row-ico', 'aria-hidden': 'true' }, g.icon),
            h('span', { class: 'row-name' }, g.name),
            cnt ? h('span', { class: 'row-badge' }, cnt) : null,
            h('span', { class: 'row-chev', 'aria-hidden': 'true' }, '›'),
          ),
          open ? h('div', { class: 'row-body' }, g.tags.map(t => tagChip(t))) : null,
        );
      })),

    // 하단 고정 버튼 (토스처럼 큰 버튼 하나가 항상 아래에 있음)
    h('div', { class: 'cta-bar' },
      h('button', { class: 'btn primary block', disabled: n === 0, onclick: doRecommend },
        n === 0 ? '기분을 골라 주세요' : `추천받기 · ${n}개 선택`),
      h('button', { class: 'link', onclick: doRandom }, '🎲 고르기 귀찮다면, 랜덤으로 뽑아볼래요'),
    ),
  );
}

function tagChip(t) {
  const on = state.picked.includes(t);
  return h('button', { class: 'chip', 'aria-pressed': String(on), onclick: () => toggleTag(t) }, t);
}
function toggleTag(t) {
  const i = state.picked.indexOf(t);
  if (i >= 0) state.picked.splice(i, 1);
  else if (state.picked.length >= MAX_PICK) { toast(`해시태그는 최대 ${MAX_PICK}개까지 고를 수 있어요`); return; }
  else state.picked.push(t);
  renderHome();
}

function doRecommend() {
  const items = recommend(state.picked);
  state.last = { mode: 'recommend', tags: state.picked.slice(), items };
  show('result');
}
function doRandom() {
  const w = pickRandom(state.picked, null);
  state.last = { mode: 'random', tags: state.picked.slice(), items: [w] };
  show('result');
}

/* ---------- 작품 카드 ---------- */
function thumb(w) {
  const hue = hueOf(w.id + w.title);
  const box = h('div', { class: 'thumb', style: `background:linear-gradient(150deg,hsl(${hue} 85% 91%),hsl(${(hue + 40) % 360} 80% 83%));--tc:hsl(${hue} 45% 32%)` });
  if (w.poster) {
    const img = h('img', { src: w.poster, alt: `${w.title} 포스터`, loading: 'lazy' });
    img.addEventListener('error', () => img.remove());   // 포스터가 안 뜨면 색상 카드로 대체
    box.append(h('span', { class: 't-letter', 'aria-hidden': 'true' }, [...w.title][0]), img);
  } else {
    box.append(h('span', { class: 't-letter', 'aria-hidden': 'true' }, [...w.title][0]));
  }
  box.append(h('span', { class: 't-type' }, w.type === 'anime' ? '애니' : '영화'));
  return box;
}

function workCard(w, matchTags, opts = {}) {
  const favs = getFavs();
  const isFav = favs.includes(w.id);
  return h('article', { class: 'card' },
    thumb(w),
    h('div', {},
      h('h3', {}, w.title),
      h('p', { class: 'meta' }, `${w.year} · ${w.runtime}`),
      h('p', { class: 'reason' }, w.reason),
      h('div', { class: 'tags' }, w.tags.map(t => h('span', { class: 'tag' + (matchTags.includes(t) ? ' match' : '') }, t))),
      (w.providers && w.providers.length)
        ? h('p', { class: 'providers' }, `시청: ${w.providers.join(', ')}${w.providersCheckedAt ? ` (${w.providersCheckedAt} 확인)` : ''}`)
        : null,
      h('div', { class: 'card-actions' },
        h('button', {
          class: 'btn small', 'aria-pressed': String(isFav), 'aria-label': isFav ? '찜 해제' : '찜하기',
          onclick: () => { toggleFav(w.id); opts.rerender && opts.rerender(); },
        }, isFav ? '❤️ 찜함' : '🤍 찜'),
        h('button', { class: 'btn small', onclick: () => openLogSheet(w, opts.defaultTags || []) }, '📝 기록하기'),
      ),
    ),
  );
}

function toggleFav(id) {
  const favs = getFavs();
  const i = favs.indexOf(id);
  if (i >= 0) { favs.splice(i, 1); toast('찜을 해제했어요'); }
  else { favs.unshift(id); toast('찜 목록에 담았어요'); }
  save(KEY_FAVS, favs);
}

/* ---------- 추천 결과 ---------- */
function renderResult() {
  const root = $('#screen-result');
  const last = state.last;

  if (!last) {
    mount(root,
      h('p', { class: 'eyebrow' }, 'RESULT'),
      h('h2', { class: 'title' }, '아직 고른 기분이 없어요'),
      h('div', { class: 'empty' },
        h('span', { class: 'e-ico', 'aria-hidden': 'true' }, '🌙'),
        h('p', {}, '홈에서 오늘의 기분을 골라 보세요.'),
        h('button', { class: 'btn primary', onclick: () => show('home') }, '홈으로 가기')));
    return;
  }

  const rerender = () => renderResult();
  const isRandom = last.mode === 'random';
  const heading = isRandom ? '오늘은 이 작품 어때요?' : (last.items.length ? '이런 작품들이 마음에 닿을 거예요' : '딱 맞는 작품을 못 찾았어요');

  mount(root,
    h('p', { class: 'eyebrow' }, isRandom ? 'RANDOM PICK' : 'FOR YOUR MOOD'),
    h('h2', { class: 'title' }, heading),
    last.tags.length ? h('div', { class: 'chips picked' }, last.tags.map(t => h('span', { class: 'chip sm on static' }, t))) : null,

    last.items.length
      ? h('div', { class: 'cards' }, last.items.map(w => workCard(w, last.tags, { rerender, defaultTags: last.tags })))
      : h('div', { class: 'empty' },
          h('span', { class: 'e-ico', 'aria-hidden': 'true' }, '🫥'),
          h('p', {}, '고른 해시태그와 겹치는 작품이 아직 없어요. 다른 태그를 골라 보거나 랜덤 뽑기를 해 보세요.')),

    h('div', { class: 'actions two' },
      isRandom
        ? h('button', { class: 'btn primary', onclick: () => { state.last = { mode: 'random', tags: last.tags, items: [pickRandom(last.tags, last.items[0] && last.items[0].id)] }; renderResult(); window.scrollTo(0, 0); } }, '🎲 한 번 더')
        : h('button', { class: 'btn primary', onclick: () => { state.last = { mode: 'recommend', tags: last.tags, items: recommend(last.tags) }; renderResult(); window.scrollTo(0, 0); } }, '🔄 다시 추천받기'),
      h('button', { class: 'btn', onclick: () => show('home') }, '기분 다시 고르기')),
  );
}

/* ---------- 내 기록 (찜 / 감상 기록) ---------- */
function renderMine() {
  const root = $('#screen-mine');
  const rerender = () => renderMine();

  const seg = h('div', { class: 'seg', role: 'tablist' },
    h('button', { role: 'tab', 'aria-selected': String(state.mineTab === 'favs'), onclick: () => { state.mineTab = 'favs'; renderMine(); } }, '❤️ 찜'),
    h('button', { role: 'tab', 'aria-selected': String(state.mineTab === 'logs'), onclick: () => { state.mineTab = 'logs'; renderMine(); } }, '📝 감상 기록'));

  let body;
  if (state.mineTab === 'favs') {
    const items = getFavs().map(byId).filter(Boolean);
    body = items.length
      ? h('div', { class: 'cards' }, items.map(w => workCard(w, [], { rerender })))
      : emptyBox('🤍', '아직 찜한 작품이 없어요.', '추천 받으러 가기');
  } else {
    body = renderLogs();
  }

  mount(root,
    h('p', { class: 'eyebrow' }, 'MY SHELF'),
    h('h2', { class: 'title' }, '내 기록'),
    h('p', { class: 'sub' }, '이 기기에만 저장돼요. 로그인은 필요 없어요.'),
    seg, body);
}

function emptyBox(ico, msg, btnLabel) {
  return h('div', { class: 'empty' },
    h('span', { class: 'e-ico', 'aria-hidden': 'true' }, ico),
    h('p', {}, msg),
    h('button', { class: 'btn primary', onclick: () => show('home') }, btnLabel));
}

function renderLogs() {
  const logs = getLogs();
  if (!logs.length) return emptyBox('📒', '아직 남긴 감상이 없어요. 본 작품에 별점과 한 줄을 남겨 보세요.', '작품 찾으러 가기');

  const used = ALL_TAGS.filter(t => logs.some(l => (l.tags || []).includes(t)));
  if (state.logFilter && !used.includes(state.logFilter)) state.logFilter = null;
  const shown = state.logFilter ? logs.filter(l => (l.tags || []).includes(state.logFilter)) : logs;

  return h('div', {},
    h('div', { class: 'filters', role: 'group', 'aria-label': '해시태그로 거르기' },
      h('button', { class: 'chip sm', 'aria-pressed': String(!state.logFilter), onclick: () => { state.logFilter = null; renderMine(); } }, '전체'),
      used.map(t => h('button', { class: 'chip sm', 'aria-pressed': String(state.logFilter === t), onclick: () => { state.logFilter = t; renderMine(); } }, t))),
    h('div', { class: 'cards', style: 'margin-top:4px' }, shown.map(l => {
      const w = byId(l.workId);
      return h('article', { class: 'log' },
        h('div', { class: 'log-top' }, h('h3', {}, w ? w.title : '(삭제된 작품)'), h('span', { class: 'date' }, l.date)),
        h('div', { class: 'stars', 'aria-label': `별점 ${l.rating}점` }, '★'.repeat(l.rating) + '☆'.repeat(5 - l.rating)),
        l.comment ? h('p', { class: 'comment' }, l.comment) : null,
        h('div', { class: 'tags' }, (l.tags || []).map(t => h('span', { class: 'tag' }, t))),
        h('button', { class: 'btn small ghost danger', onclick: () => { if (confirm('이 기록을 삭제할까요?')) { save(KEY_LOGS, getLogs().filter(x => x.id !== l.id)); renderMine(); toast('기록을 삭제했어요'); } } }, '삭제'));
    })));
}

/* ---------- 기록 작성 시트 ---------- */
function openLogSheet(w, defaultTags) {
  const root = $('#sheet-root');
  let rating = 4;
  let tags = defaultTags.slice(0, 4);
  let comment = '';

  const close = () => { mount(root,); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const rateBox = h('div', { class: 'rate', role: 'radiogroup', 'aria-label': '별점' });
  const drawStars = () => rateBox.replaceChildren(...[1, 2, 3, 4, 5].map(n =>
    h('button', { class: n <= rating ? 'on' : '', role: 'radio', 'aria-checked': String(n === rating), 'aria-label': `${n}점`, onclick: () => { rating = n; drawStars(); } }, '★')));
  drawStars();

  const tagBox = h('div', { class: 'chips' });
  const drawTags = () => tagBox.replaceChildren(...ALL_TAGS.map(t =>
    h('button', { class: 'chip sm', 'aria-pressed': String(tags.includes(t)), onclick: () => {
      const i = tags.indexOf(t);
      if (i >= 0) tags.splice(i, 1);
      else if (tags.length >= 4) { toast('기분 태그는 최대 4개까지예요'); return; }
      else tags.push(t);
      drawTags();
    } }, t)));
  drawTags();

  const counter = h('p', { class: 'counter' }, '0/100');
  const ta = h('textarea', { maxlength: '100', placeholder: '이 작품을 보고 어떤 마음이 들었나요?', 'aria-label': '한 줄 감상' });
  ta.addEventListener('input', () => { comment = ta.value; counter.textContent = `${ta.value.length}/100`; });

  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${w.title} 기록하기` },
    h('h2', {}, w.title),
    h('p', { class: 's-sub' }, '본 뒤의 마음을 남겨 두세요.'),
    h('p', { class: 'field-label' }, '별점'), rateBox,
    h('p', { class: 'field-label' }, '한 줄 감상'), ta, counter,
    h('p', { class: 'field-label' }, '그때의 기분 (최대 4개)'), tagBox,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: close }, '취소'),
      h('button', { class: 'btn primary', onclick: () => {
        const logs = getLogs();
        logs.unshift({ id: 'l' + Date.now(), workId: w.id, rating, comment: comment.trim(), tags: tags.slice(), date: today() });
        if (save(KEY_LOGS, logs)) { close(); toast('기록을 저장했어요'); if (state.screen === 'mine') renderMine(); }
      } }, '저장하기')));

  const backdrop = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, sheet);
  mount(root,backdrop);
}

/* ---------- 시작 ---------- */
async function init() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.screen)));
  try {
    const res = await fetch('data/works.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    WORKS = await res.json();
  } catch (e) {
    $('#screen-home').replaceChildren(
      h('h2', { class: 'title' }, '작품 정보를 불러오지 못했어요'),
      h('p', { class: 'sub' }, '인터넷 연결을 확인하고 다시 시도해 주세요.'),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, '다시 시도'));
    return;
  }
  show('home');
}
init();
