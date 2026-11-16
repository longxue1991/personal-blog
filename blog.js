(() => {
  const STORAGE_KEY = "codex-blog-custom-posts-v1";
  const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
  const IMAGE_TARGET_BYTES = 1100 * 1024;
  const CLOUD_MANAGER_URL = "https://app.pagescms.org/";
  const REMOTE_POSTS_URL = "content/posts.json";
  const page = document.body.dataset.page;
  const root = document.getElementById("blogEditorRoot");
  const state = { currentPost: null, pendingDelete: null, toastTimer: 0, posts: [], renderVersion: 0 };
  let remotePostsPromise = null;

  if (!root) return;

  initShell();
  if (page === "home") void initHome();
  if (page === "custom-post") void initCustomPost();

  function initShell() {
    root.innerHTML = `
      <dialog class="wechat-dialog" id="wechatDialog" aria-labelledby="wechatDialogTitle">
        <div class="wechat-dialog-shell">
          <header class="dialog-header">
            <div><p class="eyebrow"><span>WECHAT</span><span>ARTICLE</span></p><h2 id="wechatDialogTitle">公众号版</h2></div>
            <button class="icon-button" type="button" data-close-wechat aria-label="关闭公众号预览" title="关闭">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg>
            </button>
          </header>
          <div class="wechat-preview-scroll"><article class="wechat-preview" id="wechatPreview"></article></div>
          <footer class="dialog-footer">
            <p class="dialog-note">图片使用本地嵌入数据</p>
            <div class="dialog-actions">
              <button class="button button-outline" type="button" data-download-wechat>下载 HTML</button>
              <button class="button button-primary" type="button" data-copy-wechat-dialog>复制到公众号</button>
            </div>
          </footer>
        </div>
      </dialog>
      <dialog class="confirm-dialog" id="deletePostDialog" aria-labelledby="deletePostTitle">
        <div class="confirm-dialog-shell">
          <span class="confirm-dialog-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"></path></svg>
          </span>
          <h2 id="deletePostTitle">删除这篇文章？</h2>
          <p id="deletePostCopy">删除后，本浏览器中的文章内容与图片将无法恢复。</p>
          <div class="dialog-actions dialog-actions-end">
            <button class="button button-outline" type="button" data-cancel-delete>取消</button>
            <button class="button button-danger" type="button" data-confirm-delete>删除</button>
          </div>
        </div>
      </dialog>
      <div class="app-toast" id="appToast" role="status" aria-live="polite"></div>
    `;

    document.querySelector("[data-close-wechat]")?.addEventListener("click", () => closeDialog("wechatDialog"));
    document.querySelector("[data-cancel-delete]")?.addEventListener("click", () => closeDialog("deletePostDialog"));
    document.querySelector("[data-confirm-delete]")?.addEventListener("click", confirmDelete);
    document.querySelector("[data-copy-wechat-dialog]")?.addEventListener("click", () => copyWechat(state.currentPost));
    document.querySelector("[data-download-wechat]")?.addEventListener("click", () => downloadWechat(state.currentPost));
  }

  function getLocalPosts() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      return value
        .filter(isValidPost)
        .map((post) => ({ ...post, source: "local" }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } catch {
      return [];
    }
  }

  function saveLocalPosts(posts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  }

  async function getCloudPosts(force = false) {
    if (!remotePostsPromise || force) {
      remotePostsPromise = fetch(`${REMOTE_POSTS_URL}?sync=${Date.now()}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then((data) => {
          const posts = Array.isArray(data) ? data : data?.posts;
          if (!Array.isArray(posts)) throw new Error("云端文章格式不正确");
          return posts
            .filter((post) => post?.published !== false && isValidPost(post))
            .map((post) => ({ ...post, source: "cloud" }));
        })
        .catch((error) => {
          remotePostsPromise = null;
          console.warn("Cloud posts unavailable", error);
          showToast("云端文章暂时无法读取，已显示本地草稿");
          return [];
        });
    }
    return remotePostsPromise;
  }

  async function getPosts(force = false) {
    const [cloudPosts, localPosts] = await Promise.all([getCloudPosts(force), Promise.resolve(getLocalPosts())]);
    const merged = new Map();
    cloudPosts.forEach((post) => merged.set(post.id, post));
    localPosts.forEach((post) => merged.set(post.id, post));
    return [...merged.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function isValidPost(post) {
    return Boolean(post && typeof post.id === "string" && typeof post.title === "string" && typeof post.markdown === "string");
  }

  async function getPost(id) {
    const posts = await getPosts();
    return posts.find((post) => post.id === id) || null;
  }

  function createId() {
    if (window.crypto?.randomUUID) return `post-${window.crypto.randomUUID()}`;
    return `post-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未注明日期";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replaceAll("/", ".");
  }

  function createExcerpt(markdown, fallback = "") {
    const text = markdownToText(markdown).replace(/\s+/g, " ").trim();
    if (!text) return fallback;
    return text.length > 110 ? `${text.slice(0, 109)}…` : text;
  }

  function markdownToText(markdown) {
    const container = document.createElement("div");
    container.innerHTML = renderMarkdown(markdown);
    return container.textContent || "";
  }

  function countReadMinutes(markdown) {
    const text = markdownToText(markdown).replace(/\s/g, "");
    return Math.max(1, Math.ceil(text.length / 400));
  }

  function renderMarkdown(markdown) {
    if (!window.marked?.parse) throw new Error("Markdown 渲染组件未载入");
    const raw = window.marked.parse(markdown || "", { gfm: true, breaks: true });
    const sanitized = window.DOMPurify
      ? window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, ADD_DATA_URI_TAGS: ["img"] })
      : raw;
    const container = document.createElement("div");
    container.innerHTML = sanitized;
    container.querySelectorAll("a").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    return container.innerHTML;
  }

  function showToast(message) {
    const toast = document.getElementById("appToast");
    if (!toast) return;
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  function requestDelete(postId, onDeleted) {
    const post = getLocalPosts().find((item) => item.id === postId);
    if (!post) return;
    state.pendingDelete = { postId, onDeleted };
    const copy = document.getElementById("deletePostCopy");
    if (copy) copy.textContent = `“${post.title}”是一篇本地草稿，删除后只影响当前浏览器。`;
    openDialog("deletePostDialog");
  }

  function confirmDelete() {
    const pending = state.pendingDelete;
    state.pendingDelete = null;
    closeDialog("deletePostDialog");
    if (!pending) return;
    const posts = getLocalPosts().filter((post) => post.id !== pending.postId);
    saveLocalPosts(posts);
    pending.onDeleted?.();
    showToast("本地草稿已删除");
  }

  async function initHome() {
    const mount = document.getElementById("postManagerMount");
    if (mount) {
      mount.innerHTML = `
        <p class="section-note">云端文章跨设备同步；本地草稿仅保存在当前浏览器。</p>
        <div class="post-manager-actions" aria-label="文章管理">
          <a class="button button-primary button-compact" href="${CLOUD_MANAGER_URL}" target="_blank" rel="noopener noreferrer" data-cloud-manager>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>
            云端写作
          </a>
          <button class="button button-outline button-compact" type="button" data-open-editor>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"></path></svg>
            本地草稿
          </button>
          <button class="icon-button" type="button" data-export-posts aria-label="导出本地草稿" title="导出本地草稿">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"></path></svg>
          </button>
          <button class="icon-button" type="button" data-import-posts aria-label="导入本地草稿" title="导入本地草稿">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"></path></svg>
          </button>
          <input class="visually-hidden" type="file" accept="application/json,.json" data-import-file>
        </div>
      `;
    }

    injectEditorDialog();
    bindEditor();
    await renderCustomPosts();

    mount?.querySelector("[data-open-editor]")?.addEventListener("click", openEditor);
    mount?.querySelector("[data-export-posts]")?.addEventListener("click", exportPosts);
    mount?.querySelector("[data-import-posts]")?.addEventListener("click", () => mount.querySelector("[data-import-file]")?.click());
    mount?.querySelector("[data-import-file]")?.addEventListener("change", importPosts);

    document.querySelector(".post-list")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-post]");
      if (!button) return;
      requestDelete(button.dataset.deletePost, () => void renderCustomPosts(true));
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void renderCustomPosts(true);
    });
  }

  async function renderCustomPosts(force = false) {
    const list = document.querySelector(".post-list");
    if (!list) return;
    const renderVersion = ++state.renderVersion;
    const posts = await getPosts(force);
    if (renderVersion !== state.renderVersion) return;
    list.querySelectorAll(".post-row.is-custom").forEach((row) => row.remove());
    const fragment = document.createDocumentFragment();
    state.posts = posts;

    posts.forEach((post) => {
      const isCloud = post.source === "cloud";
      const rowAction = isCloud
        ? `<a class="post-delete post-manage" href="${CLOUD_MANAGER_URL}" target="_blank" rel="noopener noreferrer" aria-label="在云端管理中编辑文章" title="云端编辑">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"></path></svg>
          </a>`
        : `<button class="post-delete" type="button" aria-label="删除本地草稿" title="删除本地草稿" data-delete-post="${escapeAttribute(post.id)}">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"></path></svg>
          </button>`;
      const article = document.createElement("article");
      article.className = `post-row post-row-custom is-custom ${isCloud ? "is-cloud" : "is-local"}`;
      article.dataset.customPostId = post.id;
      article.innerHTML = `
        <span class="post-number">${isCloud ? "CLOUD" : "LOCAL"}</span>
        <div class="post-main">
          <p class="post-kicker">${escapeText(post.category || "随笔").toUpperCase()} / ${isCloud ? "CLOUD" : "LOCAL"}</p>
          <h3><a></a></h3>
          <p></p>
        </div>
        <div class="post-meta"><span></span><span></span></div>
        <div class="post-row-actions">
          <a class="post-arrow" aria-label="阅读文章"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"></path></svg></a>
          ${rowAction}
        </div>
      `;
      const href = `post.html?id=${encodeURIComponent(post.id)}`;
      const titleLink = article.querySelector("h3 a");
      const excerpt = article.querySelector(".post-main > p:last-child");
      const arrow = article.querySelector(".post-arrow");
      const meta = article.querySelectorAll(".post-meta span");
      titleLink.href = href;
      titleLink.textContent = post.title;
      arrow.href = href;
      excerpt.textContent = post.summary || createExcerpt(post.markdown);
      meta[0].textContent = formatDate(post.createdAt);
      meta[1].textContent = `${post.category || "随笔"} / ${post.readMinutes || countReadMinutes(post.markdown)} 分钟`;
      fragment.appendChild(article);
    });

    list.prepend(fragment);
    list.querySelectorAll(".post-number").forEach((number, index) => {
      number.textContent = String(index + 1).padStart(2, "0");
    });
  }

  function exportPosts() {
    const posts = getLocalPosts();
    if (!posts.length) {
      showToast("还没有可导出的本地草稿");
      return;
    }
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), posts }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `codex-blog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${posts.length} 篇本地草稿`);
  }

  async function importPosts(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = (Array.isArray(data) ? data : data.posts)?.filter(isValidPost);
      if (!Array.isArray(incoming)) throw new Error("备份文件格式不正确");
      const merged = new Map(getLocalPosts().map((post) => [post.id, post]));
      incoming.forEach((post) => merged.set(post.id, post));
      saveLocalPosts([...merged.values()]);
      await renderCustomPosts(true);
      showToast(`已导入 ${incoming.length} 篇本地草稿`);
    } catch (error) {
      showToast(error instanceof SyntaxError ? "备份文件无法解析" : error.message);
    }
  }

  function escapeText(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function escapeAttribute(value) {
    return escapeText(value).replaceAll('"', "&quot;");
  }

  function injectEditorDialog() {
    root.insertAdjacentHTML("beforeend", `
      <dialog class="editor-dialog" id="postEditorDialog" aria-labelledby="postEditorTitle">
        <form class="editor-form" id="postEditorForm">
          <header class="dialog-header editor-dialog-header">
            <div><p class="eyebrow"><span>WRITING DESK</span><span>LOCAL DRAFT</span></p><h2 id="postEditorTitle">新建本地草稿</h2></div>
            <button class="icon-button" type="button" data-close-editor aria-label="关闭编辑器" title="关闭">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg>
            </button>
          </header>
          <div class="editor-body">
            <div class="editor-meta-grid">
              <label class="editor-field editor-field-title"><span>标题</span><input name="title" maxlength="90" autocomplete="off" required placeholder="写下这篇文章的标题"></label>
              <label class="editor-field"><span>栏目</span><input name="category" maxlength="28" autocomplete="off" value="随笔"></label>
              <label class="editor-field editor-field-wide"><span>摘要</span><textarea name="summary" rows="2" maxlength="180" placeholder="留空时从正文自动生成"></textarea></label>
            </div>
            <section class="markdown-workbench" aria-label="Markdown 编辑器">
              <div class="markdown-toolbar" role="toolbar" aria-label="Markdown 格式">
                <div class="toolbar-group">
                  <button class="toolbar-button toolbar-button-text" type="button" data-markdown-action="heading" aria-label="二级标题" title="二级标题">H2</button>
                  <button class="toolbar-button toolbar-button-text" type="button" data-markdown-action="bold" aria-label="粗体" title="粗体"><strong>B</strong></button>
                  <button class="toolbar-button toolbar-button-text" type="button" data-markdown-action="italic" aria-label="斜体" title="斜体"><em>I</em></button>
                  <button class="toolbar-button" type="button" data-markdown-action="quote" aria-label="引用" title="引用">
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h6v6H4zM14 7h6v6h-6zM6 13c0 4 1 5 4 6M16 13c0 4 1 5 4 6"></path></svg>
                  </button>
                </div>
                <div class="toolbar-group">
                  <button class="toolbar-button" type="button" data-markdown-action="list" aria-label="无序列表" title="无序列表">
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"></path><circle cx="5" cy="6" r="1"></circle><circle cx="5" cy="12" r="1"></circle><circle cx="5" cy="18" r="1"></circle></svg>
                  </button>
                  <button class="toolbar-button" type="button" data-markdown-action="link" aria-label="插入链接" title="插入链接">
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"></path></svg>
                  </button>
                  <button class="toolbar-button" type="button" data-insert-image aria-label="插入图片" title="插入图片">
                    <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 15-5-5L5 19"></path></svg>
                  </button>
                  <input class="visually-hidden" id="editorImageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                </div>
              </div>
              <div class="markdown-editor-columns">
                <label class="markdown-input-field">
                  <span class="editor-pane-label">Markdown</span>
                  <textarea id="postMarkdown" name="markdown" spellcheck="false" required placeholder="# 从这里开始写"></textarea>
                </label>
                <section class="markdown-preview-pane" aria-label="Markdown 预览">
                  <span class="editor-pane-label">预览</span>
                  <div class="markdown-preview markdown-body" id="markdownPreview"></div>
                </section>
              </div>
              <div class="editor-status-row"><span id="editorStatus" role="status" aria-live="polite"></span><span id="editorCharCount">0 字</span></div>
            </section>
          </div>
          <footer class="dialog-footer editor-footer">
            <div class="dialog-actions">
              <button class="button button-outline" type="button" data-preview-wechat>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5"></path></svg>
                公众号预览
              </button>
            </div>
            <div class="dialog-actions">
              <button class="button button-outline" type="button" data-close-editor>取消</button>
              <button class="button button-primary" type="submit">保存本地草稿</button>
            </div>
          </footer>
        </form>
      </dialog>
    `);
  }

  function bindEditor() {
    const dialog = document.getElementById("postEditorDialog");
    const form = document.getElementById("postEditorForm");
    const markdown = document.getElementById("postMarkdown");
    if (!dialog || !form || !markdown) return;

    dialog.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", closeEditor));
    dialog.querySelector("[data-insert-image]")?.addEventListener("click", () => document.getElementById("editorImageInput")?.click());
    document.getElementById("editorImageInput")?.addEventListener("change", insertImage);
    dialog.querySelectorAll("[data-markdown-action]").forEach((button) => {
      button.addEventListener("click", () => applyMarkdownAction(button.dataset.markdownAction));
    });
    markdown.addEventListener("input", updateEditorPreview);
    form.addEventListener("submit", saveEditorPost);
    dialog.querySelector("[data-preview-wechat]")?.addEventListener("click", previewDraftWechat);
  }

  function openEditor() {
    const dialog = document.getElementById("postEditorDialog");
    const form = document.getElementById("postEditorForm");
    if (!dialog || !form) return;
    form.reset();
    form.elements.category.value = "随笔";
    updateEditorPreview();
    openDialog("postEditorDialog");
    window.setTimeout(() => form.elements.title.focus(), 40);
  }

  function closeEditor() {
    closeDialog("postEditorDialog");
  }

  function updateEditorPreview() {
    const markdown = document.getElementById("postMarkdown");
    const preview = document.getElementById("markdownPreview");
    const counter = document.getElementById("editorCharCount");
    if (!markdown || !preview) return;
    const source = markdown.value;
    try {
      preview.innerHTML = source.trim() ? renderMarkdown(source) : "";
    } catch (error) {
      preview.innerHTML = `<p>${escapeText(error.message)}</p>`;
    }
    if (counter) counter.textContent = `${(preview.textContent || "").replace(/\s/g, "").length} 字`;
  }

  function applyMarkdownAction(action) {
    const textarea = document.getElementById("postMarkdown");
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    let replacement = selected;
    let selectStart = start;
    let selectEnd = end;

    if (action === "bold") {
      replacement = `**${selected || "重点文字"}**`;
      selectStart = start + 2;
      selectEnd = selectStart + (selected || "重点文字").length;
    } else if (action === "italic") {
      replacement = `*${selected || "强调文字"}*`;
      selectStart = start + 1;
      selectEnd = selectStart + (selected || "强调文字").length;
    } else if (action === "heading") {
      replacement = prefixLines(selected || "小标题", "## ");
      selectStart = start + 3;
      selectEnd = selectStart + (selected || "小标题").length;
    } else if (action === "quote") {
      replacement = prefixLines(selected || "引用内容", "> ");
    } else if (action === "list") {
      replacement = prefixLines(selected || "列表项目", "- ");
    } else if (action === "link") {
      const label = selected || "链接文字";
      replacement = `[${label}](https://example.com)`;
      selectStart = start + label.length + 3;
      selectEnd = selectStart + "https://example.com".length;
    }

    textarea.setRangeText(replacement, start, end, "end");
    textarea.focus();
    textarea.setSelectionRange(selectStart, selectEnd);
    updateEditorPreview();
  }

  function prefixLines(value, prefix) {
    return String(value).split("\n").map((line) => `${prefix}${line}`).join("\n");
  }

  async function insertImage(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const status = document.getElementById("editorStatus");
    if (status) status.textContent = "正在处理图片…";
    try {
      const image = await prepareImage(file);
      const textarea = document.getElementById("postMarkdown");
      if (!textarea) return;
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]]/g, "") || "文章图片";
      const snippet = `\n\n![${alt}](${image.dataUrl})\n\n`;
      textarea.setRangeText(snippet, textarea.selectionStart, textarea.selectionEnd, "end");
      textarea.focus();
      updateEditorPreview();
      if (status) status.textContent = `图片已插入，约 ${Math.ceil(image.bytes / 1024)} KB`;
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  }

  async function prepareImage(file) {
    if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
    if (file.size > IMAGE_MAX_BYTES) throw new Error("图片不能超过 8 MB");
    if (file.type === "image/svg+xml") throw new Error("不支持 SVG，请使用 PNG、JPEG、WebP 或 GIF");
    if (file.type === "image/gif") {
      if (file.size > IMAGE_TARGET_BYTES) throw new Error("GIF 请压缩到 1.1 MB 以内");
      return { dataUrl: await blobToDataUrl(file), bytes: file.size };
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      context.drawImage(image, 0, 0, width, height);

      let quality = 0.84;
      let blob = await canvasToBlob(canvas, "image/webp", quality);
      while (blob.size > IMAGE_TARGET_BYTES && quality > 0.6) {
        quality -= 0.08;
        blob = await canvasToBlob(canvas, "image/webp", quality);
      }
      if (blob.size > IMAGE_TARGET_BYTES * 1.6) {
        throw new Error("图片压缩后仍然过大，请换一张尺寸更小的图片");
      }
      return { dataUrl: await blobToDataUrl(blob), bytes: blob.size };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片无法读取"));
      image.src = src;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败")), type, quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(blob);
    });
  }

  function saveEditorPost(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById("editorStatus");
    const title = form.elements.title.value.trim();
    const markdown = form.elements.markdown.value.trim();
    if (!title || !markdown) {
      form.reportValidity();
      return;
    }

    const now = new Date().toISOString();
    const post = {
      id: createId(),
      title,
      category: form.elements.category.value.trim() || "随笔",
      summary: form.elements.summary.value.trim() || createExcerpt(markdown),
      markdown,
      readMinutes: countReadMinutes(markdown),
      createdAt: now,
      updatedAt: now,
    };

    try {
      saveLocalPosts([post, ...getLocalPosts()]);
      renderCustomPosts();
      closeEditor();
      showToast("已保存为本地草稿");
      document.getElementById("writing")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (status) status.textContent = error?.name === "QuotaExceededError" ? "浏览器存储空间不足，请减少图片或导出草稿后清理" : "本地草稿保存失败，请稍后重试";
    }
  }

  function draftFromEditor() {
    const form = document.getElementById("postEditorForm");
    if (!form) return null;
    const markdown = form.elements.markdown.value.trim();
    const title = form.elements.title.value.trim();
    if (!title || !markdown) {
      showToast("先填写标题和正文");
      return null;
    }
    return {
      id: "draft",
      title,
      category: form.elements.category.value.trim() || "随笔",
      summary: form.elements.summary.value.trim() || createExcerpt(markdown),
      markdown,
      readMinutes: countReadMinutes(markdown),
      createdAt: new Date().toISOString(),
    };
  }

  function previewDraftWechat() {
    const post = draftFromEditor();
    if (post) showWechatPreview(post);
  }

  async function initCustomPost() {
    const id = new URLSearchParams(window.location.search).get("id");
    const post = id ? await getPost(id) : null;
    const article = document.getElementById("dynamicArticle");
    const missing = document.getElementById("dynamicArticleMissing");
    if (!post || !article || !missing) {
      if (article) article.hidden = true;
      if (missing) missing.hidden = false;
      return;
    }

    state.currentPost = post;
    article.hidden = false;
    missing.hidden = true;
    document.title = `${post.title}｜代码工作台`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", post.summary || createExcerpt(post.markdown));
    document.getElementById("dynamicCategory").textContent = post.category || "随笔";
    document.getElementById("dynamicDate").textContent = formatDate(post.createdAt);
    document.getElementById("dynamicTitle").textContent = post.title;
    document.getElementById("dynamicSummary").textContent = post.summary || createExcerpt(post.markdown);
    document.getElementById("dynamicReadTime").textContent = `约 ${post.readMinutes || countReadMinutes(post.markdown)} 分钟`;
    document.getElementById("dynamicCategoryMeta").textContent = `${post.category || "随笔"} · ${post.source === "cloud" ? "云端" : "本地草稿"}`;
    document.getElementById("dynamicBody").innerHTML = renderMarkdown(post.markdown);

    document.querySelector("[data-wechat-preview]")?.addEventListener("click", () => showWechatPreview(post));
    document.querySelector("[data-copy-wechat]")?.addEventListener("click", () => copyWechat(post));
    const deleteButton = document.querySelector("[data-delete-current-post]");
    const manageLink = document.querySelector("[data-manage-current-post]");
    if (post.source === "cloud") {
      if (deleteButton) deleteButton.hidden = true;
      if (manageLink) {
        manageLink.hidden = false;
        manageLink.href = CLOUD_MANAGER_URL;
      }
    } else {
      if (manageLink) manageLink.hidden = true;
      deleteButton?.addEventListener("click", () => {
        requestDelete(post.id, () => { window.location.href = "index.html#writing"; });
      });
    }
  }

  function showWechatPreview(post) {
    if (!post) return;
    state.currentPost = post;
    const preview = document.getElementById("wechatPreview");
    const heading = document.getElementById("wechatDialogTitle");
    if (preview) preview.innerHTML = buildWechatContent(post);
    if (heading) heading.textContent = post.title;
    openDialog("wechatDialog");
  }

  function buildWechatContent(post) {
    const source = document.createElement("div");
    source.innerHTML = renderMarkdown(post.markdown);
    styleWechatNodes(source);

    const wrapper = document.createElement("section");
    wrapper.setAttribute("style", "box-sizing:border-box;max-width:100%;margin:0 auto;padding:8px 2px 24px;color:#27332e;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;line-height:1.9;letter-spacing:0.02em;word-break:break-word;");

    const title = document.createElement("h1");
    title.textContent = post.title;
    title.setAttribute("style", "margin:16px 0 14px;color:#17231f;font-family:'Songti SC','STSong',serif;font-size:28px;font-weight:700;line-height:1.35;letter-spacing:0;");

    const meta = document.createElement("p");
    meta.textContent = `${formatDate(post.createdAt)} · ${post.category || "随笔"} · 约 ${post.readMinutes || countReadMinutes(post.markdown)} 分钟`;
    meta.setAttribute("style", "margin:0 0 24px;color:#7b8a83;font-size:12px;line-height:1.7;letter-spacing:0.04em;");

    wrapper.append(title, meta);
    if (post.summary) {
      const summary = document.createElement("p");
      summary.textContent = post.summary;
      summary.setAttribute("style", "margin:0 0 28px;padding:16px 18px;color:#42554d;background:#f4f7f3;border-left:3px solid #d9573f;font-size:15px;line-height:1.85;");
      wrapper.append(summary);
    }
    while (source.firstChild) wrapper.append(source.firstChild);
    return wrapper.outerHTML;
  }

  function styleWechatNodes(container) {
    container.querySelectorAll("p").forEach((node) => {
      node.setAttribute("style", "margin:0 0 20px;color:#333d38;font-size:16px;line-height:1.95;text-align:justify;");
    });
    container.querySelectorAll("h1, h2, h3, h4").forEach((node) => {
      node.setAttribute("style", "margin:32px 0 14px;color:#17231f;font-family:'Songti SC','STSong',serif;font-weight:700;line-height:1.45;letter-spacing:0;");
    });
    container.querySelectorAll("h2").forEach((node) => node.setAttribute("style", "margin:36px 0 15px;padding-left:12px;color:#17231f;border-left:4px solid #21483a;font-family:'Songti SC','STSong',serif;font-size:22px;font-weight:700;line-height:1.5;"));
    container.querySelectorAll("h3").forEach((node) => node.setAttribute("style", "margin:30px 0 12px;color:#21483a;font-family:'Songti SC','STSong',serif;font-size:19px;font-weight:700;line-height:1.55;"));
    container.querySelectorAll("blockquote").forEach((node) => {
      node.setAttribute("style", "margin:28px 0;padding:16px 18px;color:#33483f;background:#f4f7f3;border-left:4px solid #d9573f;font-family:'Songti SC','STSong',serif;font-size:17px;font-weight:600;line-height:1.85;");
    });
    container.querySelectorAll("ul, ol").forEach((node) => node.setAttribute("style", "margin:0 0 22px;padding-left:1.5em;color:#333d38;font-size:16px;line-height:1.9;"));
    container.querySelectorAll("li").forEach((node) => node.setAttribute("style", "margin:6px 0;padding-left:2px;"));
    container.querySelectorAll("a").forEach((node) => node.setAttribute("style", "color:#2859a6;text-decoration:underline;text-underline-offset:2px;"));
    container.querySelectorAll("img").forEach((node) => node.setAttribute("style", "display:block;max-width:100%;height:auto;margin:26px auto;border-radius:4px;"));
    container.querySelectorAll("hr").forEach((node) => node.setAttribute("style", "margin:34px 0;border:0;border-top:1px solid #dce5df;"));
    container.querySelectorAll("pre").forEach((node) => node.setAttribute("style", "margin:22px 0;padding:16px;overflow-x:auto;color:#eaf2ed;background:#17231f;border-radius:4px;font-size:13px;line-height:1.75;white-space:pre-wrap;"));
    container.querySelectorAll("code").forEach((node) => {
      if (node.parentElement?.tagName !== "PRE") node.setAttribute("style", "padding:2px 5px;color:#21483a;background:#edf3ef;border-radius:3px;font-family:Consolas,monospace;font-size:0.92em;");
    });
    container.querySelectorAll("table").forEach((node) => node.setAttribute("style", "width:100%;margin:22px 0;border-collapse:collapse;font-size:13px;line-height:1.7;"));
    container.querySelectorAll("th, td").forEach((node) => node.setAttribute("style", "padding:8px 10px;border:1px solid #dce5df;text-align:left;vertical-align:top;"));
    container.querySelectorAll("th").forEach((node) => node.setAttribute("style", "padding:8px 10px;color:#21483a;background:#f4f7f3;border:1px solid #dce5df;text-align:left;font-weight:700;"));
  }

  async function copyWechat(post) {
    if (!post) {
      showToast("还没有可复制的文章");
      return;
    }
    const html = buildWechatContent(post);
    const plain = `${post.title}\n\n${post.summary || ""}\n\n${markdownToText(post.markdown)}`.trim();
    try {
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        fallbackCopyHtml(html);
      }
      const hasImages = /<img\b/i.test(html);
      showToast(hasImages ? "已复制；公众号若未显示图片，请在后台重新上传" : "已复制到公众号");
    } catch {
      try {
        fallbackCopyHtml(html);
        showToast("已复制到公众号");
      } catch {
        showToast("复制失败，请使用“下载 HTML”");
      }
    }
  }

  function fallbackCopyHtml(html) {
    const container = document.createElement("div");
    container.contentEditable = "true";
    container.innerHTML = html;
    Object.assign(container.style, { position: "fixed", left: "-10000px", top: "0", width: "720px", background: "#fff" });
    document.body.append(container);
    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const copied = document.execCommand("copy");
    selection.removeAllRanges();
    container.remove();
    if (!copied) throw new Error("Copy failed");
  }

  function downloadWechat(post) {
    if (!post) return;
    const body = buildWechatContent(post);
    const documentHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(post.title)}</title></head><body style="margin:0;padding:24px;background:#fff;">${body}</body></html>`;
    const url = URL.createObjectURL(new Blob([documentHtml], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${post.title.replace(/[\\/:*?"<>|]/g, "-")}-公众号版.html`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("公众号 HTML 已下载");
  }
})();
