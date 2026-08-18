/**
 * V2 COCO STORES MASTER DASHBOARD Controller
 * Handles MoM comparisons, Financial Year filtering, Chart.js instances, and responsive interactions.
 */

// State Object
const state = {
    selectedMonth: "Aug'26",
    compareMonth: "July'26",
    compareMode: "mom", // "mom" | "target" | "custom"
    timeHorizon: "current-fy", // "current-fy" | 3 | 6 | 12 | 25
    activeTab: "overview",
    theme: "dark-sapphire",
    charts: {}
};

// Formatting Utilities
const formatters = {
    currency: (val) => {
        if (val === undefined || val === null || isNaN(val)) return "₹0";
        const absVal = Math.abs(val);
        let formatted = "";
        if (absVal >= 10000000) {
            formatted = `₹ ${(val / 10000000).toFixed(2)} Cr`;
        } else if (absVal >= 100000) {
            formatted = `₹ ${(val / 100000).toFixed(2)} L`;
        } else {
            formatted = `₹ ${Number(val).toLocaleString('en-IN')}`;
        }
        return formatted;
    },
    exactCurrency: (val) => {
        if (val === undefined || val === null || isNaN(val)) return "₹ 0";
        return `₹ ${Number(val).toLocaleString('en-IN')}`;
    },
    number: (val) => {
        if (val === undefined || val === null || isNaN(val)) return "0";
        return Number(val).toLocaleString('en-IN');
    },
    percent: (val) => {
        if (val === undefined || val === null || isNaN(val)) return "0%";
        return `${Number(val).toFixed(1)}%`;
    },
    decimal: (val) => {
        if (val === undefined || val === null || isNaN(val)) return "0.0";
        return Number(val).toFixed(1);
    },
    deltaPercent: (curr, prev) => {
        if (!prev || prev === 0) return { pct: 0, text: "0.0%", isPositive: true, isZero: true, diff: curr };
        const diff = curr - prev;
        const pct = (diff / Math.abs(prev)) * 100;
        const sign = pct > 0 ? "+" : "";
        return {
            pct: pct,
            text: `${sign}${pct.toFixed(1)}%`,
            isPositive: pct >= 0,
            isZero: Math.abs(pct) < 0.01,
            diff: diff
        };
    }
};

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
    initSelectors();
    initTheme();
    initTabs();
    initQuickFilters();
    renderAllViews();
});

function initSelectors() {
    const monthSelect = document.getElementById("selectedMonthSelect");
    const compareSelect = document.getElementById("compareMonthSelect");
    const compareModeSelect = document.getElementById("compareModeSelect");

    if (!monthSelect || !RETAIL_DSR_DATA || !RETAIL_DSR_DATA.months) return;

    // Populate months in reverse chronological order
    const reversedMonths = [...RETAIL_DSR_DATA.months].reverse();
    
    monthSelect.innerHTML = "";
    compareSelect.innerHTML = "";

    reversedMonths.forEach((m) => {
        const opt1 = document.createElement("option");
        opt1.value = m;
        opt1.textContent = m;
        if (m === state.selectedMonth) opt1.selected = true;
        monthSelect.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = m;
        opt2.textContent = m;
        if (m === state.compareMonth) opt2.selected = true;
        compareSelect.appendChild(opt2);
    });

    monthSelect.addEventListener("change", (e) => {
        state.selectedMonth = e.target.value;
        const currentIdx = RETAIL_DSR_DATA.months.indexOf(state.selectedMonth);
        if (currentIdx > 0 && state.compareMode === "mom") {
            state.compareMonth = RETAIL_DSR_DATA.months[currentIdx - 1];
            compareSelect.value = state.compareMonth;
        }
        renderAllViews();
    });

    compareSelect.addEventListener("change", (e) => {
        state.compareMonth = e.target.value;
        renderAllViews();
    });

    if (compareModeSelect) {
        compareModeSelect.addEventListener("change", (e) => {
            state.compareMode = e.target.value;
            const compGroup = document.getElementById("compareMonthGroup");
            if (compGroup) {
                compGroup.style.display = state.compareMode === "target" ? "none" : "flex";
            }
            renderAllViews();
        });
    }
}

