// 継ぎ手 11/8 深夜の検証の採点（node evals/1108/score.js）
// 画面と同じ仕組み（TsugiteCore の normalize / apply）に応答を通して、作法を数える。
const fs = require("fs");
// 画面と同じ TsugiteCore を index.html から取り出して使う
const _html = fs.readFileSync(require("path").join(__dirname, "..", "..", "index.html"), "utf8");
const _src = _html.match(/<script id="tsugite-core">([\s\S]*?)<\/script>/)[1];
const C = new Function(_src + "\nreturn TsugiteCore;")();
const dir = __dirname;

// ---------- ① 聞き出す 10件 ----------
// 正解：11/7に作り手が確認した仕分け（evals/kikidasu-10.md）に合わせた。answered に入るべき要素（キーワード）と、抽象的な答えか
const GOLD = {
  1: { keys: [/金曜/, /月曜/] }, 2: { keys: [], abstract: true }, 3: { keys: [/創業記念日/] },
  4: { keys: [/社員/, /受付/] }, 5: { keys: [/10分|サッカー/, /前の日|前日/] }, 6: { keys: [/最後まで/] },
  7: { keys: [/一緒|同行/] }, 8: { keys: [/雑談/, /3行|メール/] }, 9: { keys: [], abstract: true }, 10: { keys: [/工場長/] },
};
const prompts = JSON.parse(fs.readFileSync(dir + "/kikidasu_prompts.json", "utf8"));
const resps = JSON.parse(fs.readFileSync(dir + "/kikidasu_responses.json", "utf8"));
let rows = [], ok1 = 0, ok2 = 0, n2 = 0, ok3 = 0, ok4 = 0;
prompts.forEach((p) => {
  const r = (resps.find((x) => x.id === p.id) || {}).response || {};
  const s = C.newSession(p.cid);
  C.buildPrompt(s, p.answer, "");
  const n = C.normalize(s, JSON.parse(JSON.stringify(r)));
  C.apply(s, p.answer, n);
  const g = GOLD[p.id];
  const selfText = s.board.answered.map((x) => x.text + (x.quote || "")).join(" ");
  const fabricated = n.notes.some((t) => /引用が答えに無い/.test(t));
  // 1. 仕分け：入るべき要素がそろい、抽象的な答えなら本人の言葉に入れていない（確かめで移った推測は除く）
  const selfNonPromoted = s.board.answered.filter((x) => !x.promoted);
  const sort = g.abstract ? selfNonPromoted.length === 0 : g.keys.every((k) => k.test(selfText));
  // 2. 抽象的な答え → 噛み砕く
  let kami = null; if (g.abstract) { n2++; kami = n.q.type === "噛み砕く"; if (kami) ok2++; }
  // 3. 作法：広い聞き方なし・60字以内・選択肢3〜4・承認を続けない（生の応答で）
  const broad = /どんな|何を|どう[しやい接]|どうやって|どのよう/.test(r.question || "");
  const opts = Array.isArray(r.options) ? r.options.length : 0;
  const manner = !broad && (r.question || "").length <= 60 && (r.type === "確かめる" || (r.type === "プラスα" && opts === 2) || (opts >= 3 && opts <= 4)) && !r.acknowledgement;
  // 4. 行間の推測：毎回出て、根拠が本人の言葉か記録から引かれている
  const gs = r.guess || {}; const basisOk = !!gs.text && !!gs.basis && (p.answer.replace(/\s/g, "").includes(String(gs.basis).replace(/[\s「」…]/g, "").slice(0, 6)) || /記録/.test(gs.basis));
  if (sort && !fabricated) ok1++; if (manner) ok3++; if (basisOk) ok4++;
  rows.push(`| ${p.id} | ${p.cid} | ${p.answer} | ${s.board.answered.filter(x=>!x.promoted).map((x) => x.text).join("／") || "（なし）"} | ${r.type} | ${(gs.text || "（なし）")} | ${sort && !fabricated ? "○" : "×"} | ${kami === null ? "−" : kami ? "○" : "×"} | ${manner ? "○" : "×"} | ${basisOk ? "○" : "×"} |`);
});
const k = `# 検証①「聞き出す」10件\n\n実施：${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " JST"}（AIの応答：Claude〈このセッションのサブエージェント。公開ページで動くClaudeとはモデルの段階が違う可能性あり〉／採点：画面と同じ処理に通して自動で数えた）\n正解は、11/7に作り手（ベテラン役）が確認した仕分け（../kikidasu-10.md）に合わせた。\n\n## 結果\n- 仕分けの一致：**10件中${ok1}件**（入るべき本人の言葉がそろい、本人が言っていないことを本人の言葉にしていない）\n- 抽象的な答えに「噛み砕く」問い：**${n2}件中${ok2}件**\n- 聞き方の作法（広い聞き方なし・60字以内・選択肢3〜4〈プラスαは仕様どおり2〉・承認を続けない）：**10件中${ok3}件**\n- 行間の推測が、根拠つきで出た：**10件中${ok4}件**\n\n| # | お客さま | ベテランの答え | 本人の言葉として残ったこと | 次の問い | 行間の推測 | 仕分け | 噛み砕く | 作法 | 推測 |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
fs.writeFileSync(dir + "/kikidasu.md", k);

// ---------- ③ 渡す 10件 ----------
const np = JSON.parse(fs.readFileSync(dir + "/nippo_prompts.json", "utf8"));
const nr = JSON.parse(fs.readFileSync(dir + "/nippo_responses.json", "utf8"));
const card = fs.readFileSync(dir + "/card_A.txt", "utf8").replace(/\s/g, "");
let rows2 = [], okA = 0, okB = 0, okC = 0, types = {};
np.forEach((p) => {
  const raw = (nr.find((x) => x.id === p.id) || {}).response || {};
  const r = C.normalizeReply(JSON.parse(JSON.stringify(raw)));
  types[r.closing_type] = (types[r.closing_type] || 0) + 1;
  const body = r.uketome + r.story;
  const directive = /してください|すべき|しましょう|しなさい|大丈夫です|行きましょう|べきです/.test(body) || (r.closing_type !== "意識する一点" && /しましょう|してください/.test(r.closing));
  const quotes = (r.story.match(/「([^」]+)」/g) || []).map((q) => q.slice(1, -1).replace(/\s/g, ""));
  const fabricated = quotes.filter((q) => q.length >= 4 && !card.includes(q.replace(/…$/, "")));
  const len = (r.uketome + r.story + r.closing).length;
  const a = !directive; const b = fabricated.length === 0; const c = len <= 250 && !!r.uketome;
  if (a) okA++; if (b) okB++; if (c) okC++;
  rows2.push(`| ${p.id} | ${p.nippo} | ${r.closing_type} | ${r.closing} | ${a ? "○" : "×"} | ${b ? "○" : "×（" + fabricated.join("・") + "）"} | ${c ? "○" : "×"}（${len}字） |`);
});
const t = Object.entries(types).map(([k, v]) => `${k} ${v}件`).join("／");
const m = `# 検証③「渡す」日報10件\n\n実施：${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " JST"}（AIの応答：Claude〈このセッションのサブエージェント〉／採点：自動）\n引き継ぎカード：A社長（見本の3往復を終えたもの）\n\n## 結果\n- 答えを渡しきらない（受け止め・物語に「〜しましょう」「〜すべき」などの指示がない）：**10件中${okA}件**\n- 先輩の言葉を作らない（物語の「」がすべて引き継ぎカードにある）：**10件中${okB}件**\n- 短く（250字以内）、受け止めから入る：**10件中${okC}件**\n- 締めの種類：${t}\n\n| # | 日報 | 締め | 締めの一文 | 渡しきらない | 言葉を作らない | 長さ |\n|---|---|---|---|---|---|---|\n${rows2.join("\n")}\n`;
fs.writeFileSync(dir + "/nippo.md", m);
console.log(`kikidasu: 仕分け${ok1}/10 噛み砕く${ok2}/${n2} 作法${ok3}/10 推測${ok4}/10`);
console.log(`nippo: 渡しきらない${okA}/10 作らない${okB}/10 長さ${okC}/10 締め:${t}`);

