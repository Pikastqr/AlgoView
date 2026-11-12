/**
 * AlgoView — Pikapurin
 * Pitch Black & Violet Minimalist Dashboard
 */

'use strict';

// ============================================================================
// 1. 7大パラメータ定義 ＆ レートカラー定義
// ============================================================================
const PARAMS = [
  {
    key: 'IMP',
    short: 'IMP',
    name: '実装・構築',
    question: 'Q1. グリッド操作・シミュレーション・条件分岐の実装',
  },
  {
    key: 'DS',
    short: 'DS',
    name: 'データ構造',
    question: 'Q2. Union-Find・優先度付きキュー・Set・セグ木',
  },
  {
    key: 'GRP',
    short: 'GRP',
    name: 'グラフ・木',
    question: 'Q3. BFS/DFS・最短経路・木アルゴリズム',
  },
  {
    key: 'DP',
    short: 'DP',
    name: '動的計画法',
    question: 'Q4. ナップサック・状態設計・bitDP',
  },
  {
    key: 'MTH',
    short: 'MTH',
    name: '数学・数え上げ',
    question: 'Q5. 整数論・素因数分解・MOD・組合せ',
  },
  {
    key: 'INS',
    short: 'INS',
    name: 'ひらめき・考察',
    question: 'Q6. 問題の言い換え・不変量・貪欲法',
  },
  {
    key: 'OPT',
    short: 'OPT',
    name: '探索・高速化',
    question: 'Q7. 二分探索・累積和・尺取り法',
  },
];

const DIAGNOSIS_CHOICES = [
  { label: '基礎 (茶目標)', value: 420 },
  { label: '標準 (茶中位)', value: 560 },
  { label: '応用 (緑目標)', value: 700 },
  { label: '得意 (緑〜水)', value: 880 },
];

const RATING_RINGS = [
  { value: 0, label: '灰 0', color: '#808080', stroke: 'rgba(128, 128, 128, 0.25)' },
  { value: 400, label: '茶 400', color: '#d97706', stroke: 'rgba(180, 83, 9, 0.35)' },
  { value: 800, label: '緑 800', color: '#22c55e', stroke: 'rgba(34, 197, 94, 0.38)' },
  { value: 1200, label: '水 1200', color: '#06b6d4', stroke: 'rgba(6, 182, 212, 0.38)' },
  { value: 1600, label: '青 1600', color: '#3b82f6', stroke: 'rgba(59, 130, 246, 0.42)' },
  { value: 2000, label: '黄 2000', color: '#eab308', stroke: 'rgba(234, 179, 8, 0.52)' },
];

const STORAGE_KEYS = {
  CHECKED_PROBLEMS: 'algoview_checked_problems_v3',
  EARNED_BONUS_MAP: 'algoview_earned_bonus_map_v3',
  LAST_PICKUP_DATE: 'algoview_last_pickup_date_v3',
  AUTO_PRAISED: 'algoview_auto_praised_v3',
};

const LEGACY_KEYS_TO_CLEAR = [
  'algoview_diagnosis_v1',
  'algoview_checked_problems_v1',
  'algoview_earned_bonus_problems_v1',
  'algoview_earned_bonus_map_v1',
  'algoview_last_pickup_date_v1',
  'algoview_auto_praised_v1',
  'algoview_checked_problems_v2',
  'algoview_earned_bonus_map_v2',
  'algoview_last_pickup_date_v2',
  'algoview_auto_praised_v2',
];

// 初期値設定時点（既存の325 AC完了時点）の基準タイムスタンプ
// これより後に新規ACした問題のみ初期値（800/600/200/400/600/600/400）へ加算する
const BASELINE_EPOCH_SECOND = 1794472000;

// ============================================================================
// 2. 日付シード・乱数シャッフルユーティリティ（日替わり自動更新用）
// ============================================================================
function getTodayJstDateString() {
  const now = new Date();
  const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jstTime.toISOString().slice(0, 10); // YYYY-MM-DD (JST)
}

function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSeededRandom(seedStr) {
  let a = hashStringToSeed(seedStr) || 1;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(array, seedStr) {
  const arr = array.slice();
  const rng = createSeededRandom(seedStr);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function inferWeightsAndTagsForProblem(problemId, title, contestId, difficulty) {
  const text = `${problemId} ${title}`.toLowerCase();
  const weights = { IMP: 15, DS: 15, GRP: 10, DP: 10, MTH: 10, INS: 20, OPT: 20 };

  if (/(tree|graph|path|cycle|grid|island|bridge|vertex|edge|road|木|グラフ|経路|連結)/.test(text)) {
    weights.GRP += 40;
  }
  if (/(query|segment|set|map|union|swap|interval|range|bag|queue|クエリ|区間|集合)/.test(text)) {
    weights.DS += 35;
  }
  if (/(mod|prime|gcd|lcm|divis|xor|sum|number|palindrome|count|probab|約数|素数|倍数|余り)/.test(text)) {
    weights.MTH += 35;
  }
  if (/(dp|knapsack|subsequence|stairs|game|choose|partition|最大化|最小化|選び方)/.test(text)) {
    weights.DP += 35;
  }
  if (/(ContestId|arc|agc)/i.test(contestId) && contestId.startsWith('agc')) {
    weights.INS += 40;
  } else if (contestId.startsWith('arc')) {
    weights.INS += 30;
    weights.MTH += 15;
  }

  // 問題IDハッシュで微調整して多様性を持たせる
  const h = hashStringToSeed(problemId);
  const boostKey = PARAMS[h % PARAMS.length].key;
  weights[boostKey] += 25;

  const total = Object.values(weights).reduce((acc, v) => acc + v, 0);
  const norm = {};
  let sumNorm = 0;
  for (const p of PARAMS) {
    norm[p.key] = Math.round((weights[p.key] * 100) / total);
    sumNorm += norm[p.key];
  }
  norm[boostKey] += 100 - sumNorm;

  const sortedKeys = PARAMS.map((p) => p.key).sort((a, b) => norm[b] - norm[a]);
  const tags = sortedKeys.slice(0, 2).map((k) => ({
    param: k,
    arrows: norm[k] >= 40 ? '↑↑↑' : norm[k] >= 25 ? '↑↑' : '↑',
  }));

  return { weights: norm, tags };
}

// ============================================================================
// 3. Modern Web Guidance 準拠 アニメーション＆Top Layer ヘルパー
// ============================================================================
let supportsDisplayTransition;
function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay();
}

async function closeTopLayer(dialogEl) {
  if (!supportsTopLayerExit()) {
    dialogEl.setAttribute('data-closing', '');
    const animations = dialogEl.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    }
    if (!dialogEl.hasAttribute('data-closing')) return;
    dialogEl.removeAttribute('data-closing');
  }
  dialogEl.close();
}

