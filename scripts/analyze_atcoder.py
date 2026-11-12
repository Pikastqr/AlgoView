#!/usr/bin/env python3
"""
AlgoView Batch Analyzer for AtCoder User "Pikapurin"
- Fetches submissions, problem metadata, and difficulty models from AtCoder Problems API
- Strictly caches analyzed problems in data/analyzed_problems.json (never re-scrapes or re-analyzes)
- Caps new problem scraping + Gemini API analysis at 15 problems per batch run (max 10 new AC + rest from recommendations)
- Enforces time.sleep(4) between requests to respect AtCoder servers and Gemini API free-tier RPM limits
- Generates data/user_summary.json including 15 recommended problems (5 active + 10 backup)
"""

from __future__ import annotations

import datetime
import json
import math
import os
import random
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

# 定数・設定
USER_ID = os.environ.get("ATCODER_USER", "Pikapurin")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
ANALYZED_PROBLEMS_PATH = DATA_DIR / "analyzed_problems.json"
USER_SUMMARY_PATH = DATA_DIR / "user_summary.json"

SUBMISSIONS_API_URL = "https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions"
PROBLEMS_API_URL = "https://kenkoooo.com/atcoder/resources/problems.json"
PROBLEM_MODELS_API_URL = "https://kenkoooo.com/atcoder/resources/problem-models.json"

PARAM_KEYS = ["IMP", "DS", "GRP", "DP", "MTH", "INS", "OPT"]
PARAM_LABELS = {
    "IMP": "実装・構築",
    "DS": "データ構造",
    "GRP": "グラフ・木",
    "DP": "動的計画法",
    "MTH": "数学・数え上げ",
    "INS": "ひらめき・考察",
    "OPT": "探索・高速化",
}

MAX_TOTAL_NEW_ANALYSES = 15
MAX_NEW_AC_ANALYSES = 10
REQUEST_SLEEP_SECONDS = 4.0

HEADERS = {
    "User-Agent": "AlgoView-AtCoder-Analyzer/1.0 (+https://github.com/)",
    "Accept-Encoding": "gzip, deflate",
}


# Pydantic 스キーマ（Gemini Structured Outputs 用）
class TagItem(BaseModel):
    param: str = Field(description="IMP, DS, GRP, DP, MTH, INS, OPT のいずれか")
    arrows: str = Field(description="成長期待度: ↑, ↑↑, ↑↑↑ のいずれか")


class WeightsMap(BaseModel):
    IMP: int = Field(description="実装・構築力の配分比率 (0-100)")
    DS: int = Field(description="データ構造力の配分比率 (0-100)")
    GRP: int = Field(description="グラフ・木アルゴリズム力の配分比率 (0-100)")
    DP: int = Field(description="動的計画法の配分比率 (0-100)")
    MTH: int = Field(description="数学・数え上げ力の配分比率 (0-100)")
    INS: int = Field(description="ひらめき・考察力の配分比率 (0-100)")
    OPT: int = Field(description="探索・高速化力の配分比率 (0-100)")


class ProblemAnalysisResult(BaseModel):
    problem_id: str
    weights: WeightsMap
    tags: List[TagItem]
    one_line_summary: str = Field(
        description="直接の解法ネタバレを避けつつワクワクする40文字以内の紹介文"
    )


class BatchAnalysisResponse(BaseModel):
    results: List[ProblemAnalysisResult]


def clip_difficulty(raw_diff: Optional[float]) -> int:
    """AtCoder Problems の内部 difficulty を表示用の非負整数レート値に変換する。"""
    if raw_diff is None or math.isnan(raw_diff):
        return 400
    if raw_diff < 400:
        # AtCoder Problems の低難易度補正公式: 400 / exp(1.0 - diff / 400)
        try:
            adjusted = 400.0 / math.exp(1.0 - raw_diff / 400.0)
            return max(1, int(round(adjusted)))
        except OverflowError:
            return 1
    return int(round(raw_diff))


def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            print(f"[WARN] Failed to load {path}: {exc}")
    return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fetch_all_submissions(user_id: str) -> List[Dict[str, Any]]:
    """指定ユーザーの全提出履歴をページネーション付きで取得する。"""
    all_subs: List[Dict[str, Any]] = []
    from_second = 0
    while True:
        url = f"{SUBMISSIONS_API_URL}?user={user_id}&from_second={from_second}"
        print(f"[INFO] Fetching submissions: {url}")
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        all_subs.extend(batch)
        if len(batch) < 500:
            break
        from_second = max(item.get("epoch_second", 0) for item in batch) + 1
        time.sleep(1.0)
    return all_subs


