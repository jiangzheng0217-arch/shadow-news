const els = {
  hours: document.querySelector("#hours"),
  refresh: document.querySelector("#refresh"),
  status: document.querySelector("#status"),
  filters: document.querySelector("#filters"),
  topics: document.querySelector("#topics"),
  topicCount: document.querySelector("#topicCount"),
  heroCount: document.querySelector("#heroCount"),
  detail: document.querySelector("#detail"),
  draft: document.querySelector("#draft"),
  openSource: document.querySelector("#openSource"),
  copyHtml: document.querySelector("#copyHtml"),
  copyBrief: document.querySelector("#copyBrief"),
};

const labels = {
  freshness: "新鲜度",
  demo: "可实测",
  visual: "视觉性",
  spread: "传播性",
  debate: "争议性",
};

let topics = [];
let selectedTopic = null;
let activeFilter = "全部";
let currentDraft = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 1700);
}

async function copyText(text, success) {
  try {
    await navigator.clipboard.writeText(text);
    toast(success);
  } catch {
    toast("复制失败，浏览器未开放剪贴板权限");
  }
}

function visibleTopics() {
  if (activeFilter === "全部") return topics;
  if (activeFilter === "可实测") return topics.filter((topic) => topic.scores.demo >= 8);
  if (activeFilter === "高传播") return topics.filter((topic) => topic.scores.spread >= 8);
  return topics.filter((topic) => topic.categoryLabel === activeFilter);
}

function filterStatusText(list) {
  if (activeFilter === "全部") return `已连接，已生成 ${topics.length} 个候选，按综合分排序。`;
  return `当前筛选：${activeFilter} · ${list.length} 条候选。点击“全部”返回完整列表。`;
}

function renderFilters() {
  const counts = topics.reduce(
    (acc, topic) => {
      acc[topic.categoryLabel] = (acc[topic.categoryLabel] || 0) + 1;
      if (topic.scores.demo >= 8) acc["可实测"] = (acc["可实测"] || 0) + 1;
      if (topic.scores.spread >= 8) acc["高传播"] = (acc["高传播"] || 0) + 1;
      return acc;
    },
    { 全部: topics.length },
  );
  const order = ["全部", "可实测", "高传播", "产品发布", "模型发布", "行业动态", "技巧观点", "论文研究", "未分类"];
  els.filters.innerHTML = order
    .filter((label) => counts[label])
    .map(
      (label) => `
        <button type="button" class="filter ${activeFilter === label ? "active" : ""}" data-filter="${escapeHtml(label)}" aria-pressed="${activeFilter === label}">
          ${escapeHtml(label)} <span>${counts[label]}</span>
        </button>
      `,
    )
    .join("");
}

function renderScores(scores) {
  return Object.entries(labels)
    .map(([key, label]) => `<span>${label}<strong>${escapeHtml(scores[key])}</strong></span>`)
    .join("");
}

function renderTopics({ preserveScroll = false } = {}) {
  const list = visibleTopics();
  const scrollTop = els.topics.scrollTop;
  els.topicCount.textContent = `${list.length} 条`;
  renderFilters();
  els.topics.innerHTML = list
    .map(
      (topic, index) => `
        <article class="topic-card ${selectedTopic?.id === topic.id ? "active" : ""}" data-id="${escapeHtml(topic.id)}">
          <div class="topic-rank">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <i></i>
          </div>
          <div class="topic-body">
            <div class="topic-meta">
              <span>${escapeHtml(topic.categoryLabel)}</span>
              <span>${escapeHtml(topic.timeText)}</span>
              <b>热度 ${escapeHtml(topic.scores.total)}</b>
            </div>
            <h3>${escapeHtml(topic.clearTitle || topic.title)}</h3>
            <div class="tag-row">${(topic.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
            <div class="score-row">${renderScores(topic.scores)}</div>
          </div>
        </article>
      `,
    )
    .join("");
  if (preserveScroll) els.topics.scrollTop = scrollTop;
}

function buildBrief(topic) {
  if (!topic) return "";
  return [
    `标题：${topic.clearTitle || topic.title}`,
    `一句话：${topic.publicCards?.what || topic.summary || ""}`,
    `为什么值得看：${topic.publicCards?.why || topic.why || ""}`,
    `适合谁：${topic.publicCards?.who || ""}`,
    `来源：${topic.source}`,
    `原文：${topic.url}`,
  ].join("\n");
}

function renderDetail(topic) {
  if (!topic) {
    els.detail.className = "detail-empty";
    els.detail.innerHTML = "<strong>等待信号</strong><p>选中一个选题后，这里会显示来源、热度、摘要和判断。</p>";
    return;
  }

  els.detail.className = "detail";
  els.detail.innerHTML = `
    <article class="lead-story">
      <div class="lead-score"><span>热度</span><strong>${escapeHtml(topic.scores.total)}</strong></div>
      <h3>${escapeHtml(topic.clearTitle || topic.title)}</h3>
      <div class="lead-meta">
        <span>${escapeHtml(topic.categoryLabel)}</span>
        <span>${escapeHtml(topic.source)}</span>
        <span>${escapeHtml(topic.timeText)}</span>
      </div>
      <p>${escapeHtml(topic.summary || "暂无摘要，需要人工补充事实。")}</p>
    </article>
    <div class="detail-grid">
      <section><h4>这是什么</h4><p>${escapeHtml(topic.publicCards?.what || topic.summary || "暂无摘要。")}</p></section>
      <section><h4>为什么和你有关</h4><p>${escapeHtml(topic.publicCards?.why || topic.why || "需要继续查看原文。")}</p></section>
      <section><h4>适合谁看</h4><p>${escapeHtml(topic.publicCards?.who || "适合想快速了解 AI 新动向的人。")}</p></section>
      <section><h4>下一步</h4><p>${escapeHtml(topic.publicCards?.action || "可以打开原文继续查看。")}</p></section>
    </div>
  `;
}