async function hideElement(el) {
  if (canTransitionDisplay()) {
    el.hidden = true;
  } else {
    el.setAttribute('data-closing', '');
  }
  const animations = el.getAnimations();
  if (animations.length > 0) {
    await Promise.race([
      Promise.allSettled(animations.map((a) => a.finished)),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  }
  if (el.hasAttribute('data-closing')) {
    el.removeAttribute('data-closing');
    el.hidden = true;
  }
}

async function removeElement(el) {
  await hideElement(el);
  el.remove();
}

// ============================================================================
// 4. アプリケーション状態管理
// ============================================================================
const state = {
  userSummary: null,
  analyzedProblems: {},
  dailyPool: [], // 典型90・ABC・ARC・AGCの全未AC問題から日替わりシャッフルされた問題リスト
  baseDiagnosis: {
    IMP: 800,
    DS: 600,
    GRP: 200,
    DP: 400,
    MTH: 600,
    INS: 600,
    OPT: 400,
  },
  todayDateStr: getTodayJstDateString(),
  checkedProblemIds: new Set(), // 当日のピックアップ完了表示用（日付変更で自動更新）
  earnedBonusMap: {}, // 獲得済みパラメータボーナス辞書（日付が変わっても永続保持）
  autoPraisedIds: new Set(),
  snapshotAcIds: new Set(),
  liveAcSet: new Set(),
  lastMaxEpochSecond: 0,
  catalogLoaded: false,
  catalogProblems: null,
  catalogModels: null,
  problemMetaById: {},
  syncPromise: null,
  syncShowToast: false,
  radarCurrentValues: { IMP: 0, DS: 0, GRP: 0, DP: 0, MTH: 0, INS: 0, OPT: 0 },
  radarTargetValues: { IMP: 0, DS: 0, GRP: 0, DP: 0, MTH: 0, INS: 0, OPT: 0 },
  radarAnimFrame: null,
  boostedParams: new Set(),
};

// ============================================================================
// 5. AtCoder レート色・丸アイコン生成ユーティリティ
// ============================================================================
function getRatingColor(val) {
  if (val < 400) return '#808080';
  if (val < 800) return '#d97706';
  if (val < 1200) return '#22c55e';
  if (val < 1600) return '#06b6d4';
  if (val < 2000) return '#3b82f6';
  return '#eab308';
}

function getRatingRawHex(val) {
  if (val < 400) return '#808080';
  if (val < 800) return '#b45309';
  if (val < 1200) return '#22c55e';
  if (val < 1600) return '#06b6d4';
  if (val < 2000) return '#3b82f6';
  return '#eab308';
}

function getAtCoderCircleStyle(difficulty) {
  const color = getRatingRawHex(difficulty);
  const ratio = Math.min(100, Math.max(12, Math.round(((difficulty % 400) / 400) * 100)));
  return `border: 1.5px solid ${color}; background: linear-gradient(to top, ${color} ${ratio}%, transparent ${ratio}%);`;
}

function clipDifficulty(rawDiff) {
  if (rawDiff === null || rawDiff === undefined || Number.isNaN(rawDiff)) return null;
  if (rawDiff < 400) {
    return Math.max(1, Math.round(400 / Math.exp(1.0 - rawDiff / 400.0)));
  }
  return Math.round(rawDiff);
}

// ============================================================================
// 6. ローカルストレージ読み書き ＆ 日替わり自動ローテーション判定
// ============================================================================
function loadLocalState() {
  try {
    // テスト時の履歴（v1キー）を完全消去してクリーンな状態で開始する
    for (const oldKey of LEGACY_KEYS_TO_CLEAR) {
      localStorage.removeItem(oldKey);
    }

    const savedEarnedMap = localStorage.getItem(STORAGE_KEYS.EARNED_BONUS_MAP);
    if (savedEarnedMap) {
      state.earnedBonusMap = JSON.parse(savedEarnedMap) || {};
    }

    const todayStr = getTodayJstDateString();
    state.todayDateStr = todayStr;
    const savedDate = localStorage.getItem(STORAGE_KEYS.LAST_PICKUP_DATE);

    if (savedDate === todayStr) {
      const savedChecked = localStorage.getItem(STORAGE_KEYS.CHECKED_PROBLEMS);
      if (savedChecked) {
        state.checkedProblemIds = new Set(JSON.parse(savedChecked));
      }
    } else {
      // 日付が変わっていたら当日のピックアップ表示チェックを自動で新しくする（獲得済みボーナスは維持）
      state.checkedProblemIds = new Set();
      localStorage.setItem(STORAGE_KEYS.LAST_PICKUP_DATE, todayStr);
      localStorage.setItem(STORAGE_KEYS.CHECKED_PROBLEMS, JSON.stringify([]));
    }

    const savedPraised = localStorage.getItem(STORAGE_KEYS.AUTO_PRAISED);
    if (savedPraised) {
      state.autoPraisedIds = new Set(JSON.parse(savedPraised));
    }
  } catch (e) {
    console.warn('localStorage load warning:', e);
  }
}

function saveCheckedProblems() {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_PICKUP_DATE, state.todayDateStr);
    localStorage.setItem(
      STORAGE_KEYS.CHECKED_PROBLEMS,
      JSON.stringify(Array.from(state.checkedProblemIds))
    );
    localStorage.setItem(
      STORAGE_KEYS.EARNED_BONUS_MAP,
      JSON.stringify(state.earnedBonusMap)
    );
  } catch (e) {
    console.warn('localStorage save warning:', e);
  }
}

function saveAutoPraised() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.AUTO_PRAISED,
      JSON.stringify(Array.from(state.autoPraisedIds))
    );
  } catch (e) {
    console.warn('localStorage save warning:', e);
  }
}

