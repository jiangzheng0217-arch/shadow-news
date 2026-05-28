const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 5188);
const ua =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 aihot-skill/0.2.0";

const categoryLabels = {
  "ai-models": "模型发布",
  "ai-products": "产品发布",
  industry: "行业动态",
  paper: "论文研究",
  tip: "技巧观点",
  uncategorized: "未分类",
};

const scoreWeights = {
  "ai-models": { freshness: 9, demo: 7, visual: 7, spread: 8, debate: 6 },
  "ai-products": { freshness: 8, demo: 9, visual: 8, spread: 8, debate: 5 },
  industry: { freshness: 8, demo: 4, visual: 5, spread: 7, debate: 8 },
  paper: { freshness: 7, demo: 6, visual: 5, spread: 6, debate: 7 },
  tip: { freshness: 7, demo: 8, visual: 7, spread: 7, debate: 6 },
  uncategorized: { freshness: 6, demo: 5, visual: 5, spread: 5, debate: 5 },
};

const products = [
  "OpenAI",
  "Claude Code",
  "Claude",
  "Codex",
  "ChatGPT",
  "Gemini",
  "DeepSeek",
  "Kimi",
  "Qwen",
  "Seedance",
  "Sora",
  "Runway",
  "Kling",
  "PixVerse",
  "Replit",
  "Squidler",
  "StepAudio",
  "StepFun",
  "Project Genie",
  "Models.dev",
  "Hugging Face",
  "GitHub",
  "Copilot",
];

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = decoded === "/" ? "index.html" : `.${decoded}`;
  const resolved = path.resolve(publicDir, target);
  return resolved.startsWith(publicDir) ? resolved : path.join(publicDir, "index.html");
}

function clamp(value) {
  return Math.max(1, Math.min(10, Math.round(value * 10) / 10));
}

function cleanSentence(value = "", length = 96) {
  const cleaned = String(value)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > length ? `${cleaned.slice(0, length)}...` : cleaned;
}

function humanTime(iso) {
  if (!iso) return "时间未知";
  const date = new Date(iso);
  const hours = Math.round((Date.now() - date.getTime()) / 36e5);
  if (hours <= 1) return "1 小时内";
  if (hours < 24) return `${hours} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function boost(text, words, amount) {
  const haystack = text.toLowerCase();
  return words.some((word) => haystack.includes(String(word).toLowerCase())) ? amount : 0;
}

function removeNoise(title = "") {
  return String(title)
    .replace(/^v?\d+(?:\.\d+){1,3}\s*/i, "")
    .replace(/更新摘要|release notes?|changelog/gi, "更新")
    .replace(/[｜|].*$/, "")
    .trim();
}

function findProduct(item) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`;
  if (/claude[-\s]?code/i.test(text)) return "Claude Code";
  if (/stepaudio/i.test(text)) return "StepAudio 2.5";
  return products.find((name) => text.toLowerCase().includes(name.toLowerCase())) || "";
}