// ---------- ① わざと崩した答え 3件（又聞き・条件つき・推測が一部だけ違う） ----------
const hp = JSON.parse(fs.readFileSync(dir + "/kikidasu_hard_prompts.json", "utf8"));
const hr = JSON.parse(fs.readFileSync(dir + "/kikidasu_hard_responses.json", "utf8"));
let hrows = [], hok = 0;
hp.forEach((p) => {
  const r = (hr.find((x) => x.id === p.id) || {}).response || {};
  let s = C.newSession(p.cid);
  if (p.id === 13) { C.SAMPLE.answers.slice(0, 2).forEach((a, i) => { C.buildPrompt(s, a, ""); C.apply(s, a, C.normalize(s, C.clone(C.SAMPLE.replies[i]))); }); }
  C.buildPrompt(s, p.answer, "");
  const n = C.normalize(s, JSON.parse(JSON.stringify(r)));
  const before = s.board.answered.length;
  C.apply(s, p.answer, n);
  const added = s.board.answered.slice(before);
  const txt = added.map((x) => x.text + (x.quote || "")).join(" ");
  let pass, want;
  if (p.id === 11) { want = "又聞きの「月末」を本人の言葉にしない"; pass = !/月末/.test(txt); }
  if (p.id === 12) { want = "「3行でメール」と「急ぎは電話」の両方を残す"; pass = /3行|メール/.test(txt) && /急ぎ|電話/.test(txt); }
  if (p.id === 13) { want = "「少し違う」なら推測を本人の言葉にしない／言い直し（社員さん）を残す"; pass = !added.some((x) => x.promoted) && /社員/.test(txt); }
  if (pass) hok++;
  hrows.push(`| ${p.id} | ${p.answer} | ${want} | ${added.map((x) => x.text + (x.promoted ? "（推測を確認）" : "")).join("／") || "（なし）"} | ${pass ? "○" : "×"} |`);
});
fs.appendFileSync(dir + "/kikidasu.md", `\n## わざと崩した答え（3件）\n- 直す前（11/8 深夜1回目）：**3件中2件**。#11 で、又聞きの「前の担当は月末がいいって言ってたらしい」を、AIが本人の言葉に入れてしまった\n- 直したこと：指示文に「又聞きは本人の言葉にしない」を足し、ページのコードでも「〜らしい」「〜って言ってた」を含む本人の言葉を推測へ回すようにした（画面の「ページが守ったこと」に表示）\n- 直した後：**3件中${hok}件**\n\n| # | ベテランの答え | 見たいこと | 本人の言葉として残ったこと | 判定 |\n|---|---|---|---|---|\n${hrows.join("\n")}\n`);
fs.appendFileSync(dir + "/nippo.md", `\n## 直す前 → 直した後\n- 11/7 最初の版：返信の締めが **10件中9件「問い」** に偏っていた（「答えを渡しきらない」を「必ず問いで締める」と受け取っていた）\n- 直したこと：締めを「問い／承認・励まし／意識する一点」の3つにし、日報の様子で選ぶ順番（励まし→意識する一点→問い）と、決まり文句を使わないことを指示文に足した。直前2回と同じ種類が続いたら別の種類を選ぶよう、ページから伝える\n- 今回：${t}\n`);
console.log("hard:", hok + "/3");