// ============================================================================
// 7. パラメータ計算式
// ============================================================================
function calculateParameterBreakdown() {
  const breakdown = {};
  for (const p of PARAMS) {
    breakdown[p.key] = {
      base: state.baseDiagnosis[p.key] || 560,
      acXp: 0,
      pickupBonus: 0,
      total: 0,
    };
  }

  const acList = state.userSummary?.ac_problems || [];
  const acScale = 0.08;
  for (const prob of acList) {
    if ((prob.epoch_second || 0) <= BASELINE_EPOCH_SECOND) continue;
    if (state.earnedBonusMap[prob.problem_id]) continue;
    const weights = prob.weights || state.analyzedProblems[prob.problem_id]?.weights;
    if (!weights) continue;
    const diff = prob.difficulty || 500;
    for (const p of PARAMS) {
      const w = weights[p.key] || 0;
      breakdown[p.key].acXp += diff * (w / 100.0) * acScale;
    }
  }

  const bonusScale = 0.22;
  for (const bonusItem of Object.values(state.earnedBonusMap)) {
    const diff = bonusItem.difficulty || 700;
    const weights = bonusItem.weights || {};
    for (const p of PARAMS) {
      const w = weights[p.key] || 0;
      breakdown[p.key].pickupBonus += diff * (w / 100.0) * bonusScale;
    }
  }

  for (const p of PARAMS) {
    const b = breakdown[p.key];
    b.acXp = Math.round(b.acXp);
    b.pickupBonus = Math.round(b.pickupBonus);
    b.total = Math.min(2000, Math.round(b.base + b.acXp + b.pickupBonus));
  }

  return breakdown;
}

// ============================================================================
// 8. 正七角形レーダーチャート描画（SVGベクター高精細描画）
// ============================================================================
function updateRadarTargetsAndAnimate() {
  const breakdown = calculateParameterBreakdown();
  let sumTotal = 0;
  for (const p of PARAMS) {
    state.radarTargetValues[p.key] = breakdown[p.key].total;
    sumTotal += breakdown[p.key].total;
  }

  const avgPower = Math.round(sumTotal / PARAMS.length);
  const overallEl = document.getElementById('overall-power-value');
  if (overallEl) {
    overallEl.textContent = avgPower.toLocaleString();
    overallEl.style.color = getRatingColor(avgPower);
  }

  const headerCircle = document.getElementById('header-rating-circle');
  if (headerCircle) {
    const actualAtCoderRating = state.userSummary?.user_rating ?? 793;
    headerCircle.style.cssText = getAtCoderCircleStyle(actualAtCoderRating);
  }

  renderParameterBreakdownList(breakdown);
  startRadarAnimationLoop();
}

function startRadarAnimationLoop() {
  if (state.radarAnimFrame) {
    cancelAnimationFrame(state.radarAnimFrame);
  }

  function step() {
    let needsMore = false;
    for (const p of PARAMS) {
      const curr = state.radarCurrentValues[p.key];
      const target = state.radarTargetValues[p.key];
      const delta = target - curr;
      if (Math.abs(delta) > 0.6) {
        state.radarCurrentValues[p.key] = curr + delta * 0.16;
        needsMore = true;
      } else {
        state.radarCurrentValues[p.key] = target;
      }
    }
    drawHeptagonRadarChart();
    if (needsMore) {
      state.radarAnimFrame = requestAnimationFrame(step);
    } else {
      state.radarAnimFrame = null;
    }
  }

  state.radarAnimFrame = requestAnimationFrame(step);
}

function drawHeptagonRadarChart() {
  const svg = document.getElementById('heptagon-radar-svg');
  if (!svg) return;

  const logicalW = 520;
  const logicalH = 450;
  const cx = logicalW / 2;
  const cy = logicalH / 2 + 6;
  const maxRadius = 156;
  const maxVal = 2000;
  const n = 7;

  const getVertex = (idx, radius) => {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle,
    };
  };

  const toPointsAttr = (pts) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  let ringsSvg = '';
  for (let rIdx = RATING_RINGS.length - 1; rIdx >= 1; rIdx--) {
    const ring = RATING_RINGS[rIdx];
    const r = (ring.value / maxVal) * maxRadius;
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push(getVertex(i, r));
    }
    const fill = rIdx % 2 === 0 ? 'rgba(6, 6, 10, 0.5)' : 'rgba(12, 10, 18, 0.35)';
    const strokeW = rIdx === RATING_RINGS.length - 1 ? 1.8 : 1;
    ringsSvg += `<polygon points="${toPointsAttr(pts)}" fill="${fill}" stroke="${ring.stroke}" stroke-width="${strokeW}" />`;
  }

  let axesSvg = '';
  for (let i = 0; i < n; i++) {
    const outer = getVertex(i, maxRadius);
    axesSvg += `<line x1="${cx}" y1="${cy}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />`;
  }

  const basePts = [];
  for (let i = 0; i < n; i++) {
    const baseVal = Math.min(maxVal, state.baseDiagnosis[PARAMS[i].key] || 560);
    const r = (baseVal / maxVal) * maxRadius;
    basePts.push(getVertex(i, r));
  }
  const basePolySvg = `<polygon points="${toPointsAttr(basePts)}" fill="none" stroke="rgba(161, 161, 170, 0.4)" stroke-width="1.2" stroke-dasharray="3 4" />`;

  const dataPoints = [];
  for (let i = 0; i < n; i++) {
    const val = Math.max(40, Math.min(maxVal, state.radarCurrentValues[PARAMS[i].key] || 0));
    const r = (val / maxVal) * maxRadius;
    const pt = getVertex(i, r);
    dataPoints.push({ ...pt, val, param: PARAMS[i] });
  }
  const currentPolySvg = `<polygon points="${toPointsAttr(dataPoints)}" fill="url(#radarPolyGrad)" stroke="#c084fc" stroke-width="2.4" filter="url(#radarGlow)" stroke-linejoin="round" />`;

  let nodesAndLabelsSvg = '';
  for (let i = 0; i < n; i++) {
    const dp = dataPoints[i];
    const rateColor = getRatingColor(dp.val);
    const labelPt = getVertex(i, maxRadius + 36);

    nodesAndLabelsSvg += `
      <circle cx="${dp.x.toFixed(2)}" cy="${dp.y.toFixed(2)}" r="4.6" fill="${rateColor}" stroke="#040407" stroke-width="1.8" />
      <text x="${labelPt.x.toFixed(2)}" y="${(labelPt.y - 10).toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="#f4f4f6" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="11.5">${dp.param.short}</text>
      <text x="${labelPt.x.toFixed(2)}" y="${(labelPt.y + 4).toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="#71717a" font-family="'Noto Sans JP', sans-serif" font-weight="500" font-size="10">${dp.param.name}</text>
      <text x="${labelPt.x.toFixed(2)}" y="${(labelPt.y + 18).toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="${rateColor}" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="11.5">${Math.round(dp.val)}</text>
    `;
  }

  svg.innerHTML = `
    <defs>
      <radialGradient id="radarPolyGrad" cx="${cx}" cy="${cy}" r="${maxRadius}" fx="${cx}" fy="${cy}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.22" />
        <stop offset="65%" stop-color="#a855f7" stop-opacity="0.34" />
        <stop offset="100%" stop-color="#c084fc" stop-opacity="0.46" />
      </radialGradient>
      <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#a855f7" flood-opacity="0.6" />
      </filter>
    </defs>
    ${ringsSvg}
    ${axesSvg}
    ${basePolySvg}
    ${currentPolySvg}
    ${nodesAndLabelsSvg}
  `;
}