function initTheme() {
    const themeBtn = document.getElementById("themeToggleBtn");
    if (!themeBtn) return;

    themeBtn.addEventListener("click", () => {
        if (state.theme === "dark-sapphire") {
            state.theme = "light-ice";
            document.documentElement.setAttribute("data-theme", "light-ice");
            themeBtn.innerHTML = `<span>☀️</span><span>Ice Glass</span>`;
        } else {
            state.theme = "dark-sapphire";
            document.documentElement.removeAttribute("data-theme");
            themeBtn.innerHTML = `<span>🌙</span><span>Dark Sapphire</span>`;
        }
        updateChartThemes();
    });
}

function initTabs() {
    const tabBtns = document.querySelectorAll(".nav-tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeTab = btn.getAttribute("data-tab");

            document.querySelectorAll(".tab-content-pane").forEach(pane => {
                pane.style.display = pane.id === `tabPane-${state.activeTab}` ? "block" : "none";
            });

            window.dispatchEvent(new Event('resize'));
        });
    });
}

function initQuickFilters() {
    const pills = document.querySelectorAll(".horizon-pill");
    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            const rawVal = pill.getAttribute("data-horizon");
            state.timeHorizon = rawVal === "current-fy" ? "current-fy" : parseInt(rawVal, 10);
            renderCharts();
        });
    });
}

// Master Render
function renderAllViews() {
    updateContextBanner();
    renderHeroKPIs();
    renderMatrixTable();
    renderDailyAugust();
    renderCharts();
    renderCocoStores();
    renderChannels();
    renderCategories();
}


function updateContextBanner() {
    const banner = document.getElementById("comparisonContextBanner");
    if (!banner) return;

    let targetDesc = state.compareMonth;
    if (state.compareMode === "target") {
        targetDesc = "Monthly Target / Trending Projections";
    }

    banner.innerHTML = `
        Comparing <span class="comparison-tag">${state.selectedMonth}</span>
        vs. <span class="comparison-tag">${targetDesc}</span>
        <span style="margin-left: auto; font-size: 0.78rem; opacity: 0.8;">FY'27 Financial Performance Review</span>
    `;
}