function renderActionCard(topic, preview = null) {
  if (!topic) return;
  currentDraft = { html: buildBrief(topic), titleVariants: [topic.clearTitle || topic.title] };
  els.draft.className = "action-card";
  els.draft.innerHTML = `
    <section class="draft-block link-block">
      <h3>原文链接</h3>
      <p class="url-line">${escapeHtml(topic.url)}</p>
      <div class="action-row">
        <a class="primary-link" href="${escapeHtml(topic.url)}" target="_blank" rel="noopener noreferrer">打开原文</a>
        <button type="button" data-action="copy-url">复制链接</button>
        <button type="button" data-action="load-preview">读取原网页信息</button>
      </div>
    </section>
    <section class="draft-block">
      <h3>原网页信息</h3>
      <div id="sourcePreview" class="source-preview">
        ${
          preview
            ? `<p><strong>${escapeHtml(preview.meta?.title || "未读取到网页标题")}</strong></p>
               <p>${escapeHtml(preview.meta?.description || "未读取到网页描述，可能是登录、反爬、付费墙或非 HTML 页面。")}</p>
               <small>HTTP ${escapeHtml(preview.status)} · ${escapeHtml(preview.meta?.siteName || preview.contentType || "未知类型")}</small>`
            : `<p>点击“读取原网页信息”后，会尝试读取原站标题和描述。部分网站如 X、付费媒体或需要登录的网站可能无法读取。</p>`
        }
      </div>
    </section>
  `;
}

function selectTopic(topic, shouldScroll = false) {
  selectedTopic = topic;
  renderTopics({ preserveScroll: true });
  renderDetail(topic);
  renderActionCard(topic);
  if (shouldScroll || window.matchMedia("(max-width: 760px)").matches) {
    document.querySelector("#detailPane")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function loadTopics() {
  els.status.textContent = "正在刷新精选并打分...";
  els.refresh.disabled = true;
  try {
    const response = await fetch(`/api/topics?hours=${els.hours.value}&take=60`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "抓取失败");
    topics = payload.topics || [];
    activeFilter = "全部";
    selectedTopic = topics[0] || null;
    els.heroCount.textContent = `${topics.length} live signals`;
    els.status.textContent = `已连接，已生成 ${topics.length} 个候选，按综合分排序。`;
    renderTopics();
    renderDetail(selectedTopic);
    if (selectedTopic) renderActionCard(selectedTopic);
  } catch (error) {
    els.status.textContent = `出错：${error.message}`;
  } finally {
    els.refresh.disabled = false;
  }
}

function openSelectedSource() {
  if (!selectedTopic?.url) return toast("还没有选中的原文");
  const opened = window.open(selectedTopic.url, "_blank", "noopener,noreferrer");
  if (!opened) copyText(selectedTopic.url, "浏览器拦截了新窗口，已复制原文链接");
}

els.refresh.addEventListener("click", loadTopics);
els.hours.addEventListener("change", loadTopics);
els.filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  const list = visibleTopics();
  selectedTopic = list[0] || topics[0] || null;
  els.status.textContent = filterStatusText(list);
  renderTopics();
  els.topics.scrollTop = 0;
  renderDetail(selectedTopic);
  if (selectedTopic) renderActionCard(selectedTopic);
});
els.topics.addEventListener("click", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  const topic = topics.find((item) => item.id === card.dataset.id);
  if (topic) selectTopic(topic, true);
});
document.querySelector(".hero").addEventListener("click", (event) => {
  const button = event.target.closest("[data-jump]");
  if (!button) return;
  document.querySelector(button.dataset.jump === "detail" ? "#detailPane" : "#topicsPane")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
els.openSource.addEventListener("click", openSelectedSource);
els.copyHtml.addEventListener("click", () => {
  if (!selectedTopic) return toast("还没有选题");
  copyText(buildBrief(selectedTopic), "已复制说明");
});
els.copyBrief.addEventListener("click", () => {
  if (!selectedTopic || !currentDraft) return toast("还没有选题卡");
  const brief = [
    `选题：${selectedTopic.clearTitle || selectedTopic.title}`,
    `原题：${selectedTopic.originalTitle || selectedTopic.title}`,
    `来源：${selectedTopic.source}`,
    `综合分：${selectedTopic.scores.total}`,
    `为什么值得写：${selectedTopic.why || ""}`,
    `推荐标题：${currentDraft.titleVariants[0]}`,
    `链接：${selectedTopic.url}`,
  ].join("\n");
  copyText(brief, "已复制选题卡");
});
els.draft.addEventListener("click", async (event) => {
  if (event.target.closest("[data-action='copy-url']")) {
    if (!selectedTopic?.url) return toast("还没有原文链接");
    return copyText(selectedTopic.url, "已复制原文链接");
  }
  if (event.target.closest("[data-action='load-preview']")) {
    if (!selectedTopic?.url) return toast("还没有原文链接");
    const preview = document.querySelector("#sourcePreview");
    if (preview) preview.innerHTML = "<p>正在读取原网页信息...</p>";
    try {
      const response = await fetch(`/api/source-preview?url=${encodeURIComponent(selectedTopic.url)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取失败");
      renderActionCard(selectedTopic, payload);
    } catch (error) {
      if (preview) preview.innerHTML = `<p>读取失败：${escapeHtml(error.message)}。你仍然可以直接打开或复制原文链接。</p>`;
    }
  }
});

loadTopics();