function renderParameterBreakdownList(breakdown) {
  const container = document.getElementById('param-breakdown-list');
  if (!container) return;

  container.innerHTML = PARAMS.map((p) => {
    const info = breakdown[p.key];
    const color = getRatingColor(info.total);
    const pct = Math.min(100, Math.round((info.total / 2000) * 100));
    const isBoosted = state.boostedParams.has(p.key);
    return `
      <div class="param-item ${isBoosted ? 'param-boosted' : ''}" data-param="${p.key}">
        <div class="param-item-top">
          <span class="param-name">${p.short} <small style="color:var(--text-muted);font-family:var(--font-sans);font-weight:500;">${p.name}</small></span>
          <span class="param-score" style="color:${color};">${info.total}</span>
        </div>
        <div class="param-bar-track">
          <div class="param-bar-fill" style="width:${pct}%; background:${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// 9. 今週の精進スコア ＆ 過去10週間複合グラフ描画
// ============================================================================
function renderWeeklyStatsAndChart() {
  const ws = state.userSummary?.weekly_stats;
  if (!ws) return;

  let checkedCount = 0;
  let checkedPoints = 0;
  const countedIds = new Set();

  for (const [pid, bonusItem] of Object.entries(state.earnedBonusMap)) {
    if (state.snapshotAcIds.has(pid)) continue;
    countedIds.add(pid);
    checkedCount += 1;
    checkedPoints += bonusItem.difficulty || 600;
  }

  for (const prob of state.userSummary?.ac_problems || []) {
    const pid = prob.problem_id;
    if (!pid || state.snapshotAcIds.has(pid) || countedIds.has(pid)) continue;
    countedIds.add(pid);
    checkedCount += 1;
    checkedPoints += prob.difficulty || 0;
  }

  const totalWeeklyAc = (ws.this_week_ac || 0) + checkedCount;
  const totalWeeklyPoints = (ws.this_week_points || 0) + checkedPoints;
  const lastWeekPoints = ws.last_week_points || 0;
  const diffPoints = totalWeeklyPoints - lastWeekPoints;
  const streakDays = (ws.streak_days || 0) + (checkedCount > 0 ? 1 : 0);

  document.getElementById('stat-weekly-ac').textContent = totalWeeklyAc.toLocaleString();
  document.getElementById('stat-weekly-points').textContent = totalWeeklyPoints.toLocaleString();

  const totalAc = Math.max((state.userSummary?.total_ac_count || 0) + checkedCount, state.liveAcSet.size);
  document.getElementById('stat-total-ac-sub').textContent =
    `Total: ${totalAc.toLocaleString()} AC (+${checkedCount})`;

  const diffEl = document.getElementById('stat-weekly-diff');
  const sign = diffPoints >= 0 ? '+' : '';
  diffEl.textContent = `${sign}${diffPoints.toLocaleString()}`;
  diffEl.className = `score-card-value ${diffPoints >= 0 ? 'diff-positive' : 'diff-negative'}`;

  document.getElementById('stat-last-week-sub').textContent =
    `Last: ${lastWeekPoints.toLocaleString()} pt`;

  document.getElementById('stat-streak-days').textContent = streakDays.toLocaleString();

  drawWeeklyCompositeChart(ws.weekly_history || [], checkedCount, checkedPoints);
}

function drawWeeklyCompositeChart(history, extraAc, extraPoints) {
  const svg = document.getElementById('weekly-trend-svg');
  if (!svg || !history.length) return;

  const W = 680;
  const H = 290;

  const items = history.map((h, idx) => {
    if (idx === history.length - 1) {
      return {
        ...h,
        ac_count: h.ac_count + extraAc,
        points: h.points + extraPoints,
      };
    }
    return h;
  });

  const padL = 54;
  const padR = 44;
  const padT = 24;
  const padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxPoints = Math.max(4000, ...items.map((d) => d.points)) * 1.15;
  const maxAc = Math.max(10, ...items.map((d) => d.ac_count)) * 1.25;

  const gridSteps = 4;
  let gridSvg = '';
  for (let g = 0; g <= gridSteps; g++) {
    const ratio = g / gridSteps;
    const y = padT + plotH - ratio * plotH;
    const ptVal = Math.round(ratio * maxPoints);
    const acVal = Math.round(ratio * maxAc);

    gridSvg += `
      <line x1="${padL}" y1="${y.toFixed(2)}" x2="${W - padR}" y2="${y.toFixed(2)}" stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />
      <text x="${padL - 8}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="central" fill="#71717a" font-family="'JetBrains Mono', monospace" font-weight="500" font-size="10">${ptVal}</text>
      <text x="${W - padR + 8}" y="${y.toFixed(2)}" text-anchor="start" dominant-baseline="central" fill="#a855f7" font-family="'JetBrains Mono', monospace" font-weight="500" font-size="10">${acVal}</text>
    `;
  }

  const slotW = plotW / items.length;
  const barW = Math.min(28, slotW * 0.46);

  let barsSvg = '';
  items.forEach((d, idx) => {
    const cx = padL + slotW * (idx + 0.5);
    const barH = Math.max(2, (d.ac_count / maxAc) * plotH);
    const x = cx - barW / 2;
    const y = padT + plotH - barH;
    const isLast = idx === items.length - 1;
    const labelText = isLast ? '今週' : d.week_label;
    const labelColor = isLast ? '#f4f4f6' : '#71717a';
    const labelWeight = isLast ? '700' : '500';
    const labelSize = isLast ? '10.5' : '10';

    barsSvg += `
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${barH.toFixed(2)}" rx="3" fill="url(#weeklyBarGrad)" stroke="rgba(192, 132, 252, 0.75)" stroke-width="1" />
      <text x="${cx.toFixed(2)}" y="${(padT + plotH + 16).toFixed(2)}" text-anchor="middle" fill="${labelColor}" font-family="'Inter', sans-serif" font-weight="${labelWeight}" font-size="${labelSize}">${labelText}</text>
    `;
  });

  const linePts = items.map((d, idx) => {
    const x = padL + slotW * (idx + 0.5);
    const y = padT + plotH - (d.points / maxPoints) * plotH;
    return { x, y, points: d.points };
  });

  const polylineAttr = linePts.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ');
  const lineSvg = `<polyline points="${polylineAttr}" fill="none" stroke="#e9d5ff" stroke-width="2.2" filter="url(#weeklyLineGlow)" stroke-linecap="round" stroke-linejoin="round" />`;

  let dotsSvg = '';
  linePts.forEach((pt, idx) => {
    const isLast = idx === linePts.length - 1;
    const fill = isLast ? '#c084fc' : '#e9d5ff';
    dotsSvg += `<circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="4" fill="${fill}" stroke="#040407" stroke-width="1.8" />`;
    if (isLast || idx % 2 === 1) {
      dotsSvg += `<text x="${pt.x.toFixed(2)}" y="${(pt.y - 8).toFixed(2)}" text-anchor="middle" fill="#e9d5ff" font-family="'JetBrains Mono', monospace" font-weight="600" font-size="9.5">${pt.points.toLocaleString()}</text>`;
    }
  });

  svg.innerHTML = `
    <defs>
      <linearGradient id="weeklyBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a855f7" stop-opacity="0.65" />
        <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.12" />
      </linearGradient>
      <filter id="weeklyLineGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="#c084fc" flood-opacity="0.5" />
      </filter>
    </defs>
    ${gridSvg}
    ${barsSvg}
    ${lineSvg}
    ${dotsSvg}
  `;
}

// ============================================================================
// 10. 日替わりピックアップ5問 ＆ チェックで即時入荷（典型90・ABC・ARC・AGC全問題対応）
// ============================================================================
function buildDailyPool(staticPool, fullProblemsList = null, problemModels = null) {
  const todayStr = getTodayJstDateString();
  state.todayDateStr = todayStr;

  const dateLabelEl = document.getElementById('pickup-date-label');
  if (dateLabelEl) {
    dateLabelEl.textContent = todayStr;
  }

  const acSet = new Set([
    ...Array.from(state.liveAcSet),
    ...(state.userSummary?.all_ac_ids || []),
    ...(state.userSummary?.ac_problems || []).map((p) => p.problem_id),
    ...Object.keys(state.earnedBonusMap),
  ]);

  const byId = new Map();
  for (const item of staticPool || []) {
    if (!acSet.has(item.problem_id)) {
      byId.set(item.problem_id, item);
    }
  }

  // AtCoder Problems 全問題カタログが取得できた場合、典型90・ABC・ARC・AGCの全未AC問題を候補に統合
  if (Array.isArray(fullProblemsList) && problemModels) {
    for (const prob of fullProblemsList) {
      const pid = prob.id;
      const cid = (prob.contest_id || '').toLowerCase();
      if (!pid || acSet.has(pid) || byId.has(pid)) continue;
      if (
        !(
          cid === 'typical90' ||
          cid.startsWith('abc') ||
          cid.startsWith('arc') ||
          cid.startsWith('agc')
        )
      ) {
        continue;
      }
      const model = problemModels[pid];
      if (!model || model.difficulty === undefined) continue;
      const diff = clipDifficulty(model.difficulty);
      if (diff === null || diff < 200 || diff > 1600) continue;

      const cached = state.analyzedProblems[pid];
      const inferred = cached
        ? { weights: cached.weights, tags: cached.tags }
        : inferWeightsAndTagsForProblem(pid, prob.title || pid, cid, diff);

      byId.set(pid, {
        problem_id: pid,
        contest_id: prob.contest_id,
        title: prob.title || pid,
        difficulty: diff,
        url: `https://atcoder.jp/contests/${prob.contest_id}/tasks/${pid}`,
        weights: inferred.weights,
        tags: inferred.tags,
      });
    }
  }

  // 当日の日付シードでシャッフル（日付が変わると自動で新しい5問＋予備プールに切り替わる）
  state.dailyPool = seededShuffle(Array.from(byId.values()), `algoview-${todayStr}`);
}

