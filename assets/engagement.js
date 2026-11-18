/**
 * 代码工作台 · 互动组件（浏览量 / 点赞 / 留言）
 *
 * 使用方法：
 *   1. 把部署好的 Worker 地址填到下面的 API_BASE
 *   2. 将本文件放到博客仓库 assets/engagement.js
 *   3. 在 post.html 的 </body> 前、blog.js 之后加一行：
 *      <script src="assets/engagement.js" defer></script>
 *
 * 无依赖、无构建，自动兼容站点的深浅色主题；
 * API 不可用时静默降级，不影响文章正常阅读。
 */
(function () {
  "use strict";

  // ============ 部署后请替换为你的 Worker 地址 ============
  var API_BASE = "https://blog-engagement.caoxuelong.workers.dev";

  var VISITOR_KEY = "wb_visitor_id";
  var LIKED_KEY = "wb_liked_posts";
  var VIEWED_KEY = "wb_viewed_session";

  // ---------- 工具 ----------

  function getPostId() {
    return new URLSearchParams(location.search).get("id") || "";
  }

  function getVisitorId() {
    var v = null;
    try { v = localStorage.getItem(VISITOR_KEY); } catch (e) { /* 隐私模式 */ }
    if (!v) {
      v = (crypto.randomUUID && crypto.randomUUID()) ||
        "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(VISITOR_KEY, v); } catch (e) { /* ignore */ }
    }
    return v;
  }

  function getLikedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }

  function saveLikedSet(set) {
    try { localStorage.setItem(LIKED_KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ }
  }

  function api(path, options) {
    return fetch(API_BASE + path, options).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (json) {
      if (!json.ok) throw new Error(json.error || "api error");
      return json.data;
    });
  }

  function relTime(ts) {
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前";
    var d = Math.floor(h / 24);
    if (d < 30) return d + " 天前";
    var date = new Date(ts);
    return date.getFullYear() + "." + String(date.getMonth() + 1).padStart(2, "0") + "." + String(date.getDate()).padStart(2, "0");
  }

  // ---------- 样式（注入一次，灰度配色天然适配深浅主题） ----------

  var CSS = [
    ".wb-engagement{margin-top:2.75rem;padding-top:1.75rem;border-top:1px solid rgba(128,128,128,.28);",
    "font:inherit;color:inherit}",
    ".wb-stats{display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap}",
    ".wb-stat{display:inline-flex;align-items:center;gap:.4rem;opacity:.75;font-size:.9rem}",
    ".wb-like-btn{display:inline-flex;align-items:center;gap:.45rem;padding:.4rem .95rem;",
    "border:1px solid rgba(128,128,128,.4);border-radius:999px;background:transparent;color:inherit;",
    "font:inherit;font-size:.9rem;cursor:pointer;transition:transform .12s ease,border-color .12s ease,background .12s ease}",
    ".wb-like-btn:hover{border-color:rgba(128,128,128,.8)}",
    ".wb-like-btn:active{transform:scale(.94)}",
    ".wb-like-btn.is-liked{background:rgba(200,80,70,.12);border-color:rgba(200,80,70,.55)}",
    ".wb-like-btn svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.6}",
    ".wb-like-btn.is-liked svg{fill:rgba(200,80,70,.85);stroke:rgba(200,80,70,.85)}",
    ".wb-comments{margin-top:2rem}",
    ".wb-comments h2{font-size:1.05rem;margin:0 0 1rem}",
    ".wb-form{display:flex;flex-direction:column;gap:.6rem}",
    ".wb-form input,.wb-form textarea{font:inherit;color:inherit;background:transparent;",
    "border:1px solid rgba(128,128,128,.35);border-radius:8px;padding:.55rem .75rem;outline:none}",
    ".wb-form input:focus,.wb-form textarea:focus{border-color:rgba(128,128,128,.75)}",
    ".wb-form textarea{min-height:5.5rem;resize:vertical}",
    ".wb-form-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}",
    ".wb-form-row small{opacity:.55}",
    ".wb-submit{align-self:flex-start;padding:.45rem 1.2rem;border:1px solid rgba(128,128,128,.4);",
    "border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:.9rem;cursor:pointer}",
    ".wb-submit:hover{border-color:rgba(128,128,128,.8)}",
    ".wb-submit:disabled{opacity:.45;cursor:not-allowed}",
    ".wb-msg{font-size:.85rem;margin:0}",
    ".wb-msg.is-error{color:#b0442f}",
    ".wb-msg.is-ok{opacity:.65}",
    ".wb-list{list-style:none;margin:1.5rem 0 0;padding:0;display:flex;flex-direction:column;gap:1rem}",
    ".wb-item{border:1px solid rgba(128,128,128,.22);border-radius:10px;padding:.85rem 1rem}",
    ".wb-item-head{display:flex;justify-content:space-between;gap:1rem;font-size:.85rem;opacity:.7}",
    ".wb-item-head strong{font-weight:600;opacity:1}",
    ".wb-item-body{margin:.5rem 0 0;white-space:pre-wrap;word-break:break-word;line-height:1.7}",
    ".wb-empty{opacity:.55;font-size:.9rem;margin:1rem 0 0}"
  ].join("");

  if (!document.getElementById("wb-engagement-style")) {
    var style = document.createElement("style");
    style.id = "wb-engagement-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ---------- 组件 ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // 全部走 textContent，天然防 XSS
    return node;
  }

  function mount(postId) {
    var article = document.getElementById("dynamicArticle");
    var footer = article && article.querySelector(".article-footer");
    if (!footer || document.getElementById("wb-engagement")) return;

    var root = el("section", "wb-engagement");
    root.id = "wb-engagement";

    // --- 浏览量 + 点赞 ---
    var stats = el("div", "wb-stats");
    var viewsWrap = el("span", "wb-stat");
    var eyeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    eyeSvg.setAttribute("viewBox", "0 0 24 24");
    eyeSvg.innerHTML = '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>';
    eyeSvg.setAttribute("aria-hidden", "true");
    eyeSvg.style.cssText = "width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.6";
    viewsWrap.appendChild(eyeSvg);
    var viewsNum = el("span", null, "—");
    viewsWrap.appendChild(viewsNum);
    viewsWrap.appendChild(document.createTextNode(" 次浏览"));

    var likeBtn = el("button", "wb-like-btn");
    likeBtn.type = "button";
    likeBtn.setAttribute("aria-pressed", "false");
    likeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.6a4.5 4.5 0 0 1 7.5 2.9c0 5.4-7.5 10-7.5 10Z"/></svg>';
    var likeNum = el("span", null, "0");
    likeBtn.appendChild(likeNum);
    likeBtn.appendChild(document.createTextNode(" 赞"));

    stats.appendChild(viewsWrap);
    stats.appendChild(likeBtn);
    root.appendChild(stats);

    // --- 留言区 ---
    var comments = el("div", "wb-comments");
    var heading = el("h2", null, "留言");
    comments.appendChild(heading);

    var form = el("form", "wb-form");
    var nameInput = el("input");
    nameInput.type = "text";
    nameInput.maxLength = 30;
    nameInput.placeholder = "署名（留空则显示「匿名」）";
    nameInput.setAttribute("aria-label", "署名");

    var bodyInput = el("textarea");
    bodyInput.maxLength = 1000;
    bodyInput.placeholder = "写下你的想法…（1000 字以内）";
    bodyInput.setAttribute("aria-label", "留言内容");

    var row = el("div", "wb-form-row");
    var hint = el("small", null, "留言会实时保存，请保持友善 :)");
    var submitBtn = el("button", "wb-submit", "发表留言");
    submitBtn.type = "submit";
    row.appendChild(hint);
    row.appendChild(submitBtn);

    var msg = el("p", "wb-msg");
    msg.hidden = true;

    form.appendChild(nameInput);
    form.appendChild(bodyInput);
    form.appendChild(row);
    form.appendChild(msg);
    comments.appendChild(form);

    var list = el("ul", "wb-list");
    comments.appendChild(list);
    root.appendChild(comments);

    footer.parentNode.insertBefore(root, footer);

    // ---------- 逻辑 ----------

    function showMessage(text, isError) {
      msg.textContent = text;
      msg.className = "wb-msg " + (isError ? "is-error" : "is-ok");
      msg.hidden = false;
      if (!isError) setTimeout(function () { msg.hidden = true; }, 2500);
    }

    function renderComments(items) {
      list.textContent = "";
      if (!items.length) {
        list.appendChild(el("p", "wb-empty", "还没有留言，坐个沙发？"));
        return;
      }
      items.forEach(function (item) {
        var li = el("li", "wb-item");
        var head = el("div", "wb-item-head");
        var name = el("strong", null, item.name || "匿名");
        var time = el("span", null, relTime(item.created_at));
        head.appendChild(name);
        head.appendChild(time);
        li.appendChild(head);
        li.appendChild(el("p", "wb-item-body", item.body));
        list.appendChild(li);
      });
    }

    function loadComments() {
      api("/api/comments/" + encodeURIComponent(postId))
        .then(renderComments)
        .catch(function () { /* 静默降级 */ });
    }

    function updateLikeState(liked, count) {
      likeBtn.classList.toggle("is-liked", liked);
      likeBtn.setAttribute("aria-pressed", liked ? "true" : "false");
      likeNum.textContent = String(count);
    }

    // 1) 浏览量：每个会话每篇文章只计一次
    var viewed;
    try { viewed = JSON.parse(sessionStorage.getItem(VIEWED_KEY) || "{}"); } catch (e) { viewed = {}; }
    var viewPromise;
    if (!viewed[postId]) {
      viewPromise = api("/api/views/" + encodeURIComponent(postId), { method: "POST" })
        .then(function () {
          viewed[postId] = true;
          try { sessionStorage.setItem(VIEWED_KEY, JSON.stringify(viewed)); } catch (e) { /* ignore */ }
        })
        .catch(function () { /* ignore */ });
    } else {
      viewPromise = Promise.resolve();
    }

    // 2) 拉取统计（带上访客 ID 以判断是否已点赞）
    viewPromise.then(function () {
      return api("/api/stats/" + encodeURIComponent(postId), {
        headers: { "X-Visitor-Id": getVisitorId() }
      });
    }).then(function (statsData) {
      viewsNum.textContent = String(statsData.views);
      var likedSet = getLikedSet();
      var liked = statsData.liked || likedSet.has(postId);
      if (liked) likedSet.add(postId);
      saveLikedSet(likedSet);
      updateLikeState(liked, statsData.likes);
    }).catch(function () {
      // API 未部署或不通时整个互动条静默隐藏
      root.hidden = true;
    });

    // 3) 点赞切换
    likeBtn.addEventListener("click", function () {
      likeBtn.disabled = true;
      api("/api/likes/" + encodeURIComponent(postId), {
        method: "POST",
        headers: { "X-Visitor-Id": getVisitorId() }
      }).then(function (data) {
        var likedSet = getLikedSet();
        if (data.liked) likedSet.add(postId); else likedSet.delete(postId);
        saveLikedSet(likedSet);
        updateLikeState(data.liked, data.likes);
      }).catch(function () {
        showMessage("点赞失败，稍后再试试", true);
      }).finally(function () {
        likeBtn.disabled = false;
      });
    });

    // 4) 发表留言
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var body = bodyInput.value.trim();
      if (!body) { showMessage("先写点什么再提交吧", true); return; }
      submitBtn.disabled = true;
      api("/api/comments/" + encodeURIComponent(postId), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Visitor-Id": getVisitorId() },
        body: JSON.stringify({ name: nameInput.value.trim(), body: body })
      }).then(function (newComment) {
        bodyInput.value = "";
        showMessage("留言已发布", false);
        return api("/api/comments/" + encodeURIComponent(postId)).then(renderComments);
      }).catch(function (err) {
        showMessage(err && err.message ? err.message : "发布失败，稍后再试", true);
      }).finally(function () {
        submitBtn.disabled = false;
      });
    });

    loadComments();
  }

  // ---------- 启动：等 blog.js 把文章渲染出来（移除 hidden）再挂载 ----------

  function boot() {
    var postId = getPostId();
    if (!postId) return; // 首页等页面不挂载
    if (API_BASE.indexOf("你的子域名") !== -1) {
      console.warn("[engagement] 请先把 API_BASE 替换为你的 Worker 地址");
    }

    var article = document.getElementById("dynamicArticle");
    if (article && !article.hidden) { mount(postId); return; }

    var observer = new MutationObserver(function () {
      if (article && !article.hidden) {
        observer.disconnect();
        mount(postId);
      }
    });
    if (article) {
      observer.observe(article, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