// Render Executive Hero KPI Cards (Single Unified Grid in Exact Requested Order)
function renderHeroKPIs() {
    const container = document.getElementById("kpiHeroGrid");
    if (!container) return;

    const currData = RETAIL_DSR_DATA.monthlyData[state.selectedMonth]?.metrics || {};
    const prevData = RETAIL_DSR_DATA.monthlyData[state.compareMonth]?.metrics || {};
    const meta = RETAIL_DSR_DATA.monthlyData[state.selectedMonth]?.meta;

    // Requested Sequential Order:
    // 1. Total Leads
    // 2. Total Conversions
    // 3. Conversion Rate (CVR)
    // 4. Net EBVMR / Revenue
    // 5. Average Order Value (AOV)
    // 6. Cancellation Count
    // 7. Cancellation Rate (%)
    // 8. Cancelled Revenue
    const kpiDefs = [
        {
            id: "leads",
            title: "Total Leads",
            formatter: formatters.number,
            icon: "👥",
            isReverseGood: false
        },
        {
            id: "conversions",
            title: "Total Conversions",
            formatter: formatters.number,
            icon: "🎯",
            isReverseGood: false
        },
        {
            id: "cvr",
            title: "Conversion Rate (CVR)",
            formatter: formatters.percent,
            icon: "⚡",
            isReverseGood: false
        },
        {
            id: "ebvmr_net",
            title: "Net EBVMR / Revenue",
            formatter: formatters.currency,
            icon: "💎",
            isReverseGood: false
        },
        {
            id: "aov_overall",
            title: "Average Order Value (AOV)",
            formatter: formatters.currency,
            icon: "🛍️",
            isReverseGood: false
        },
        {
            id: "cancel_count",
            title: "Cancellation Count",
            formatter: formatters.number,
            icon: "⚠️",
            isReverseGood: true
        },
        {
            id: "cancel_pct",
            title: "Cancellation Rate (%)",
            formatter: formatters.percent,
            icon: "📉",
            isReverseGood: true
        },
        {
            id: "cancel_rev",
            title: "Cancelled Revenue",
            formatter: formatters.currency,
            icon: "💸",
            isReverseGood: true
        }
    ];

    let html = "";
    kpiDefs.forEach(def => {
        const currVal = currData[def.id] ?? 0;
        const prevVal = prevData[def.id] ?? 0;
        
        const delta = formatters.deltaPercent(currVal, prevVal);
        let badgeClass = delta.isPositive ? "delta-positive" : "delta-negative";
        let deltaArrow = delta.isPositive ? "▲" : "▼";

        if (def.isReverseGood) {
            badgeClass = delta.isPositive ? "delta-negative" : "delta-positive";
        }
        if (delta.isZero) {
            badgeClass = "delta-neutral";
            deltaArrow = "▶";
        }

        let progressHtml = "";
        if (def.id === "ebvmr_net" && meta && meta.trending_to > 0) {
            const pctOfTarget = Math.min(100, Math.round((currVal / meta.trending_to) * 100));
            progressHtml = `
                <div class="target-progress-container">
                    <div class="target-label-row">
                        <span>Trending: ${formatters.currency(meta.trending_to)}</span>
                        <span>${pctOfTarget}% MTD</span>
                    </div>
                    <div class="target-progress-track">
                        <div class="target-progress-fill" style="width: ${pctOfTarget}%;"></div>
                    </div>
                </div>
            `;
        }

        html += `
            <div class="glass-panel kpi-card">
                <div class="kpi-card-header">
                    <span class="kpi-title">${def.title}</span>
                    <div class="kpi-icon-pill">${def.icon}</div>
                </div>
                <div class="kpi-main-val" title="${formatters.exactCurrency(currVal)}">${def.formatter(currVal)}</div>
                ${progressHtml}
                <div class="kpi-footer">
                    <span class="delta-badge ${badgeClass}">${deltaArrow} ${delta.text} MoM</span>
                    <span class="kpi-prev-val">Prev: ${def.formatter(prevVal)}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Render Side-by-Side Matrix Table
function renderMatrixTable() {
    const tableBody = document.getElementById("matrixTableBody");
    if (!tableBody) return;

    const currData = RETAIL_DSR_DATA.monthlyData[state.selectedMonth]?.metrics || {};
    const prevData = RETAIL_DSR_DATA.monthlyData[state.compareMonth]?.metrics || {};

    let rowsHtml = "";

    RETAIL_DSR_DATA.overviewMetrics.forEach(metric => {
        const currVal = currData[metric.id] ?? 0;
        const prevVal = prevData[metric.id] ?? 0;
        const delta = formatters.deltaPercent(currVal, prevVal);
        
        let isBadNegative = (metric.id.includes("cancel"));
        let deltaColor = delta.isPositive ? "var(--color-success)" : "var(--color-danger)";
        if (isBadNegative) {
            deltaColor = delta.isPositive ? "var(--color-danger)" : "var(--color-success)";
        }
        if (delta.isZero) deltaColor = "var(--color-warning)";

        let fmt = formatters.number;
        if (metric.format === "currency") fmt = formatters.currency;
        if (metric.format === "percent") fmt = formatters.percent;
        if (metric.format === "decimal") fmt = formatters.decimal;

        rowsHtml += `
            <tr>
                <td class="metric-name-cell">${metric.name}</td>
                <td style="font-weight: 700;">${fmt(currVal)}</td>
                <td style="color: var(--text-secondary);">${fmt(prevVal)}</td>
                <td style="color: ${deltaColor}; font-weight: 700;">${delta.text}</td>
                <td style="color: var(--text-muted); font-size: 0.78rem;">${fmt(delta.diff || 0)}</td>
            </tr>
        `;
    });

    tableBody.innerHTML = rowsHtml;
}

// Render Daily August Trajectory
function renderDailyAugust() {
    const container = document.getElementById("dailyTrajectoryStrip");
    if (!container || !RETAIL_DSR_DATA.dailyAug) return;

    let html = "";
    RETAIL_DSR_DATA.dailyAug.forEach(dayItem => {
        html += `
            <div class="daily-block">
                <div class="daily-date">${dayItem.day}</div>
                <div class="daily-dow">${dayItem.dow}</div>
                <div class="daily-val">${formatters.currency(dayItem.revenue)}</div>
                <div style="font-size: 0.68rem; color: var(--text-muted);">${dayItem.conversions} orders</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Render Charts
function renderCharts() {
    renderTrendChart();
    renderFunnelChart();
    renderChannelMixChart();
    renderCancellationComparisonChart();
}

/**
 * Filter months for trend analysis:
 * - "current-fy" (Default): Filter from Apr'26 (Start of FY) to current month (Aug'26)
 * - 3, 6, 12, 25: Slice trailing N months
 */
function getFilteredMonths() {
    const allMonths = RETAIL_DSR_DATA.months;
    
    if (state.timeHorizon === "current-fy") {
        // Current Financial Year (Apr'26 to Aug'26)
        const fyStartIndex = allMonths.indexOf("Apr'26");
        const currentMonthIndex = allMonths.indexOf(state.selectedMonth);
        if (fyStartIndex !== -1) {
            const endIndex = currentMonthIndex >= fyStartIndex ? currentMonthIndex + 1 : allMonths.length;
            return allMonths.slice(fyStartIndex, endIndex);
        }
        return ["Apr'26", "May'26", "Jun'26", "July'26", "Aug'26"];
    }

    const horizon = typeof state.timeHorizon === "number" ? state.timeHorizon : 5;
    if (horizon >= allMonths.length) return allMonths;
    return allMonths.slice(-horizon);
}

function renderTrendChart() {
    const ctx = document.getElementById("multiMonthTrendCanvas")?.getContext("2d");
    if (!ctx) return;

    if (state.charts.trend) {
        state.charts.trend.destroy();
    }

    const months = getFilteredMonths();
    const revenueData = months.map(m => RETAIL_DSR_DATA.monthlyData[m]?.metrics?.ebvmr_net || 0);
    const conversionsData = months.map(m => RETAIL_DSR_DATA.monthlyData[m]?.metrics?.conversions || 0);
    const leadsData = months.map(m => RETAIL_DSR_DATA.monthlyData[m]?.metrics?.leads || 0);

    const isLight = state.theme === "light-ice";
    const gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
    const textColor = isLight ? "#475569" : "#94a3b8";

    state.charts.trend = new Chart(ctx, {
        type: "line",
        data: {
            labels: months,
            datasets: [
                {
                    label: "Net EBVMR / Revenue (₹)",
                    data: revenueData,
                    borderColor: "#00e5ff",
                    backgroundColor: "rgba(0, 229, 255, 0.12)",
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    yAxisID: "y"
                },
                {
                    label: "Conversions (Count)",
                    data: conversionsData,
                    borderColor: "#38bdf8",
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    borderDash: [4, 4],
                    tension: 0.3,
                    yAxisID: "y1"
                },
                {
                    label: "Total Leads",
                    data: leadsData,
                    borderColor: "#64748b",
                    backgroundColor: "transparent",
                    borderWidth: 1.5,
                    borderDash: [2, 2],
                    tension: 0.3,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    labels: { color: textColor, font: { family: "Outfit", size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === "y") {
                                return ` Revenue: ${formatters.currency(ctx.parsed.y)}`;
                            }
                            return ` ${ctx.dataset.label}: ${formatters.number(ctx.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: "Plus Jakarta Sans" } }
                },
                y: {
                    type: "linear",
                    position: "left",
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: (v) => formatters.currency(v)
                    }
                },
                y1: {
                    type: "linear",
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: { color: textColor }
                }
            }
        }
    });
}

function renderFunnelChart() {
    const ctx = document.getElementById("funnelChartCanvas")?.getContext("2d");
    if (!ctx) return;

    if (state.charts.funnel) {
        state.charts.funnel.destroy();
    }

    const months = getFilteredMonths();
    const cvrData = months.map(m => RETAIL_DSR_DATA.monthlyData[m]?.metrics?.cvr || 0);
    const arpuData = months.map(m => RETAIL_DSR_DATA.monthlyData[m]?.metrics?.arpu_blended || 0);

    const isLight = state.theme === "light-ice";
    const gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
    const textColor = isLight ? "#475569" : "#94a3b8";

    state.charts.funnel = new Chart(ctx, {
        type: "bar",
        data: {
            labels: months,
            datasets: [
                {
                    label: "Blended ARPU (₹)",
                    data: arpuData,
                    backgroundColor: "rgba(0, 119, 255, 0.65)",
                    borderRadius: 6,
                    yAxisID: "y"
                },
                {
                    type: "line",
                    label: "Conversion Rate (CVR %)",
                    data: cvrData,
                    borderColor: "#10b981",
                    borderWidth: 2.5,
                    pointBackgroundColor: "#10b981",
                    tension: 0.3,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === "y") {
                                return ` ARPU: ${formatters.currency(ctx.parsed.y)}`;
                            }
                            return ` CVR: ${ctx.parsed.y}%`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor } },
                y: { grid: { color: gridColor }, ticks: { color: textColor } },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: { color: textColor, callback: (v) => `${v}%` }
                }
            }
        }
    });
}

function renderChannelMixChart() {
    const ctx = document.getElementById("channelMixCanvas")?.getContext("2d");
    if (!ctx) return;

    if (state.charts.channelMix) {
        state.charts.channelMix.destroy();
    }

    const m = state.selectedMonth;
    const channels = RETAIL_DSR_DATA.channels;
    
    // Explicit channel labels: Walk-in, Video Call Leads, App Leads, Store Calls
    const labels = ["Walk-in", "Video Call Leads", "App Leads", "Store Calls"];
    const channelKeys = ["walkin", "popin", "app_lead", "store_calls"];
    const data = channelKeys.map(k => channels[k]?.monthly[m]?.revenue || 0);

    state.charts.channelMix = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    "#0077ff", // Walk-in (Cobalt)
                    "#00e5ff", // Video Call Leads (Cyan)
                    "#38bdf8", // App Leads (Sky Blue)
                    "#818cf8"  // Store Calls (Indigo)
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { 
                        color: state.theme === "light-ice" ? "#475569" : "#94a3b8", 
                        boxWidth: 12,
                        font: { family: "Outfit", size: 12, weight: 600 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${formatters.currency(ctx.parsed)}`
                    }
                }
            },
            cutout: "68%"
        }
    });
}

function renderCancellationComparisonChart() {
    const ctx = document.getElementById("cancelChartCanvas")?.getContext("2d");
    if (!ctx) return;

    if (state.charts.cancel) {
        state.charts.cancel.destroy();
    }

    const months = getFilteredMonths();
    const rentalCancelVal = months.map(m => RETAIL_DSR_DATA.monthlyData[m]?.metrics?.rental_cancel_val || 0);
    const sellingCancelVal = months.map(m => RETAIL_DSR_DATA.monthlyData[m]?.metrics?.selling_cancel_val || 0);

    const isLight = state.theme === "light-ice";
    const gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
    const textColor = isLight ? "#475569" : "#94a3b8";

    state.charts.cancel = new Chart(ctx, {
        type: "bar",
        data: {
            labels: months,
            datasets: [
                {
                    label: "Rental Cancelled Value (₹)",
                    data: rentalCancelVal,
                    backgroundColor: "rgba(244, 63, 94, 0.75)",
                    borderRadius: 4
                },
                {
                    label: "Selling Cancelled Value (₹)",
                    data: sellingCancelVal,
                    backgroundColor: "rgba(245, 158, 11, 0.75)",
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${formatters.currency(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor } },
                y: {
                    stacked: true,
                    grid: { color: gridColor },
                    ticks: { color: textColor, callback: (v) => formatters.currency(v) }
                }
            }
        }
    });
}

// Render 5 Dedicated COCO Stores & High Performance Ranking
function renderCocoStores() {
    const container = document.getElementById("cocoStoresGrid");
    const leaderboardContainer = document.getElementById("cocoLeaderboardGrid");
    if (!container || !RETAIL_DSR_DATA.cocoStores) return;

    const m = state.selectedMonth;
    const prevM = state.compareMonth;
    
    const storesList = Object.values(RETAIL_DSR_DATA.cocoStores);

    // Build Store Cards (Displaying the 4 exact KPIs: Total Leads, Total Conversions, CVR %, EBVMR_with_vas)
    let cardsHtml = "";
    storesList.forEach(store => {
        const curr = store.monthly[m] || { leads: 0, conversions: 0, cvr: 0, ebvmr_net: 0 };
        const prev = store.monthly[prevM] || { leads: 0, conversions: 0, cvr: 0, ebvmr_net: 0 };

        const deltaLeads = formatters.deltaPercent(curr.leads, prev.leads);
        const deltaConv = formatters.deltaPercent(curr.conversions, prev.conversions);
        const deltaCvr = formatters.deltaPercent(curr.cvr, prev.cvr);
        const deltaRev = formatters.deltaPercent(curr.ebvmr_net, prev.ebvmr_net);

        cardsHtml += `
            <div class="glass-panel coco-store-card">
                <div class="coco-store-header">
                    <div>
                        <div class="coco-store-name">🏬 ${store.name}</div>
                        <div class="coco-tab-badge">Tab: ${store.tab} • ${store.city}</div>
                    </div>
                    <span class="delta-badge ${deltaRev.isPositive ? 'delta-positive' : 'delta-negative'}" title="MoM Net Revenue Growth">
                        ${deltaRev.isPositive ? '▲' : '▼'} ${deltaRev.text}
                    </span>
                </div>

                <div class="coco-kpi-stack">
                    <!-- 1. Total No. of Leads -->
                    <div class="coco-kpi-item">
                        <span class="coco-kpi-label">👥 Total No. of Leads</span>
                        <div class="coco-kpi-val-group">
                            <span class="coco-kpi-value">${formatters.number(curr.leads)}</span>
                            <span class="delta-badge ${deltaLeads.isPositive ? 'delta-positive' : 'delta-negative'}" style="font-size: 0.68rem; padding: 1px 5px;">${deltaLeads.text}</span>
                        </div>
                    </div>

                    <!-- 2. Total Conversions -->
                    <div class="coco-kpi-item">
                        <span class="coco-kpi-label">🎯 Total Conversions</span>
                        <div class="coco-kpi-val-group">
                            <span class="coco-kpi-value">${formatters.number(curr.conversions)}</span>
                            <span class="delta-badge ${deltaConv.isPositive ? 'delta-positive' : 'delta-negative'}" style="font-size: 0.68rem; padding: 1px 5px;">${deltaConv.text}</span>
                        </div>
                    </div>

                    <!-- 3. CVR % (All LOB's) -->
                    <div class="coco-kpi-item">
                        <span class="coco-kpi-label">⚡ CVR % (All LOB's)</span>
                        <div class="coco-kpi-val-group">
                            <span class="coco-kpi-value" style="color: var(--color-brand-azure);">${formatters.percent(curr.cvr)}</span>
                            <span class="delta-badge ${deltaCvr.isPositive ? 'delta-positive' : 'delta-negative'}" style="font-size: 0.68rem; padding: 1px 5px;">${deltaCvr.text}</span>
                        </div>
                    </div>

                    <!-- 4. EBVMR_with_vas (NET) -->
                    <div class="coco-kpi-item" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.5rem; margin-top: 0.2rem;">
                        <span class="coco-kpi-label" style="font-weight: 700; color: var(--text-main);">💎 EBVMR_with_vas (NET)</span>
                        <div class="coco-kpi-val-group">
                            <span class="coco-kpi-value revenue-highlight" title="${formatters.exactCurrency(curr.ebvmr_net)}">${formatters.currency(curr.ebvmr_net)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = cardsHtml;

    // Leaderboard Ranking (Sorted by EBVMR_with_vas NET)
    if (leaderboardContainer) {
        const sortedStores = [...storesList].sort((a, b) => {
            const revA = a.monthly[m]?.ebvmr_net || 0;
            const revB = b.monthly[m]?.ebvmr_net || 0;
            return revB - revA;
        });

        const topRevenue = sortedStores[0]?.monthly[m]?.ebvmr_net || 1;

        let rankHtml = "";
        sortedStores.forEach((st, idx) => {
            const rank = idx + 1;
            const curr = st.monthly[m] || { leads: 0, conversions: 0, cvr: 0, ebvmr_net: 0 };
            const pctOfTop = Math.min(100, Math.round((curr.ebvmr_net / topRevenue) * 100));

            let rankClass = `rank-${rank}`;
            let badgeClass = `rank-badge-${rank}`;
            let medal = `#${rank}`;
            if (rank === 1) medal = "🥇 #1";
            if (rank === 2) medal = "🥈 #2";
            if (rank === 3) medal = "🥉 #3";
            if (rank > 3) {
                rankClass = "";
                badgeClass = "rank-badge-other";
            }

            rankHtml += `
                <div class="glass-panel leaderboard-card ${rankClass}">
                    <div class="rank-badge-circle ${badgeClass}">${medal}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-store-name">${st.name}</div>
                        <div class="leaderboard-stat-row">
                            <span>Revenue: <strong style="color: var(--color-brand-cyan);">${formatters.currency(curr.ebvmr_net)}</strong></span>
                            <span>CVR: <strong>${formatters.percent(curr.cvr)}</strong></span>
                        </div>
                        <div class="leaderboard-stat-row" style="font-size: 0.74rem;">
                            <span>${formatters.number(curr.conversions)} conv / ${formatters.number(curr.leads)} leads</span>
                            <span>${pctOfTop}% of top</span>
                        </div>
                        <div class="leaderboard-progress-bar">
                            <div class="leaderboard-progress-fill" style="width: ${pctOfTop}%;"></div>
                        </div>
                    </div>
                </div>
            `;
        });
        leaderboardContainer.innerHTML = rankHtml;
    }

    renderCocoVisualizations(storesList, m);
}

function renderCocoVisualizations(storesList, m) {
    const barCtx = document.getElementById("cocoStoreBarCanvas")?.getContext("2d");
    const cvrCtx = document.getElementById("cocoStoreCvrCanvas")?.getContext("2d");
    if (!barCtx || !cvrCtx) return;

    if (state.charts.cocoBar) state.charts.cocoBar.destroy();
    if (state.charts.cocoCvr) state.charts.cocoCvr.destroy();

    const isLight = state.theme === "light-ice";
    const gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
    const textColor = isLight ? "#475569" : "#94a3b8";

    const labels = storesList.map(s => s.name);
    const revenueData = storesList.map(s => s.monthly[m]?.ebvmr_net || 0);
    const cvrData = storesList.map(s => s.monthly[m]?.cvr || 0);
    const convData = storesList.map(s => s.monthly[m]?.conversions || 0);

    // 1. Revenue Comparison Horizontal Bar
    state.charts.cocoBar = new Chart(barCtx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "EBVMR_with_vas NET (₹)",
                data: revenueData,
                backgroundColor: [
                    "rgba(0, 229, 255, 0.85)",
                    "rgba(0, 119, 255, 0.85)",
                    "rgba(56, 189, 248, 0.85)",
                    "rgba(129, 140, 248, 0.85)",
                    "rgba(16, 185, 129, 0.85)"
                ],
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Revenue: ${formatters.currency(ctx.parsed.x)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, callback: (v) => formatters.currency(v) }
                },
                y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: "Outfit", weight: 600 } } }
            }
        }
    });

    // 2. CVR % vs Conversions
    state.charts.cocoCvr = new Chart(cvrCtx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    type: "bar",
                    label: "Total Conversions",
                    data: convData,
                    backgroundColor: "rgba(0, 119, 255, 0.65)",
                    borderRadius: 6,
                    yAxisID: "y"
                },
                {
                    type: "line",
                    label: "CVR % (All LOB's)",
                    data: cvrData,
                    borderColor: "#00e5ff",
                    backgroundColor: "rgba(0, 229, 255, 0.2)",
                    borderWidth: 3,
                    pointBackgroundColor: "#00e5ff",
                    tension: 0.3,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor, font: { family: "Outfit" } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === "y1") return ` CVR: ${ctx.parsed.y}%`;
                            return ` Conversions: ${formatters.number(ctx.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: "Plus Jakarta Sans" } } },
                y: { grid: { color: gridColor }, ticks: { color: textColor } },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: { color: textColor, callback: (v) => `${v}%` }
                }
            }
        }
    });
}


// Render Channel Details (Walk-in, Video Call Leads, App Leads, Store Calls)
function renderChannels() {
    const container = document.getElementById("channelsGrid");
    if (!container) return;

    const m = state.selectedMonth;
    const prevM = state.compareMonth;
    let html = "";

    const channelDisplay = [
        { key: "walkin", label: "Walk-in (Offline Stores)", icon: "🏬" },
        { key: "popin", label: "Video Call Leads (Pop-in)", icon: "📹" },
        { key: "app_lead", label: "App Leads (Mobile & D2C)", icon: "📱" },
        { key: "store_calls", label: "Store Calls (GMB Calling)", icon: "📞" }
    ];

    channelDisplay.forEach(chItem => {
        const ch = RETAIL_DSR_DATA.channels[chItem.key];
        if (!ch) return;

        const curr = ch.monthly[m] || { sales: 0, revenue: 0, arpu: 0, cvr: 0, upsell: 0, upsell_rev: 0, cancel_count: 0 };
        const prev = ch.monthly[prevM] || { sales: 0, revenue: 0, arpu: 0, cvr: 0 };
        const delta = formatters.deltaPercent(curr.revenue, prev.revenue);

        html += `
            <div class="glass-panel sub-item-card">
                <div class="item-header">
                    <span class="item-name">${chItem.icon} ${chItem.label}</span>
                    <span class="delta-badge ${delta.isPositive ? 'delta-positive' : 'delta-negative'}">${delta.text}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Channel Revenue</span>
                    <span class="item-stat-val" style="color: var(--color-brand-cyan); font-size: 1.1rem;">${formatters.currency(curr.revenue)}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Sales Count</span>
                    <span class="item-stat-val">${formatters.number(curr.sales)}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Channel ARPU</span>
                    <span class="item-stat-val">${formatters.currency(curr.arpu)}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Channel CVR %</span>
                    <span class="item-stat-val">${formatters.percent(curr.cvr)}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Upsell Revenue</span>
                    <span class="item-stat-val">${formatters.currency(curr.upsell_rev)} (${curr.upsell} items)</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Render Categories & Products