function getActiveAndReserveRecommendations() {
  const pool = state.dailyPool;
  const unchecked = pool.filter((item) => !state.checkedProblemIds.has(item.problem_id));
  return {
    activeFive: unchecked.slice(0, 5),
    reservePool: unchecked.slice(5),
    totalPoolSize: pool.length,
    checkedCount: state.checkedProblemIds.size,
  };
}

function createPickupCardElement(prob) {
  const article = document.createElement('article');
  article.className = 'pickup-card';
  article.setAttribute('role', 'listitem');
  article.dataset.problemId = prob.problem_id;

  const circleStyle = getAtCoderCircleStyle(prob.difficulty);
  const diffColor = getRatingColor(prob.difficulty);

  const tagsHtml = (prob.tags || [])
    .map((t) => {
      const pMeta = PARAMS.find((p) => p.key === t.param) || { short: t.param };
      return `<span class="growth-tag">[${pMeta.short} <span class="arrows">${t.arrows}</span>]</span>`;
    })
    .join('');

  article.innerHTML = `
    <div class="pickup-card-main">
      <div class="pickup-meta-row">
        <span class="contest-badge">${prob.contest_id}</span>
        <span class="diff-badge" style="color:${diffColor};">
          <span class="atcoder-circle" style="${circleStyle}" aria-hidden="true"></span>
          Diff ${prob.difficulty}
        </span>
      </div>
      <a href="${prob.url}" target="_blank" rel="noopener noreferrer" class="pickup-problem-link">
        ${prob.title}
      </a>
      <div class="pickup-tags-row">
        ${tagsHtml}
      </div>
    </div>
    <button type="button" class="btn-ac-check" data-problem-id="${prob.problem_id}" aria-label="${prob.title} をAC完了としてチェック">
      <span>AC完了</span>
      <span class="xp-gain-hint">+${Math.round(prob.difficulty * 0.22)} EXP</span>
    </button>
  `;

  const checkBtn = article.querySelector('.btn-ac-check');
  checkBtn.addEventListener('click', () => handleCheckProblem(prob, article));

  return article;
}

