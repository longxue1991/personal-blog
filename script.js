(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector("[data-theme-toggle]");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const storageKey = "codex-blog-theme";

  function preferredTheme() {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "dark" ? "#111916" : "#f3f6f1");
    }
    if (themeButton) {
      const isDark = theme === "dark";
      themeButton.setAttribute("aria-pressed", String(isDark));
      themeButton.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到深色模式");
    }
  }

  applyTheme(preferredTheme());

  themeButton?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(storageKey, next);
    applyTheme(next);
  });

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  colorScheme.addEventListener?.("change", (event) => {
    if (!localStorage.getItem(storageKey)) applyTheme(event.matches ? "dark" : "light");
  });

  const revealTargets = document.querySelectorAll(
    ".hero-copy, .field-note, .post-row, .now-card, .about-card, .article-header, .stat-item, .chart-panel, .ranking-section, .method-note"
  );
  revealTargets.forEach((element) => element.classList.add("reveal"));

  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealTargets.forEach((element) => observer.observe(element));
  } else {
    revealTargets.forEach((element) => element.classList.add("is-visible"));
  }

  const csvPath = document.body.dataset.csv;
  if (!csvPath) return;

  const chartTop = document.getElementById("topSchoolsChart");
  const chartChange = document.getElementById("changeChart");
  const tableBody = document.getElementById("rankingBody");
  const searchInput = document.getElementById("schoolSearch");
  const statusFilter = document.getElementById("statusFilter");
  const tableCount = document.getElementById("tableCount");
  const rankingTable = document.getElementById("schoolRanking");
  if (!chartTop || !chartChange || !tableBody || !rankingTable) return;

  fetch(csvPath)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((text) => {
      const rows = parseCsv(text).map((row) => ({
        school: row.school,
        count_2025: Number(row.count_2025),
        count_2026: Number(row.count_2026),
        change: Number(row.change),
        rank_2025: Number(row.rank_2025),
        rank_2026: Number(row.rank_2026),
        rank_delta: Number(row.rank_delta),
        status: row.status,
      }));
      initAnalysis(rows);
    })
    .catch((error) => {
      tableBody.innerHTML = `<tr><td colspan="7">数据载入失败：${escapeHtml(error.message)}</td></tr>`;
      if (tableCount) tableCount.textContent = "数据载入失败";
      chartTop.innerHTML = '<p class="chart-error">图表数据暂时无法载入。</p>';
      chartChange.innerHTML = '<p class="chart-error">图表数据暂时无法载入。</p>';
    });

  function normalizeCsvValue(value) {
    return value.endsWith(String.fromCharCode(13)) ? value.slice(0, -1) : value;
  }

  function stripBom(value) {
    return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === String.fromCharCode(10)) {
        row.push(normalizeCsvValue(field));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field || row.length) {
      row.push(normalizeCsvValue(field));
      rows.push(row);
    }

    const header = rows.shift().map(stripBom);
    return rows
      .filter((values) => values.some(Boolean))
      .map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
  }

  function initAnalysis(rows) {
    renderTopSchools(rows);
    renderChangeChart(rows);

    const state = {
      query: "",
      status: "all",
      sortKey: "rank_2026",
      sortType: "number",
      direction: "asc",
    };

    function renderTable() {
      const query = state.query.trim().toLocaleLowerCase("zh-CN");
      const filtered = rows
        .filter((row) => state.status === "all" || row.status === state.status)
        .filter((row) => !query || row.school.toLocaleLowerCase("zh-CN").includes(query))
        .sort((a, b) => {
          const left = a[state.sortKey];
          const right = b[state.sortKey];
          const comparison =
            state.sortType === "text"
              ? String(left).localeCompare(String(right), "zh-CN")
              : Number(left) - Number(right);
          return state.direction === "asc" ? comparison : -comparison;
        });

      const fragment = document.createDocumentFragment();
      for (const row of filtered) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="number-cell">${row.count_2026 > 0 ? row.rank_2026 : "—"}</td>
          <th scope="row" class="school-cell">${escapeHtml(row.school)}</th>
          <td class="number-cell">${row.count_2025}</td>
          <td class="number-cell">${row.count_2026}</td>
          <td class="number-cell ${changeClass(row.change)}">${formatSigned(row.change)}</td>
          <td class="number-cell ${row.status === "new" || row.status === "left" ? "muted-cell" : changeClass(row.rank_delta)}">${formatRankMove(row)}</td>
          <td><span class="status-badge status-${row.status}">${statusLabel(row.status)}</span></td>
        `;
        fragment.appendChild(tr);
      }

      if (!filtered.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="7" class="empty-table">没有符合当前条件的学校。</td>';
        fragment.appendChild(tr);
      }

      tableBody.replaceChildren(fragment);
      if (tableCount) tableCount.textContent = `显示 ${filtered.length} / ${rows.length} 所学校`;
    }

    function updateSortHeader(activeButton) {
      rankingTable.querySelectorAll("th").forEach((th) => th.removeAttribute("aria-sort"));
      rankingTable.querySelectorAll(".sort-button").forEach((button) => {
        const icon = button.querySelector("span");
        if (icon) icon.textContent = "↕";
      });
      if (!activeButton) return;
      const icon = activeButton.querySelector("span");
      if (icon) icon.textContent = state.direction === "asc" ? "↑" : "↓";
      activeButton.closest("th")?.setAttribute("aria-sort", state.direction === "asc" ? "ascending" : "descending");
    }

    rankingTable.querySelectorAll(".sort-button").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.sort;
        const type = button.dataset.type;
        if (state.sortKey === key) {
          state.direction = state.direction === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortType = type;
          state.direction = type === "text" ? "asc" : "asc";
        }
        updateSortHeader(button);
        renderTable();
      });
    });

    searchInput?.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderTable();
    });

    statusFilter?.addEventListener("change", (event) => {
      state.status = event.target.value;
      renderTable();
    });

    updateSortHeader(rankingTable.querySelector('[data-sort="rank_2026"]'));
    renderTable();
  }

  function renderTopSchools(rows) {
    const top = [...rows]
      .filter((row) => row.count_2026 > 0)
      .sort((a, b) => b.count_2026 - a.count_2026 || b.count_2025 - a.count_2025 || a.school.localeCompare(b.school, "zh-CN"))
      .slice(0, 12);

    const width = 1040;
    const labelX = 18;
    const trackX = 330;
    const trackWidth = 590;
    const rowHeight = 52;
    const topPadding = 42;
    const height = topPadding + top.length * rowHeight + 28;
    const maxValue = top[0]?.count_2026 || 1;
    const tickStep = maxValue > 60 ? 20 : maxValue > 30 ? 10 : 5;
    const tickMax = Math.ceil(maxValue / tickStep) * tickStep;
    const scale = (value) => (value / tickMax) * trackWidth;

    let markup = `<svg class="bar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="top-chart-title top-chart-desc">`;
    markup += '<title id="top-chart-title">2026 年人数前十二学校对比柱状图</title>';
    markup += '<desc id="top-chart-desc">每所学校同时显示 2025 年和 2026 年名单人数，按 2026 年人数降序排列。</desc>';

    for (let tick = 0; tick <= tickMax; tick += tickStep) {
      const x = trackX + scale(tick);
      markup += `<line class="chart-grid" x1="${x}" y1="22" x2="${x}" y2="${height - 18}"></line>`;
      markup += `<text class="chart-tick" x="${x}" y="15" text-anchor="middle">${tick}</text>`;
    }

    top.forEach((row, index) => {
      const y = topPadding + index * rowHeight;
      const width2025 = scale(row.count_2025);
      const width2026 = scale(row.count_2026);
      const shortName = row.school.length > 18 ? `${row.school.slice(0, 17)}…` : row.school;
      markup += `<text class="chart-label" x="${labelX}" y="${y + 18}">${escapeHtml(shortName)}</text>`;
      markup += `<rect class="bar-track" x="${trackX}" y="${y + 2}" width="${trackWidth}" height="40" rx="4"></rect>`;
      markup += `<rect class="bar-2025" x="${trackX}" y="${y + 8}" width="${Math.max(width2025, 1)}" height="12" rx="3"><title>${escapeHtml(row.school)} 2025：${row.count_2025} 人</title></rect>`;
      markup += `<rect class="bar-2026" x="${trackX}" y="${y + 24}" width="${Math.max(width2026, 1)}" height="12" rx="3"><title>${escapeHtml(row.school)} 2026：${row.count_2026} 人</title></rect>`;
      markup += `<text class="chart-value" x="1004" y="${y + 18}" text-anchor="end">${row.count_2025} → ${row.count_2026}</text>`;
      markup += `<text class="chart-delta ${changeClass(row.change)}" x="1004" y="${y + 36}" text-anchor="end">${formatSigned(row.change)} 人</text>`;
    });

    markup += "</svg>";
    chartTop.innerHTML = markup;
  }

  function renderChangeChart(rows) {
    const increases = [...rows]
      .filter((row) => row.change > 0)
      .sort((a, b) => b.change - a.change || b.count_2026 - a.count_2026)
      .slice(0, 8);
    const decreases = [...rows]
      .filter((row) => row.change < 0)
      .sort((a, b) => a.change - b.change || a.count_2026 - b.count_2026)
      .slice(0, 8);
    const changes = [...increases, ...decreases];

    const width = 1100;
    const labelX = 18;
    const countX = 372;
    const centerX = 720;
    const halfWidth = 270;
    const rowHeight = 38;
    const topPadding = 46;
    const height = topPadding + changes.length * rowHeight + 26;
    const maxAbs = Math.max(...changes.map((row) => Math.abs(row.change)), 1);
    const scale = (value) => (value / maxAbs) * halfWidth;
    const ticks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

    let markup = `<svg class="change-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="change-chart-title-svg change-chart-desc">`;
    markup += '<title id="change-chart-title-svg">学校名单人数变化图</title>';
    markup += '<desc id="change-chart-desc">上半部分为净增最多的八所学校，下半部分为净减最多的八所学校。</desc>';

    ticks.forEach((tick) => {
      const x = centerX + scale(tick);
      markup += `<line class="chart-grid ${tick === 0 ? "chart-zero" : ""}" x1="${x}" y1="26" x2="${x}" y2="${height - 14}"></line>`;
      markup += `<text class="chart-tick" x="${x}" y="17" text-anchor="middle">${formatSigned(Math.round(tick))}</text>`;
    });

    changes.forEach((row, index) => {
      const y = topPadding + index * rowHeight;
      const barWidth = Math.abs(scale(row.change));
      const barX = row.change >= 0 ? centerX : centerX - barWidth;
      const shortName = row.school.length > 22 ? `${row.school.slice(0, 21)}…` : row.school;
      markup += `<text class="chart-label" x="${labelX}" y="${y + 10}">${escapeHtml(shortName)}</text>`;
      markup += `<text class="chart-count" x="${countX}" y="${y + 10}" text-anchor="end">${row.count_2025} → ${row.count_2026}</text>`;
      markup += `<rect class="${row.change > 0 ? "bar-up" : "bar-down"}" x="${barX}" y="${y - 5}" width="${Math.max(barWidth, 2)}" height="20" rx="3"><title>${escapeHtml(row.school)}：${formatSigned(row.change)} 人</title></rect>`;
      markup += `<text class="chart-delta ${changeClass(row.change)}" x="1078" y="${y + 10}" text-anchor="end">${formatSigned(row.change)}</text>`;
    });

    markup += "</svg>";
    chartChange.innerHTML = markup;
  }

  function formatSigned(value) {
    const number = Number(value);
    if (number > 0) return `+${number}`;
    return String(number);
  }

  function formatRankMove(row) {
    if (row.status === "new" || row.status === "left") return "—";
    if (row.rank_delta > 0) return `↑ ${row.rank_delta}`;
    if (row.rank_delta < 0) return `↓ ${Math.abs(row.rank_delta)}`;
    return "—";
  }

  function changeClass(value) {
    const number = Number(value);
    if (number > 0) return "is-up";
    if (number < 0) return "is-down";
    return "is-flat";
  }

  function statusLabel(status) {
    return {
      up: "上升",
      down: "下降",
      same: "持平",
      new: "新出现",
      left: "未出现",
    }[status] || status;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