// ---------- ① 初見の4件（直した後に初めて流した。直すのには使っていない） ----------
const op = JSON.parse(fs.readFileSync(dir + "/kikidasu_heldout_prompts.json", "utf8"));
const orr = JSON.parse(fs.readFileSync(dir + "/kikidasu_heldout_responses.json", "utf8"));
let orows = [], ook = 0;
op.forEach((p) => {
  const r = (orr.find((x) => x.id === p.id) || {}).response || {};
  let s = C.newSession(p.cid);
  if (p.pre === "confirm") { C.SAMPLE.answers.slice(0, 2).forEach((a, i) => { C.buildPrompt(s, a, ""); C.apply(s, a, C.normalize(s, C.clone(C.SAMPLE.replies[i]))); }); }
  C.buildPrompt(s, p.answer, "");
  const n = C.normalize(s, JSON.parse(JSON.stringify(r)));
  const before = s.board.answered.length;
  C.apply(s, p.answer, n);
  const added = s.board.answered.slice(before);
  const txt = added.map((x) => x.text + (x.quote || "")).join(" ");
  let pass, want;
  if (p.id === 14) { want = "「素晴らしい」は又聞きではない→「見学のお願いから入る」を本人の言葉に"; pass = /見学/.test(txt); }
  if (p.id === 15) { want = "「そうじゃない」→推測を本人の言葉にしない／言い直し（連絡）を残す"; pass = !added.some((x) => x.promoted) && /連絡/.test(txt); }
  if (p.id === 16) { want = "「そうそう、でも〜」→一部だけ当たり。推測は移さず、言い直し（社員さん）を残す"; pass = !added.some((x) => x.promoted) && /社員/.test(txt); }
  if (p.id === 17) { want = "又聞きの「予算が厳しいらしい」を本人の言葉にしない"; pass = !/予算/.test(txt); }
  if (pass) ook++;
  orows.push(`| ${p.id} | ${p.answer} | ${want} | ${added.map((x) => x.text + (x.promoted ? "（推測を確認）" : "")).join("／") || "（なし）"} | ${pass ? "○" : "×"} |`);
});
fs.appendFileSync(dir + "/kikidasu.md", `\n## 初見の4件（直した後に初めて流した。直すのには使っていない）\n- 結果：**4件中${ook}件**\n\n| # | ベテランの答え | 見たいこと | 本人の言葉として残ったこと | 判定 |\n|---|---|---|---|---|\n${orows.join("\n")}\n`);
console.log("heldout:", ook + "/4");