function scoreItem(item) {
  const category = item.category || "uncategorized";
  const base = scoreWeights[category] || scoreWeights.uncategorized;
  const text = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`;
  const ageHours = item.publishedAt ? (Date.now() - new Date(item.publishedAt).getTime()) / 36e5 : 48;
  const freshness = clamp(base.freshness + (ageHours < 12 ? 1 : ageHours > 72 ? -1.5 : 0));
  const demo = clamp(base.demo + boost(text, ["github", "开源", "demo", "发布", "工具", "agent", "workflow", "api"], 1.1) - boost(text, ["融资", "观点"], 1));
  const visual = clamp(base.visual + boost(text, ["视频", "图像", "可视化", "角色", "机器人", "Runway", "Kling"], 1.4));
  const spread = clamp(base.spread + boost(text, ["OpenAI", "Claude", "Anthropic", "Google", "Meta", "Qwen", "Kimi"], 1));
  const debate = clamp(base.debate + boost(text, ["安全", "隐私", "取代", "成本", "攻击", "封闭", "开源", "超越"], 1.2));
  const total = clamp(freshness * 0.24 + demo * 0.24 + visual * 0.18 + spread * 0.2 + debate * 0.14);
  return { freshness, demo, visual, spread, debate, total };
}

function makeReadableTitle(item, scores) {
  const title = removeNoise(item.title);
  const summary = item.summary || "";
  const product = findProduct(item);
  const category = categoryLabels[item.category || "uncategorized"] || "AI 动态";
  const text = `${title} ${summary}`.toLowerCase();
  if (/飞书/.test(text) && /claude[-\s]?code/i.test(text)) return "飞书接上 Claude Code：在聊天里指挥本机 Agent";
  if (/stepaudio/i.test(text) || /副语言|语气|语速|实时语音/.test(text)) return "StepAudio 2.5：实时语音能听懂语气了？";
  if (/replit/i.test(text) && /squidler/i.test(text)) return "Replit Agent 加上自动测试，AI 写应用更闭环了？";
  if (/pixverse/i.test(text) && /图像生成|create image/i.test(text)) return "PixVerse 手机端也能直接生成图片了？";
  if (/project genie/i.test(text) && /街景|street view/i.test(text)) return "Google 街景能变成交互式世界了？";
  if (/微软/.test(title) && /成本|工资|人工/.test(title)) return "微软提醒：AI Agent 现在未必比人工便宜";
  if (/更新|修复|改进|upgrade|update/.test(text)) return `${product || title || category} 更新：哪些变化值得看？`;
  if (/开源|github|repo|项目|database|数据库/.test(text)) return `${product || title || category}：一个值得拆解的开源项目`;
  if (/发布|上线|推出|launch|released?/.test(text)) return `${product || title || category}：这次新增了什么能力？`;
  if (/视频|图像|生成|seedance|sora|runway|kling/.test(text)) return `${product || title || category}：这次的视觉能力强在哪？`;
  if (/价格|定价|成本|收费|pricing/.test(text)) return `${product || title || category}：AI 产品成本又有新信号`;
  if (scores.debate >= 8) return `${product || category} 引发讨论：机会和风险各在哪？`;
  if (scores.demo >= 8) return `${product || title || category}：普通人能不能马上用？`;
  if (title.length >= 8 && title.length <= 34) return title;
  return `${category}：${title || cleanSentence(summary, 26) || "一条值得跟进的新信号"}`;
}

function makeWhy(item, scores) {
  const summary = cleanSentence(item.summary, 92);
  if (scores.demo >= 8) return `它可能马上能用：可以变成工具教程、截图演示或工作流案例。${summary}`;
  if (scores.spread >= 8) return `它值得关注：牵涉到大公司、主流工具或热门产品，普通读者更容易遇到。${summary}`;
  if (scores.debate >= 8) return `它有讨论价值：背后涉及成本、隐私、安全、开源或替代人的问题。${summary}`;
  return `它适合先看懂再判断：重点不是追概念，而是看它能不能解决一个具体问题。${summary}`;
}

function makeTags(item, scores) {
  const tags = [categoryLabels[item.category || "uncategorized"] || "AI 动态"];
  if (scores.demo >= 8) tags.push("可实测");
  if (scores.visual >= 8) tags.push("适合配图");
  if (scores.spread >= 8) tags.push("传播潜力");
  if (scores.debate >= 8) tags.push("有争议");
  return tags.slice(0, 4);
}

function makeCards(item, scores) {
  const summary = item.summary || "暂无摘要。";
  const category = categoryLabels[item.category || "uncategorized"] || "AI 动态";
  const product = findProduct(item) || "这个 AI 动态";
  return {
    what: `${product} 相关的一条${category}。简单说：${cleanSentence(summary, 120)}`,
    why: makeWhy(item, scores),
    who: scores.demo >= 8 ? "适合想尝试新工具、做内容、写代码或优化工作流的人。" : scores.debate >= 8 ? "适合关心 AI 成本、职业影响、公司决策和行业趋势的人。" : "适合想快速了解 AI 新动向，但不想读长篇技术新闻的人。",
    action: scores.demo >= 8 ? "可以点原文看是否有 Demo、教程、GitHub 项目或使用入口。" : "建议先看原文来源和发布时间，再决定是否继续跟进。",
  };
}

function transformItem(item) {
  const scores = scoreItem(item);
  return {
    id: item.id,
    title: item.title,
    originalTitle: item.title,
    extraTitle: item.title_en || "",
    clearTitle: makeReadableTitle(item, scores),
    why: makeWhy(item, scores),
    tags: makeTags(item, scores),
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    timeText: humanTime(item.publishedAt),
    summary: item.summary,
    category: item.category || "uncategorized",
    categoryLabel: categoryLabels[item.category || "uncategorized"] || "未分类",
    scores,
    publicCards: makeCards(item, scores),
  };
}

async function fetchTopics(hours = 48, take = 60) {
  const since = encodeURIComponent(new Date(Date.now() - hours * 36e5).toISOString());
  const target = `https://aihot.virxact.com/api/public/items?mode=selected&since=${since}&take=${take}`;
  const response = await fetch(target, { headers: { "user-agent": ua } });
  if (!response.ok) throw new Error(`AIHOT returned ${response.status}`);
  const payload = await response.json();
  return (payload.items || []).map(transformItem).sort((a, b) => b.scores.total - a.scores.total);
}

function extractMeta(html = "") {
  const clean = (value = "") => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 260);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1];
  const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1];
  return { title: clean(title), description: clean(description), siteName: clean(siteName) };
}

async function fetchSourcePreview(rawUrl) {
  const target = new URL(rawUrl);
  if (!/^https?:$/.test(target.protocol)) throw new Error("Only http/https links are supported");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(target, {
      headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return { ok: response.ok, status: response.status, url: response.url, contentType, meta: null };
    }
    return { ok: response.ok, status: response.status, url: response.url, contentType, meta: extractMeta(await response.text()) };
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/topics") {
      const hours = Number(url.searchParams.get("hours") || 48);
      const take = Number(url.searchParams.get("take") || 60);
      sendJson(res, 200, { generatedAt: new Date().toISOString(), hours, topics: await fetchTopics(hours, take) });
      return;
    }
    if (url.pathname === "/api/source-preview") {
      const target = url.searchParams.get("url");
      if (!target) return sendJson(res, 400, { error: "Missing url" });
      sendJson(res, 200, await fetchSourcePreview(target));
      return;
    }
    sendFile(res, safePath(url.pathname));
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Shadow News running at http://127.0.0.1:${port}`);
});