function renderCategories() {
    const container = document.getElementById("categoriesGrid");
    if (!container) return;

    const m = state.selectedMonth;
    const prevM = state.compareMonth;
    let html = "";

    Object.values(RETAIL_DSR_DATA.categories).forEach(cat => {
        const curr = cat.monthly[m] || { sales: 0, revenue: 0, arpu: 0, ppu: 0, mix_pct: 0 };
        const prev = cat.monthly[prevM] || { sales: 0, revenue: 0, arpu: 0, ppu: 0, mix_pct: 0 };
        const delta = formatters.deltaPercent(curr.revenue, prev.revenue);

        html += `
            <div class="glass-panel sub-item-card">
                <div class="item-header">
                    <span class="item-name">🛋️ ${cat.name}</span>
                    <span class="delta-badge ${delta.isPositive ? 'delta-positive' : 'delta-negative'}">${delta.text}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Category Revenue</span>
                    <span class="item-stat-val">${formatters.currency(curr.revenue)}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Category Mix Share</span>
                    <span class="item-stat-val" style="color: var(--color-brand-azure);">${formatters.percent(curr.mix_pct)}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Sales Count / PPU</span>
                    <span class="item-stat-val">${formatters.number(curr.sales)} / ${curr.ppu}</span>
                </div>
            </div>
        `;
    });

    Object.values(RETAIL_DSR_DATA.subCategories).forEach(sub => {
        const curr = sub.monthly[m] || { sales: 0, revenue: 0, aov: 0, ppu: 0 };
        const prev = sub.monthly[prevM] || { sales: 0, revenue: 0 };
        const delta = formatters.deltaPercent(curr.revenue, prev.revenue);

        html += `
            <div class="glass-panel sub-item-card" style="background: var(--glass-bg-subtle);">
                <div class="item-header">
                    <span class="item-name">📦 ${sub.name}</span>
                    <span class="delta-badge ${delta.isPositive ? 'delta-positive' : 'delta-negative'}">${delta.text}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Sub-category Revenue</span>
                    <span class="item-stat-val">${formatters.currency(curr.revenue)}</span>
                </div>
                <div class="item-stat-row">
                    <span class="item-stat-label">Sales Orders / AOV</span>
                    <span class="item-stat-val">${formatters.number(curr.sales)} / ${formatters.currency(curr.aov)}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function updateChartThemes() {
    renderCharts();
}

// Export CSV Feature
function exportDashboardCSV() {
    const months = RETAIL_DSR_DATA.months;
    const metrics = RETAIL_DSR_DATA.overviewMetrics;
    
    let csvContent = "Metric," + months.join(",") + "\n";

    metrics.forEach(met => {
        let row = `"${met.name}"`;
        months.forEach(m => {
            const v = RETAIL_DSR_DATA.monthlyData[m]?.metrics?.[met.id] ?? 0;
            row += `,${v}`;
        });
        csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `V2_COCO_STORES_MASTER_DASHBOARD_${state.selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