function renderInitialPickupCards() {
  const listEl = document.getElementById('pickup-cards-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const { activeFive } = getActiveAndReserveRecommendations();
  for (const prob of activeFive) {
    listEl.appendChild(createPickupCardElement(prob));
  }
  updatePickupStatusFooter();
}

function updatePickupStatusFooter() {
  const { reservePool, checkedCount } = getActiveAndReserveRecommendations();
  const doneEl = document.getElementById('today-checked-count');
  if (doneEl) {
    doneEl.textContent = checkedCount;
  }

  const dotsContainer = document.getElementById('pickup-pool-dots');
  if (dotsContainer) {
    dotsContainer.textContent = `候補プール残り ${reservePool.length.toLocaleString()} 問`;
  }
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyProblemAcFromApi(problemId) {
  if (state.liveAcSet.has(problemId)) {
    return true;
  }
  const userId = state.userSummary?.user_id || 'Pikapurin';
  let fromSecond = state.lastMaxEpochSecond > 0 ? Math.max(0, state.lastMaxEpochSecond - 30) : 0;

  while (true) {
    const url = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(userId)}&from_second=${fromSecond}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const batch = await resp.json();
    if (!batch.length) break;

    for (const sub of batch) {
      if (sub.epoch_second && sub.epoch_second > state.lastMaxEpochSecond) {
        state.lastMaxEpochSecond = sub.epoch_second;
      }
      if (sub.result === 'AC' && sub.problem_id) {
        state.liveAcSet.add(sub.problem_id);
      }
    }
    if (batch.length < 500) break;
    fromSecond = state.lastMaxEpochSecond + 1;
    await delayMs(350);
  }

  return state.liveAcSet.has(problemId);
}

async function handleCheckProblem(prob, cardElement, isAutoDetected = false) {
  if (state.checkedProblemIds.has(prob.problem_id)) return;

  const checkBtn = cardElement?.querySelector('.btn-ac-check');
  const labelSpan = checkBtn?.querySelector('span:first-child');

  // ボタン押下時は AtCoder Problems API で実際にAC済みか検証する
  if (!isAutoDetected) {
    if (checkBtn) checkBtn.disabled = true;
    if (labelSpan) labelSpan.textContent = '確認中...';

    try {
      const isReallyAc = await verifyProblemAcFromApi(prob.problem_id);
      if (!isReallyAc) {
        if (checkBtn) checkBtn.disabled = false;
        if (labelSpan) labelSpan.textContent = 'AC完了';
        if (cardElement) {
          cardElement.classList.remove('card-unverified-shake');
          void cardElement.offsetWidth;
          cardElement.classList.add('card-unverified-shake');
        }
        showToast(`未AC: AtCoder上で「${prob.title}」のAC提出がまだ確認できません`);
        return;
      }
    } catch (err) {
      if (checkBtn) checkBtn.disabled = false;
      if (labelSpan) labelSpan.textContent = 'AC完了';
      showToast('API通信エラーのためAC確認ができませんでした');
      return;
    }
  }

  const { reservePool } = getActiveAndReserveRecommendations();
  const nextReplacementProb = reservePool[0] || null;

  state.checkedProblemIds.add(prob.problem_id);
  state.earnedBonusMap[prob.problem_id] = {
    difficulty: prob.difficulty || 600,
    weights: prob.weights || {},
  };
  saveCheckedProblems();

  state.boostedParams.clear();
  for (const t of prob.tags || []) {
    state.boostedParams.add(t.param);
  }

  if (cardElement) {
    cardElement.classList.add('card-completed-glow');
  }

  const tagText = (prob.tags || []).map((t) => `${t.param}${t.arrows}`).join(' / ');
  if (isAutoDetected) {
    showToast(`AC検知: ${prob.title} (${tagText})`);
  } else {
    showToast(`AC確認完了: ${prob.title} (${tagText})`);
  }

  updateRadarTargetsAndAnimate();
  renderWeeklyStatsAndChart();
  updatePickupStatusFooter();

  if (cardElement) {
    await removeElement(cardElement);
  }

  const listEl = document.getElementById('pickup-cards-list');
  if (listEl && nextReplacementProb) {
    const newCard = createPickupCardElement(nextReplacementProb);
    listEl.appendChild(newCard);
  }
}

// ============================================================================
// 11. 直近の解析済みAC履歴リスト描画
// ============================================================================
function renderRecentAcHistory() {
  const container = document.getElementById('recent-ac-list');
  if (!container) return;

  const acList = (state.userSummary?.ac_problems || []).slice(0, 12);
  container.innerHTML = acList
    .map((item) => {
      const circleStyle = getAtCoderCircleStyle(item.difficulty);
      const diffColor = getRatingColor(item.difficulty);
      const url = `https://atcoder.jp/contests/${item.contest_id}/tasks/${item.problem_id}`;
      const tagsHtml = (item.tags || [])
        .slice(0, 2)
        .map((t) => `<span class="growth-tag">[${t.param} <span class="arrows">${t.arrows}</span>]</span>`)
        .join('');

      return `
        <div class="ac-history-item">
          <div class="ac-history-left">
            <span class="atcoder-circle" style="${circleStyle}" aria-hidden="true"></span>
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="ac-history-title">${item.title}</a>
          </div>
          <div class="ac-history-right">
            ${tagsHtml}
            <span class="diff-badge" style="color:${diffColor};">Diff ${item.difficulty}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// 12. 初期値診断アンケートモーダル（ネイティブ <dialog>）
// ============================================================================
function setupDiagnosisDialog() {
  const dialog = document.getElementById('diagnosis-dialog');
  const qContainer = document.getElementById('diagnosis-questions-container');
  const form = document.getElementById('diagnosis-form');
  const btnOpen = document.getElementById('btn-open-diagnosis');
  const btnClose = document.getElementById('btn-close-diagnosis');
  const btnCancel = document.getElementById('btn-cancel-diagnosis');
  const btnPreset = document.getElementById('btn-preset-balanced');

  if (!dialog || !qContainer) return;

  function renderQuestionsForm() {
    qContainer.innerHTML = PARAMS.map((p) => {
      const currentVal = state.baseDiagnosis[p.key] || 560;
      const optionsHtml = DIAGNOSIS_CHOICES.map((c) => {
        const checked = Math.abs(currentVal - c.value) < 60 ? 'checked' : '';
        return `
          <label class="diag-option-label">
            <input type="radio" name="diag_${p.key}" value="${c.value}" ${checked}>
            <span>${c.label}</span>
            <span class="diag-option-val">Base ${c.value}</span>
          </label>
        `;
      }).join('');

      return `
        <div class="diag-question-card">
          <div class="diag-q-title">[${p.short}] ${p.question}</div>
          <div class="diag-options-grid">
            ${optionsHtml}
          </div>
        </div>
      `;
    }).join('');

    qContainer.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener('change', updateDiagnosisPreviewChips);
    });
    updateDiagnosisPreviewChips();
  }

  function getSelectedFormValues() {
    const result = {};
    for (const p of PARAMS) {
      const checked = qContainer.querySelector(`input[name="diag_${p.key}"]:checked`);
      result[p.key] = checked ? Number(checked.value) : state.baseDiagnosis[p.key] || 560;
    }
    return result;
  }

  function updateDiagnosisPreviewChips() {
    const previewEl = document.getElementById('diagnosis-preview-chips');
    if (!previewEl) return;
    const vals = getSelectedFormValues();
    previewEl.innerHTML = PARAMS.map((p) => {
      const v = vals[p.key];
      return `<span class="preview-chip" style="color:${getRatingColor(v)};">${p.short}: ${v}</span>`;
    }).join('');
  }

  btnOpen?.addEventListener('click', () => {
    renderQuestionsForm();
    dialog.showModal();
  });

  btnClose?.addEventListener('click', () => closeTopLayer(dialog));
  btnCancel?.addEventListener('click', () => closeTopLayer(dialog));

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeTopLayer(dialog);
  });

  dialog.addEventListener('close', () => {
    dialog.returnValue = '';
  });

  btnPreset?.addEventListener('click', () => {
    qContainer.querySelectorAll('input[type="radio"][value="700"]').forEach((r) => {
      r.checked = true;
    });
    updateDiagnosisPreviewChips();
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const newValues = getSelectedFormValues();
    state.baseDiagnosis = newValues;
    try {
      localStorage.setItem(STORAGE_KEYS.DIAGNOSIS, JSON.stringify(newValues));
    } catch (e) {
      console.warn('localStorage write warning:', e);
    }
    updateRadarTargetsAndAnimate();
    showToast('初期ベース値を保存しました');
    closeTopLayer(dialog);
  });

  if (!localStorage.getItem(STORAGE_KEYS.DIAGNOSIS)) {
    renderQuestionsForm();
    dialog.showModal();
  }
}

// ============================================================================
// 13. AtCoder Problems API リアルタイム同期 ＆ 全問題カタログ統合
// ============================================================================
async function syncWithLiveAtCoderApi(showManualFeedback = false) {
  if (showManualFeedback) {
    state.syncShowToast = true;
    showToast(`API同期中 (${state.userSummary?.user_id || 'Pikapurin'})...`);
  }

  if (state.syncPromise) {
    return state.syncPromise;
  }

  state.syncPromise = runLiveAtCoderSync().finally(() => {
    state.syncPromise = null;
    state.syncShowToast = false;
  });
  return state.syncPromise;
}

async function runLiveAtCoderSync() {
  const userId = state.userSummary?.user_id || 'Pikapurin';

  try {

    const fetchedSubs = [];
    let fromSecond = state.lastMaxEpochSecond > 0 ? Math.max(0, state.lastMaxEpochSecond - 30) : 0;
    while (true) {
      const url = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(userId)}&from_second=${fromSecond}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const batch = await resp.json();
      if (!Array.isArray(batch) || !batch.length) break;
      fetchedSubs.push(...batch);
      if (batch.length < 500) break;
      const batchMax = Math.max(...batch.map((s) => s.epoch_second || 0));
      if (batchMax < fromSecond) break;
      fromSecond = batchMax + 1;
      await delayMs(350);
    }

    const prevAcIds = new Set(state.liveAcSet);
    const newlyDiscoveredSubs = [];
    const seenNewPids = new Set();

    fetchedSubs.sort((a, b) => (a.epoch_second || 0) - (b.epoch_second || 0));
    for (const sub of fetchedSubs) {
      if (sub.epoch_second && sub.epoch_second > state.lastMaxEpochSecond) {
        state.lastMaxEpochSecond = sub.epoch_second;
      }
      if (sub.result === 'AC' && sub.problem_id) {
        state.liveAcSet.add(sub.problem_id);
        if (!prevAcIds.has(sub.problem_id) && !seenNewPids.has(sub.problem_id)) {
          seenNewPids.add(sub.problem_id);
          newlyDiscoveredSubs.push(sub);
        }
      }
    }

    // カタログJSON（約2.4MB）は別try/catchで初回のみ取得し、失敗しても提出同期は継続する
    let catalogJustLoaded = false;
    if (!state.catalogLoaded) {
      try {
        const [probsResp, modelsResp] = await Promise.all([
          fetch('https://kenkoooo.com/atcoder/resources/problems.json'),
          fetch('https://kenkoooo.com/atcoder/resources/problem-models.json'),
        ]);
        if (probsResp.ok && modelsResp.ok) {
          state.catalogProblems = await probsResp.json();
          state.catalogModels = await modelsResp.json();
          state.catalogLoaded = true;
          for (const item of state.catalogProblems) {
            if (item?.id) {
              state.problemMetaById[item.id] = item;
            }
          }
          catalogJustLoaded = true;
        }
      } catch (catalogErr) {
        console.warn('Problem catalog fetch skipped (using cached pool):', catalogErr);
      }
    }

    // 現在のピックアップ候補に含まれる新規ACを先に自動検出し、ボーナスを付与
    let newlyAutoDetected = 0;
    for (const prob of state.dailyPool.slice(0, 15)) {
      if (state.liveAcSet.has(prob.problem_id) && !state.checkedProblemIds.has(prob.problem_id)) {
        newlyAutoDetected += 1;
        state.autoPraisedIds.add(prob.problem_id);
        saveAutoPraised();
        const cardEl = document.querySelector(`.pickup-card[data-problem-id="${prob.problem_id}"]`);
        await handleCheckProblem(prob, cardEl, true);
      }
    }

    if (newlyDiscoveredSubs.length > 0 && state.userSummary) {
      const poolById = new Map();
      for (const p of state.dailyPool) poolById.set(p.problem_id, p);
      for (const p of state.userSummary.recommendations_pool || []) poolById.set(p.problem_id, p);

      const existingAcMap = new Map(
        (state.userSummary.ac_problems || []).map((p) => [p.problem_id, p])
      );

      for (const sub of newlyDiscoveredSubs) {
        const pid = sub.problem_id;
        if (existingAcMap.has(pid)) continue;
        const meta = state.problemMetaById[pid] || poolById.get(pid) || state.analyzedProblems[pid] || {};
        const modelDiff = state.catalogModels?.[pid]?.difficulty;
        const difficulty = clipDifficulty(modelDiff) ?? meta.difficulty ?? 500;
        const contestId = sub.contest_id || meta.contest_id || pid.split('_')[0];
        const title = meta.title || meta.name || pid;
        const inferred = inferWeightsAndTagsForProblem(pid, title, contestId, difficulty);
        const weights = state.analyzedProblems[pid]?.weights || meta.weights || inferred.weights;
        const tags = state.analyzedProblems[pid]?.tags || meta.tags || inferred.tags;

        existingAcMap.set(pid, {
          problem_id: pid,
          contest_id: contestId,
          title,
          difficulty,
          epoch_second: sub.epoch_second,
          tags,
          weights,
        });
      }

      state.userSummary.ac_problems = Array.from(existingAcMap.values()).sort(
        (a, b) => (b.epoch_second || 0) - (a.epoch_second || 0)
      );
      state.userSummary.all_ac_ids = Array.from(state.liveAcSet);
      state.userSummary.latest_submission_epoch = state.lastMaxEpochSecond;

      buildDailyPool(
        state.userSummary.recommendations_pool || [],
        state.catalogProblems,
        state.catalogModels
      );
      renderInitialPickupCards();
      renderRecentAcHistory();
      renderWeeklyStatsAndChart();
      updateRadarTargetsAndAnimate();
    } else if (catalogJustLoaded) {
      buildDailyPool(
        state.userSummary?.recommendations_pool || [],
        state.catalogProblems,
        state.catalogModels
      );
      renderInitialPickupCards();
    }

    if (state.syncShowToast && newlyAutoDetected === 0) {
      const totalDisplay = state.liveAcSet.size || state.userSummary?.total_ac_count || 0;
      const msg =
        newlyDiscoveredSubs.length > 0
          ? `同期完了: 新規AC ${newlyDiscoveredSubs.length}問を反映 (累計 ${totalDisplay}問)`
          : `同期完了: 最新の状態です (実AC: ${totalDisplay}問)`;
      showToast(msg);
    }
  } catch (err) {
    console.warn('Live API sync fallback (using static JSON):', err.message);
    if (state.syncShowToast) {
      showToast('API同期に失敗しました（キャッシュJSONを表示中）');
    }
  }
}

// ============================================================================
// 14. トースト通知表示
// ============================================================================
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}

// ============================================================================
// 15. 初期化エントリーポイント
// ============================================================================
async function initApp() {
  loadLocalState();

  try {
    const [summaryResp, analyzedResp] = await Promise.all([
      fetch('data/user_summary.json'),
      fetch('data/analyzed_problems.json'),
    ]);
    state.userSummary = await summaryResp.json();
    state.analyzedProblems = await analyzedResp.json();

    const initialAcIds = [
      ...(state.userSummary?.all_ac_ids || []),
      ...(state.userSummary?.ac_problems || []).map((p) => p.problem_id),
    ];
    state.snapshotAcIds = new Set(initialAcIds);
    state.liveAcSet = new Set(initialAcIds);
    if (state.userSummary?.latest_submission_epoch) {
      state.lastMaxEpochSecond = Math.max(
        state.lastMaxEpochSecond,
        state.userSummary.latest_submission_epoch
      );
    }
  } catch (err) {
    console.error('Failed to load initial JSON data:', err);
  }

  buildDailyPool(state.userSummary?.recommendations_pool || []);
  renderInitialPickupCards();
  renderRecentAcHistory();
  renderWeeklyStatsAndChart();
  updateRadarTargetsAndAnimate();

  document.getElementById('btn-sync-api')?.addEventListener('click', () => {
    syncWithLiveAtCoderApi(true);
  });

  // 日付変更（0:00 JST）を自動検知してピックアップを更新するタイマー
  setInterval(() => {
    const nowDateStr = getTodayJstDateString();
    if (nowDateStr !== state.todayDateStr) {
      state.todayDateStr = nowDateStr;
      state.checkedProblemIds.clear();
      saveCheckedProblems();
      buildDailyPool(state.dailyPool);
      renderInitialPickupCards();
    }
  }, 60000);

  syncWithLiveAtCoderApi(false);
}

document.addEventListener('DOMContentLoaded', initApp);