def fetch_problems_catalog() -> Dict[str, Dict[str, Any]]:
    print(f"[INFO] Fetching problems catalog: {PROBLEMS_API_URL}")
    resp = requests.get(PROBLEMS_API_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    items = resp.json()
    catalog: Dict[str, Dict[str, Any]] = {}
    for item in items:
        pid = item.get("id")
        if not pid:
            continue
        # ADT等の再出題よりも元のコンテスト定義（abc/arc/agc/typical90等）を優先する
        if pid not in catalog or catalog[pid].get("contest_id", "").startswith("adt_"):
            catalog[pid] = item
    return catalog


def fetch_user_rating(user_id: str) -> int:
    """AtCoder公式のコンテスト履歴JSONから現在のレートを取得する。"""
    url = f"https://atcoder.jp/users/{user_id}/history/json"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            history = resp.json()
            if history and isinstance(history, list):
                return int(history[-1].get("NewRating", 0))
    except Exception as exc:
        print(f"[WARN] Failed to fetch user rating: {exc}")
    return 793


def fetch_problem_models() -> Dict[str, Dict[str, Any]]:
    print(f"[INFO] Fetching problem difficulty models: {PROBLEM_MODELS_API_URL}")
    resp = requests.get(PROBLEM_MODELS_API_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def scrape_problem_statement(contest_id: str, problem_id: str) -> str:
    """
    AtCoder公式問題ページから #task-statement の日本語テキストと制約部分を抽出する。
    サーバー負荷軽減のため呼び出し後に必ず time.sleep(4) を行う。
    """
    url = f"https://atcoder.jp/contests/{contest_id}/tasks/{problem_id}"
    print(f"[SCRAPE] Fetching problem statement: {url}")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        time.sleep(REQUEST_SLEEP_SECONDS)
        if resp.status_code != 200:
            print(f"[WARN] HTTP {resp.status_code} for {url}")
            return ""
        soup = BeautifulSoup(resp.text, "html.parser")
        task_div = soup.select_one("#task-statement")
        if not task_div:
            return ""

        ja_span = task_div.select_one(".lang-ja")
        target_node = ja_span if ja_span else task_div
        text = target_node.get_text(separator="\n", strip=True)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text[:2500]
    except Exception as exc:
        print(f"[WARN] Failed to scrape {url}: {exc}")
        time.sleep(REQUEST_SLEEP_SECONDS)
        return ""


def normalize_analysis_entry(
    problem_id: str,
    raw_weights: Dict[str, Any],
    raw_tags: List[Dict[str, str]],
    summary: str,
    title: str = "",
    contest_id: str = "",
    difficulty: int = 600,
) -> Dict[str, Any]:
    """weights の合計が必ず 100 になるように正規化し、スキーマを整える。"""
    weights: Dict[str, int] = {}
    for k in PARAM_KEYS:
        val = int(raw_weights.get(k, 0)) if raw_weights else 0
        weights[k] = max(0, val)

    total = sum(weights.values())
    if total <= 0:
        weights = {"IMP": 20, "DS": 20, "GRP": 10, "DP": 10, "MTH": 10, "INS": 15, "OPT": 15}
    elif total != 100:
        scaled = {k: int(round(v * 100.0 / total)) for k, v in weights.items()}
        diff_rem = 100 - sum(scaled.values())
        top_key = max(scaled.keys(), key=lambda k: scaled[k])
        scaled[top_key] = max(0, scaled[top_key] + diff_rem)
        weights = scaled

    # タグの検証・整形
    valid_tags = []
    for t in raw_tags or []:
        p = t.get("param", "")
        a = t.get("arrows", "↑")
        if p in PARAM_KEYS:
            if a not in ("↑", "↑↑", "↑↑↑"):
                a = "↑↑" if weights.get(p, 0) >= 35 else "↑"
            valid_tags.append({"param": p, "arrows": a})

    if not valid_tags:
        sorted_params = sorted(PARAM_KEYS, key=lambda k: weights[k], reverse=True)
        for p in sorted_params[:2]:
            if weights[p] > 0:
                arrows = "↑↑↑" if weights[p] >= 50 else ("↑↑" if weights[p] >= 30 else "↑")
                valid_tags.append({"param": p, "arrows": arrows})

    clean_summary = (summary or "着眼点と計算量改善が光るAtCoderの実践的良問！").strip()
    if len(clean_summary) > 40:
        clean_summary = clean_summary[:39] + "！"

    return {
        "problem_id": problem_id,
        "title": title,
        "contest_id": contest_id,
        "difficulty": difficulty,
        "weights": weights,
        "tags": valid_tags[:3],
        "one_line_summary": clean_summary,
        "analyzed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def heuristic_analyze_problem(problem_meta: Dict[str, Any]) -> Dict[str, Any]:
    """APIキー未設定時またはフォールバック用のルールベース解析。"""
    pid = problem_meta["problem_id"]
    title = problem_meta.get("title", pid)
    statement = problem_meta.get("statement", "")
    diff = problem_meta.get("difficulty", 600)
    combined = f"{title} {statement}".lower()

    weights = {"IMP": 15, "DS": 15, "GRP": 10, "DP": 10, "MTH": 10, "INS": 20, "OPT": 20}
    if any(w in combined for w in ["木", "グラフ", "頂点", "辺", "最短", "連結", "tree", "graph", "path"]):
        weights["GRP"] += 35
    if any(w in combined for w in ["クエリ", "集合", "区間", "順序", "query", "segment"]):
        weights["DS"] += 30
    if any(w in combined for w in ["998244353", "1000000007", "素数", "約数", "期待値", "確率", "mod"]):
        weights["MTH"] += 35
    if any(w in combined for w in ["最大", "最小", "通り", "選び方", "dp"]):
        weights["DP"] += 25
    if any(w in combined for w in ["グリッド", "マス", "シミュレーション", "文字列", "grid"]):
        weights["IMP"] += 25

    top_params = sorted(PARAM_KEYS, key=lambda k: weights[k], reverse=True)
    p1, p2 = top_params[0], top_params[1]
    summary = f"{PARAM_LABELS[p1]}と{PARAM_LABELS[p2]}の総合力が試されるステップアップ良問！"

    return normalize_analysis_entry(
        problem_id=pid,
        raw_weights=weights,
        raw_tags=[],
        summary=summary,
        title=title,
        contest_id=problem_meta.get("contest_id", ""),
        difficulty=diff,
    )


def analyze_problems_with_gemini(problems_to_analyze: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    対象問題リストを Gemini API に渡し、7大パラメータの配分比率・成長矢印・一言紹介文を生成する。
    RPM制限を守るためバッチプロンプト＋time.sleep(4)で安全に呼び出す。
    """
    if not problems_to_analyze:
        return {}

    if not GEMINI_API_KEY or genai is None:
        print("[INFO] GEMINI_API_KEY not set or google-genai unavailable. Using heuristic fallback.")
        return {
            p["problem_id"]: heuristic_analyze_problem(p)
            for p in problems_to_analyze
        }

    client = genai.Client(api_key=GEMINI_API_KEY)
    results_map: Dict[str, Dict[str, Any]] = {}

    # 5問ずつチャンク分割してリクエスト
    chunk_size = 5
    for idx in range(0, len(problems_to_analyze), chunk_size):
        chunk = problems_to_analyze[idx : idx + chunk_size]
        prompt_items = []
        for p in chunk:
            prompt_items.append(
                {
                    "problem_id": p["problem_id"],
                    "title": p["title"],
                    "difficulty": p["difficulty"],
                    "statement_excerpt": p["statement"][:1200],
                }
            )

        prompt = f"""
あなたは競技プログラミング（AtCoder）の熟練コーチです。
以下のAtCoder問題リストについて、それぞれの問題で鍛えられる「7大パラメータ」の配分比率（weights）、
特に成長が期待できる上位1〜3個のタグ（tags）、および直接の解法ネタバレを避けつつ挑戦したくなる
40文字以内のワクワクする紹介文（one_line_summary）をJSON形式で出力してください。

【7大パラメータの定義】
- IMP（実装・構築力）: 複雑な条件分岐・シミュレーション・構築をバグらせず書き切る力
- DS（データ構造力）: Segment Tree / Union-Find / 優先度付きキュー / Set・Map等の活用力
- GRP（グラフ・木）: BFS / DFS / 最短経路 / トポロジカルソート / 木上のアルゴリズム力
- DP（動的計画法）: 状態定義の設計・ナップサック・bitDP・遷移の高速化力
- MTH（数学・数え上げ）: 整数論・素因数分解・組合せ・確率期待値・MOD演算力
- INS（ひらめき・考察力）: 問題の言い換え・不変量の発見・貪欲法（Greedy）の正当性判断力
- OPT（探索・高速化力）: 二分探索・尺取り法・累積和・半分全列挙等で計算量を落とす力

【厳守ルール】
1. weights の7項目の合計は必ず 100 にしてください。
2. tags の arrows は "↑", "↑↑", "↑↑↑" のいずれかにしてください。
3. one_line_summary は40文字以内で、直接の解法ネタバレを避けつつ特徴が伝わる魅力的な一文にしてください。

【対象問題リスト】
{json.dumps(prompt_items, ensure_ascii=False, indent=2)}
"""
        try:
            print(f"[GEMINI] Analyzing batch of {len(chunk)} problems with {GEMINI_MODEL}...")
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=BatchAnalysisResponse,
                    temperature=0.3,
                ),
            )
            time.sleep(REQUEST_SLEEP_SECONDS)
            parsed = json.loads(response.text)
            meta_by_id = {p["problem_id"]: p for p in chunk}
            for item in parsed.get("results", []):
                pid = item.get("problem_id")
                if pid in meta_by_id:
                    meta = meta_by_id[pid]
                    results_map[pid] = normalize_analysis_entry(
                        problem_id=pid,
                        raw_weights=item.get("weights", {}),
                        raw_tags=item.get("tags", []),
                        summary=item.get("one_line_summary", ""),
                        title=meta["title"],
                        contest_id=meta["contest_id"],
                        difficulty=meta["difficulty"],
                    )
        except Exception as exc:
            print(f"[WARN] Gemini batch analysis failed ({exc}). Falling back to heuristic for chunk.")
            time.sleep(REQUEST_SLEEP_SECONDS)

        for p in chunk:
            if p["problem_id"] not in results_map:
                results_map[p["problem_id"]] = heuristic_analyze_problem(p)

    return results_map


def is_candidate_recommendation(
    problem_id: str,
    problem_info: Dict[str, Any],
    difficulty: int,
) -> bool:
    """
    未AC問題のうち、典型90問 (typical90)・ABC・ARC・AGC の全問題を対象候補とする。
    極端な入門/超難問を除きつつ幅広い難易度帯（Diff 200〜1600）から選出可能にする。
    """
    contest_id = (problem_info.get("contest_id", "") or "").lower()
    if not (
        contest_id == "typical90"
        or contest_id.startswith("abc")
        or contest_id.startswith("arc")
        or contest_id.startswith("agc")
    ):
        return False
    if not (200 <= difficulty <= 1600):
        return False
    return True


def compute_weekly_and_streak_stats(
    ac_map: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """週間精進スコア・過去10週間の推移・連続精進日数（Streak）を計算する。"""
    jst = datetime.timezone(datetime.timedelta(hours=9))
    now_jst = datetime.datetime.now(jst)
    today_date = now_jst.date()

    # 今週の月曜日を起点とする
    current_monday = today_date - datetime.timedelta(days=today_date.weekday())

    # 日別のAC日集合
    ac_dates = set()
    for info in ac_map.values():
        dt = datetime.datetime.fromtimestamp(info["epoch_second"], tz=jst).date()
        ac_dates.add(dt)

    # 連続精進日数 (Streak) 計算
    streak = 0
    cursor_date = today_date if today_date in ac_dates else (today_date - datetime.timedelta(days=1))
    while cursor_date in ac_dates:
        streak += 1
        cursor_date -= datetime.timedelta(days=1)

    # 過去10週間の集計 (index 9 が今週、index 8 が先週)
    weekly_history = []
    for w_offset in range(9, -1, -1):
        w_start = current_monday - datetime.timedelta(weeks=w_offset)
        w_end = w_start + datetime.timedelta(days=6)
        ac_count = 0
        points = 0
        for info in ac_map.values():
            dt = datetime.datetime.fromtimestamp(info["epoch_second"], tz=jst).date()
            if w_start <= dt <= w_end:
                ac_count += 1
                points += int(info.get("difficulty", 400))
        weekly_history.append(
            {
                "week_label": f"{w_start.month}/{w_start.day}〜",
                "start_date": w_start.isoformat(),
                "ac_count": ac_count,
                "points": points,
            }
        )

    this_week = weekly_history[-1]
    last_week = weekly_history[-2] if len(weekly_history) >= 2 else {"ac_count": 0, "points": 0}

    return {
        "this_week_ac": this_week["ac_count"],
        "this_week_points": this_week["points"],
        "last_week_points": last_week["points"],
        "points_diff_vs_last_week": this_week["points"] - last_week["points"],
        "streak_days": streak,
        "weekly_history": weekly_history,
    }


def main() -> None:
    print(f"=== Starting AlgoView AtCoder Batch Analysis for {USER_ID} ===")
    analyzed_cache: Dict[str, Dict[str, Any]] = load_json(ANALYZED_PROBLEMS_PATH, {})
    existing_summary: Dict[str, Any] = load_json(USER_SUMMARY_PATH, {})

    try:
        submissions = fetch_all_submissions(USER_ID)
        problems_catalog = fetch_problems_catalog()
        problem_models = fetch_problem_models()
    except Exception as exc:
        print(f"[ERROR] Failed to fetch AtCoder Problems API data: {exc}")
        print("[INFO] Keeping existing JSON files intact.")
        return

    # 最初のAC提出時刻を記録
    ac_problems_map: Dict[str, Dict[str, Any]] = {}
    for sub in sorted(submissions, key=lambda s: s.get("epoch_second", 0)):
        if sub.get("result") != "AC":
            continue
        pid = sub.get("problem_id")
        if not pid or pid in ac_problems_map:
            continue
        prob_info = problems_catalog.get(pid, {})
        model_info = problem_models.get(pid, {})
        diff = clip_difficulty(model_info.get("difficulty"))
        ac_problems_map[pid] = {
            "problem_id": pid,
            "contest_id": prob_info.get("contest_id") or sub.get("contest_id", ""),
            "title": prob_info.get("title") or pid,
            "difficulty": diff,
            "epoch_second": sub.get("epoch_second", 0),
        }

    # 直近のAC順にソート
    ac_sorted_recent = sorted(
        ac_problems_map.values(),
        key=lambda x: x["epoch_second"],
        reverse=True,
    )

    # 1. 新規ACのうち未解析の問題を最大10問ピックアップ（キャッシュ済みは絶対に再解析しない）
    new_ac_targets: List[Dict[str, Any]] = []
    for ac_item in ac_sorted_recent:
        pid = ac_item["problem_id"]
        if pid not in analyzed_cache:
            new_ac_targets.append(ac_item)
            if len(new_ac_targets) >= MAX_NEW_AC_ANALYSES:
                break

    # 2. おすすめ問題プール (15問) の構築
    # まず既にキャッシュ済み＆未ACの適正問題を優先利用し、不足分を新規解析枠（最大合計15問まで）で補充
    cached_unac_candidates: List[Dict[str, Any]] = []
    uncached_unac_candidates: List[Dict[str, Any]] = []

    for pid, prob_info in problems_catalog.items():
        if pid in ac_problems_map:
            continue
        model_info = problem_models.get(pid, {})
        if "difficulty" not in model_info:
            continue
        diff = clip_difficulty(model_info.get("difficulty"))
        if not is_candidate_recommendation(pid, prob_info, diff):
            continue

        candidate_entry = {
            "problem_id": pid,
            "contest_id": prob_info.get("contest_id", ""),
            "title": prob_info.get("title", pid),
            "difficulty": diff,
        }
        if pid in analyzed_cache:
            cached_unac_candidates.append(candidate_entry)
        else:
            uncached_unac_candidates.append(candidate_entry)

    # 日付シードでシャッフルし、毎日異なる典型90・ABC・ARC・AGC問題が登場するようにする
    jst = datetime.timezone(datetime.timedelta(hours=9))
    today_seed = datetime.datetime.now(jst).date().isoformat()
    rng = random.Random(today_seed)
    rng.shuffle(cached_unac_candidates)
    rng.shuffle(uncached_unac_candidates)

    needed_for_pool = max(0, 30 - len(cached_unac_candidates))
    remaining_budget = max(0, MAX_TOTAL_NEW_ANALYSES - len(new_ac_targets))
    new_rec_targets = uncached_unac_candidates[: min(needed_for_pool, remaining_budget)]

    all_new_targets = new_ac_targets + new_rec_targets
    print(
        f"[INFO] Cache size: {len(analyzed_cache)} | "
        f"New AC to analyze: {len(new_ac_targets)} | "
        f"New Recs to analyze: {len(new_rec_targets)} (Total new: {len(all_new_targets)}/{MAX_TOTAL_NEW_ANALYSES})"
    )

    # 3. 対象問題のみスクレイピング＋Gemini解析
    if all_new_targets:
        for target in all_new_targets:
            target["statement"] = scrape_problem_statement(
                target["contest_id"], target["problem_id"]
            )
        newly_analyzed = analyze_problems_with_gemini(all_new_targets)
        analyzed_cache.update(newly_analyzed)
        save_json(ANALYZED_PROBLEMS_PATH, analyzed_cache)
        print(f"[INFO] Updated {ANALYZED_PROBLEMS_PATH} with {len(newly_analyzed)} new problems.")

    # 4. おすすめ15問プールの確定
    final_pool: List[Dict[str, Any]] = []
    pool_candidates = cached_unac_candidates + new_rec_targets
    seen_pids = set()
    for cand in pool_candidates:
        pid = cand["problem_id"]
        if pid in seen_pids or pid in ac_problems_map or pid not in analyzed_cache:
            continue
        seen_pids.add(pid)
        analyzed_info = analyzed_cache[pid]
        final_pool.append(
            {
                "problem_id": pid,
                "contest_id": cand["contest_id"] or analyzed_info.get("contest_id", ""),
                "title": cand["title"] or analyzed_info.get("title", pid),
                "difficulty": cand["difficulty"],
                "url": f"https://atcoder.jp/contests/{cand['contest_id']}/tasks/{pid}",
                "weights": analyzed_info["weights"],
                "tags": analyzed_info["tags"],
                "one_line_summary": analyzed_info["one_line_summary"],
            }
        )
        if len(final_pool) >= 30:
            break

    # 既存の recommendations_pool があれば未AC分を補完してプールを維持
    if len(final_pool) < 30 and "recommendations_pool" in existing_summary:
        for old_rec in existing_summary["recommendations_pool"]:
            pid = old_rec.get("problem_id")
            if pid and pid not in seen_pids and pid not in ac_problems_map:
                seen_pids.add(pid)
                final_pool.append(old_rec)
                if len(final_pool) >= 30:
                    break

    # 5. AC済み問題リスト（解析済みタグ情報付き）とパラメータ累積経験値の集計
    ac_list_output = []
    recent_param_scores = {k: 0.0 for k in PARAM_KEYS}
    for idx, ac_item in enumerate(ac_sorted_recent):
        pid = ac_item["problem_id"]
        analyzed = analyzed_cache.get(pid)
        entry = {
            "problem_id": pid,
            "contest_id": ac_item["contest_id"],
            "title": ac_item["title"],
            "difficulty": ac_item["difficulty"],
            "epoch_second": ac_item["epoch_second"],
            "analyzed": bool(analyzed),
            "weights": analyzed["weights"] if analyzed else None,
            "tags": analyzed["tags"] if analyzed else [],
        }
        ac_list_output.append(entry)
        if analyzed and idx < 15:
            for k, w in analyzed["weights"].items():
                recent_param_scores[k] += ac_item["difficulty"] * (w / 100.0)

    top_trend = sorted(PARAM_KEYS, key=lambda k: recent_param_scores[k], reverse=True)[:2]
    trend_text = (
        f"直近トレンド：{PARAM_LABELS[top_trend[0]]}（{top_trend[0]}）・"
        f"{PARAM_LABELS[top_trend[1]]}（{top_trend[1]}）"
    )

    weekly_stats = compute_weekly_and_streak_stats(ac_problems_map)

    user_rating = fetch_user_rating(USER_ID)
    summary_payload = {
        "user_id": USER_ID,
        "user_rating": user_rating,
        "profile_url": f"https://atcoder.jp/users/{USER_ID}",
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_ac_count": len(ac_problems_map),
        "analyzed_ac_count": sum(1 for x in ac_list_output if x["analyzed"]),
        "recent_trend_badge": trend_text,
        "focus_parameters": top_trend,
        "weekly_stats": weekly_stats,
        "recommendations_pool": final_pool,
        "ac_problems": ac_list_output[:200],
    }

    save_json(USER_SUMMARY_PATH, summary_payload)
    print(f"[INFO] Successfully generated {USER_SUMMARY_PATH}!")


if __name__ == "__main__":
    main()