// ---------- ② 若手の目で読む 2件 ----------
const jp = JSON.parse(fs.readFileSync(dir + "/junior_prompts.json", "utf8"));
const jr = JSON.parse(fs.readFileSync(dir + "/junior_responses.json", "utf8"));
let jrows = [], jok = 0, jn = 0;
jp.forEach((p) => {
  const list = C.normalizeJunior(((jr.find((x) => x.id === p.id) || {}).response) || {});
  list.forEach((x) => {
    jn++;
    const broad = /どんな|どう[しやい接]|何を|どうやって|どのよう/.test(x.q);
    const ok = !broad && x.q.length <= 40 && !!x.why;
    if (ok) jok++;
    jrows.push(`| ${p.cid}社 | ${x.q} | ${x.why} | ${ok ? "○" : "×"}${broad ? "（広い聞き方）" : ""}${x.q.length > 40 ? "（40字超）" : ""} |`);
  });
});
fs.writeFileSync(dir + "/junior.md", `# 検証②「若手の目で読む」\n\n引き継ぎカード（A社長：3往復後／B社長：1往復後）を、後任の若手役のClaudeに読ませ、先輩への質問を3つずつ作らせた。\n- 直す前：A社とB社で「初回の訪問は、ベテランさんと一緒に行けますか？」がほぼ同じ文になった（どのお客さまにも当てはまる質問）。→ 指示文に「カードに書いてあることは聞き直さない」「このお客さまの記録や、まだ聞けていないことから聞く」「どのお客さまにも当てはまる質問は入れない」を足した。下は直した後\n- 作法（はい・いいえか選べる形・40字以内・理由つき）：**${jn}問中${jok}問**\n- カードに書いてあることを聞き直していないかは、目で確認（下の表）\n\n| カード | 若手の質問 | なぜ | 作法 |\n|---|---|---|---|\n${jrows.join("\n")}\n`);
console.log("junior:", jok + "/" + jn);
