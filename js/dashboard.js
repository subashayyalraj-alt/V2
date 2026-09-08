/**
 * V2 COCO STORES MASTER DASHBOARD Controller
 * Handles live Google Sheets sync, MoM comparisons, Financial Year filtering, Chart.js instances, and responsive interactions.
 */

// State Object
const state = {
    selectedMonth: "Sep'26",
    compareMonth: "Aug'26",
    compareMode: "mom", // "mom" | "target" | "custom"
    timeHorizon: "current-fy", // "current-fy" | 3 | 6 | 12 | 25
    activeTab: "overview",
    theme: "dark-sapphire",
    charts: {}
};

// Month Normalization & Parsing Utilities
function normalizeMonth(m) {
    if (!m) return "";
    let s = String(m).trim();
    s = s.replace(/July'/i, "Jul'").replace(/June'/i, "Jun'").replace(/April'/i, "Apr'").replace(/Sept'/i, "Sep'");
    return s;
}

function parseMonthToDate(mStr) {
    if (!mStr) return new Date(0);
    const norm = normalizeMonth(mStr);
    const match = norm.match(/([A-Za-z]+)'?(\d{2,4})/);
    if (!match) return new Date(0);
    const monMap = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const mon = monMap[match[1].toLowerCase().slice(0, 3)] ?? 0;
    let yr = parseInt(match[2], 10);
    if (yr < 100) yr += 2000;
    return new Date(yr, mon, 1);
}

// Data Lookups with Normalization Fallback
function getOverviewMonthly(m) {
    if (!RETAIL_DSR_DATA || !RETAIL_DSR_DATA.monthlyData) return { metrics: {} };
    if (RETAIL_DSR_DATA.monthlyData[m]) return RETAIL_DSR_DATA.monthlyData[m];
    const targetNorm = normalizeMonth(m);
    for (const k of Object.keys(RETAIL_DSR_DATA.monthlyData)) {
        if (normalizeMonth(k) === targetNorm) {
            return RETAIL_DSR_DATA.monthlyData[k];
        }
    }
    return { metrics: {} };
}

function getStoreMonthly(store, m) {
    if (!store || !store.monthly) return { leads: 0, conversions: 0, cvr: 0, ebvmr_net: 0, monthLabel: m, isFallback: false };
    
    // 1. Direct match with non-zero check
    if (store.monthly[m] && (store.monthly[m].leads > 0 || store.monthly[m].conversions > 0 || store.monthly[m].ebvmr_net > 0)) {
        return { ...store.monthly[m], monthLabel: m, isFallback: false };
    }
    
    // 2. Normalized match (e.g. July'26 <-> Jul'26)
    const targetNorm = normalizeMonth(m);
    for (const k of Object.keys(store.monthly)) {
        if (normalizeMonth(k) === targetNorm && (store.monthly[k].leads > 0 || store.monthly[k].conversions > 0 || store.monthly[k].ebvmr_net > 0)) {
            return { ...store.monthly[k], monthLabel: k, isFallback: false };
        }
    }

    // 3. Fallback to latest populated month in that store
    const availableMonths = Object.keys(store.monthly).filter(k => {
        const d = store.monthly[k];
        return d && (d.leads > 0 || d.conversions > 0 || d.ebvmr_net > 0);
    });

    if (availableMonths.length > 0) {
        availableMonths.sort((a, b) => parseMonthToDate(b) - parseMonthToDate(a));
        const latestPopulated = availableMonths[0];
        return { ...store.monthly[latestPopulated], monthLabel: latestPopulated, isFallback: true };
    }

    return { leads: 0, conversions: 0, cvr: 0, ebvmr_net: 0, monthLabel: m, isFallback: false };
}

function getStorePreviousMonthly(store, currMonthLabel) {
    if (!store || !store.monthly) return { leads: 0, conversions: 0, cvr: 0, ebvmr_net: 0 };
    const availableMonths = Object.keys(store.monthly).filter(k => {
        const d = store.monthly[k];
        return d && (d.leads > 0 || d.conversions > 0 || d.ebvmr_net > 0);
    });
    if (availableMonths.length > 1) {
        availableMonths.sort((a, b) => parseMonthToDate(b) - parseMonthToDate(a));
        const currIdx = availableMonths.findIndex(k => normalizeMonth(k) === normalizeMonth(currMonthLabel));
        if (currIdx !== -1 && currIdx + 1 < availableMonths.length) {
            const prevMonth = availableMonths[currIdx + 1];
            return { ...store.monthly[prevMonth], monthLabel: prevMonth };
        }
    }
    return { leads: 0, conversions: 0, cvr: 0, ebvmr_net: 0 };
}


function getChannelMonthly(ch, m) {
    if (!ch || !ch.monthly) return { leads: 0, conversions: 0, cvr: 0, revenue: 0, arpu: 0, sales: 0 };
    if (ch.monthly[m]) return ch.monthly[m];
    const targetNorm = normalizeMonth(m);
    for (const k of Object.keys(ch.monthly)) {
        if (normalizeMonth(k) === targetNorm) {
            return ch.monthly[k];
        }
    }
    return { leads: 0, conversions: 0, cvr: 0, revenue: 0, arpu: 0, sales: 0 };
}

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

// Google Apps Script Web App URL
const LIVE_API_URL = window.APPS_SCRIPT_URL || '';

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initTabs();
    initQuickFilters();

    if (LIVE_API_URL && LIVE_API_URL !== '') {
        loadLiveData();
    } else {
        initSelectors();
        renderAllViews();
        showDataSourceBadge('static');
    }
});

function loadLiveData() {
    showLoadingOverlay(true);
    fetch(LIVE_API_URL)
        .then(r => r.json())
        .then(liveData => {
            if (liveData.error) throw new Error(liveData.error);

            // Merge live data into RETAIL_DSR_DATA
            RETAIL_DSR_DATA.monthlyData = liveData.monthlyData || RETAIL_DSR_DATA.monthlyData;
            RETAIL_DSR_DATA.channels    = liveData.channels    || RETAIL_DSR_DATA.channels;
            RETAIL_DSR_DATA.cocoStores  = liveData.cocoStores  || RETAIL_DSR_DATA.cocoStores;

            // Collect and sort all months chronologically
            const allMonthsSet = new Set();
            if (Array.isArray(liveData.months)) {
                liveData.months.forEach(m => allMonthsSet.add(m));
            }
            if (liveData.monthlyData) {
                Object.keys(liveData.monthlyData).forEach(m => allMonthsSet.add(m));
            }
            if (RETAIL_DSR_DATA.months) {
                RETAIL_DSR_DATA.months.forEach(m => allMonthsSet.add(m));
            }

            const sortedMonths = Array.from(allMonthsSet).sort((a, b) => {
                return parseMonthToDate(a) - parseMonthToDate(b);
            });

            if (sortedMonths.length > 0) {
                RETAIL_DSR_DATA.months = sortedMonths;
                state.selectedMonth = sortedMonths[sortedMonths.length - 1];
                state.compareMonth = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 2] : sortedMonths[0];
            }

            initSelectors();
            showLoadingOverlay(false);
            renderAllViews();
            showDataSourceBadge('live', liveData.lastUpdated);
        })
        .catch(err => {
            console.warn('Live data fetch failed, falling back to static data:', err);
            showLoadingOverlay(false);
            initSelectors();
            renderAllViews();
            showDataSourceBadge('fallback');
        });
}

function showLoadingOverlay(show) {
    let overlay = document.getElementById('dashLoadingOverlay');
    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'dashLoadingOverlay';
            overlay.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;gap:1rem;">
                    <div style="width:44px;height:44px;border:3px solid rgba(0,229,255,0.2);border-top-color:#00e5ff;border-radius:50%;animation:spin 0.9s linear infinite;"></div>
                    <div style="font-family:'Outfit',sans-serif;font-size:1rem;font-weight:600;color:#00e5ff;">Fetching live data from Google Sheets...</div>
                    <div style="font-size:0.78rem;color:#64748b;">Real-time sync in progress</div>
                </div>`;
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,40,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}

function showDataSourceBadge(mode, lastUpdated) {
    let badge = document.getElementById('dataSourceBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'dataSourceBadge';
        badge.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:999;padding:6px 14px;border-radius:99px;font-size:0.72rem;font-weight:700;font-family:Outfit,sans-serif;backdrop-filter:blur(10px);border:1px solid;cursor:default;';
        document.body.appendChild(badge);
    }
    if (mode === 'live') {
        const t = lastUpdated ? new Date(lastUpdated).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '';
        badge.innerHTML = `🟢 LIVE &nbsp;•&nbsp; Updated ${t}`;
        badge.style.background = 'rgba(16,185,129,0.18)';
        badge.style.borderColor = 'rgba(16,185,129,0.5)';
        badge.style.color = '#10b981';
    } else if (mode === 'fallback') {
        badge.innerHTML = '🟡 Offline — showing last saved data';
        badge.style.background = 'rgba(245,158,11,0.18)';
        badge.style.borderColor = 'rgba(245,158,11,0.5)';
        badge.style.color = '#f59e0b';
    } else {
        badge.innerHTML = '⚪ Static Data — connect Apps Script for live sync';
        badge.style.background = 'rgba(100,116,139,0.18)';
        badge.style.borderColor = 'rgba(100,116,139,0.4)';
        badge.style.color = '#94a3b8';
    }
}

function initSelectors() {
    const monthSelect = document.getElementById("selectedMonthSelect");
    const compareSelect = document.getElementById("compareMonthSelect");
    const compareModeSelect = document.getElementById("compareModeSelect");

    if (!monthSelect || !compareSelect || !RETAIL_DSR_DATA || !RETAIL_DSR_DATA.months) return;

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

    monthSelect.onchange = (e) => {
        state.selectedMonth = e.target.value;
        const currentIdx = RETAIL_DSR_DATA.months.indexOf(state.selectedMonth);
        if (currentIdx > 0 && state.compareMode === "mom") {
            state.compareMonth = RETAIL_DSR_DATA.months[currentIdx - 1];
            compareSelect.value = state.compareMonth;
        }
        renderAllViews();
    };

    compareSelect.onchange = (e) => {
        state.compareMonth = e.target.value;
        renderAllViews();
    };

    if (compareModeSelect) {
        compareModeSelect.onchange = (e) => {
            state.compareMode = e.target.value;
            const compGroup = document.getElementById("compareMonthGroup");
            if (compGroup) {
                compGroup.style.display = state.compareMode === "target" ? "none" : "flex";
            }
            renderAllViews();
        };
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

            // Re-render the active tab components to ensure canvas & DOM elements paint with full width
            if (state.activeTab === "stores") {
                renderCocoStores();
            } else if (state.activeTab === "channels") {
                renderChannels();
            } else if (state.activeTab === "categories") {
                renderCategories();
            } else {
                renderHeroKPIs();
                renderMatrixTable();
                renderCharts();
            }

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

// Render Executive Hero KPI Cards
function renderHeroKPIs() {
    const container = document.getElementById("kpiHeroGrid");
    if (!container) return;

    const currData = getOverviewMonthly(state.selectedMonth).metrics || {};
    const prevData = getOverviewMonthly(state.compareMonth).metrics || {};
    const meta = getOverviewMonthly(state.selectedMonth).meta;

    // Requested Sequential Order:
    // 1. Total Leads, 2. Total Conversions, 3. Conversion Rate (CVR), 4. Net EBVMR / Revenue,
    // 5. AOV, 6. Cancellation Count, 7. Cancellation Rate, 8. Cancelled Revenue
    const kpiCards = [
        {
            key: "leads",
            title: "Total Leads",
            icon: "👥",
            val: currData.leads,
            prevVal: prevData.leads,
            formatter: formatters.number,
            isCurrency: false
        },
        {
            key: "conversions",
            title: "Total Conversions",
            icon: "🎯",
            val: currData.conversions,
            prevVal: prevData.conversions,
            formatter: formatters.number,
            isCurrency: false
        },
        {
            key: "cvr",
            title: "Conversion Rate (CVR)",
            icon: "⚡",
            val: currData.cvr,
            prevVal: prevData.cvr,
            formatter: formatters.percent,
            isCurrency: false
        },
        {
            key: "ebvmr_net",
            title: "Net EBVMR / Revenue",
            icon: "💎",
            val: currData.ebvmr_net,
            prevVal: prevData.ebvmr_net,
            formatter: formatters.currency,
            highlight: true,
            isCurrency: true,
            meta: meta
        },
        {
            key: "aov_overall",
            title: "Average Order Value (AOV)",
            icon: "🛒",
            val: currData.aov_overall,
            prevVal: prevData.aov_overall,
            formatter: formatters.currency,
            isCurrency: true
        },
        {
            key: "cancel_count",
            title: "Cancellation Count",
            icon: "⚠️",
            val: currData.cancel_count,
            prevVal: prevData.cancel_count,
            formatter: formatters.number,
            reverseColor: true,
            isCurrency: false
        },
        {
            key: "cancel_pct",
            title: "Cancellation Rate (%)",
            icon: "📉",
            val: currData.cancel_pct,
            prevVal: prevData.cancel_pct,
            formatter: formatters.percent,
            reverseColor: true,
            isCurrency: false
        },
        {
            key: "cancel_rev",
            title: "Cancelled Revenue",
            icon: "💸",
            val: currData.cancel_rev,
            prevVal: prevData.cancel_rev,
            formatter: formatters.currency,
            reverseColor: true,
            isCurrency: true
        }
    ];

    let html = "";
    kpiCards.forEach(card => {
        const delta = formatters.deltaPercent(card.val || 0, card.prevVal || 0);
        let deltaClass = delta.isPositive ? "delta-positive" : "delta-negative";
        if (card.reverseColor) {
            deltaClass = delta.isPositive ? "delta-negative" : "delta-positive";
        }
        if (delta.isZero) deltaClass = "delta-neutral";

        // Correct formatting: ONLY currency KPIs get ₹
        const formattedPrev = card.isCurrency 
            ? formatters.currency(card.prevVal || 0) 
            : card.formatter(card.prevVal || 0);

        let extraMetaHtml = "";
        if (card.meta && card.meta.trending_to) {
            const pctFill = Math.min(100, Math.round((card.val / card.meta.trending_to) * 100));
            extraMetaHtml = `
                <div class="target-progress-container">
                    <div class="target-label-row">
                        <span>Trending: ${formatters.currency(card.meta.trending_to)}</span>
                        <span>Deficit: ${card.meta.deficit_pct}%</span>
                    </div>
                    <div class="target-progress-track">
                        <div class="target-progress-fill" style="width: ${pctFill}%;"></div>
                    </div>
                </div>
            `;
        }

        html += `
            <div class="glass-panel kpi-card">
                <div class="kpi-card-header">
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <div class="kpi-icon-pill">${card.icon}</div>
                        <div class="kpi-title">${card.title}</div>
                    </div>
                    <span class="delta-badge ${deltaClass}">
                        ${delta.isPositive ? '▲' : '▼'} ${delta.text}
                    </span>
                </div>
                <div class="kpi-main-val ${card.highlight ? 'highlight-val' : ''}">
                    ${card.formatter(card.val)}
                </div>
                <div class="kpi-footer">
                    <span class="kpi-prev-val">vs. ${formattedPrev} in ${state.compareMonth}</span>
                </div>
                ${extraMetaHtml}
            </div>
        `;
    });

    container.innerHTML = html;
}

// Render MoM Complete Matrix Table
function renderMatrixTable() {
    const tbody = document.getElementById("matrixTableBody");
    if (!tbody) return;

    const currData = getOverviewMonthly(state.selectedMonth).metrics || {};
    const prevData = getOverviewMonthly(state.compareMonth).metrics || {};

    const metricsList = RETAIL_DSR_DATA.overviewMetrics || [
        { id: "leads", name: "Total Leads", format: "number" },
        { id: "conversions", name: "Total Conversions", format: "number" },
        { id: "cvr", name: "Conversion Rate (CVR)", format: "percent" },
        { id: "ebvmr_net", name: "Net EBVMR / Revenue", format: "currency" },
        { id: "aov_overall", name: "Average Order Value (AOV)", format: "currency" },
        { id: "cancel_count", name: "Cancellation Count", format: "number" },
        { id: "cancel_pct", name: "Cancellation Rate (%)", format: "percent" },
        { id: "cancel_rev", name: "Cancelled Revenue", format: "currency" }
    ];

    let rowsHtml = "";
    metricsList.forEach(m => {
        const cVal = currData[m.id] || 0;
        const pVal = prevData[m.id] || 0;
        const delta = formatters.deltaPercent(cVal, pVal);

        let fmtFn = formatters[m.format] || formatters.number;
        const formattedCurr = fmtFn(cVal);
        const formattedPrev = fmtFn(pVal);

        const deltaClass = delta.isPositive ? "delta-positive" : "delta-negative";

        rowsHtml += `
            <tr>
                <td class="metric-name-cell">
                    <strong>${m.name}</strong>
                </td>
                <td><strong style="color:var(--text-main);">${formattedCurr}</strong></td>
                <td style="color:var(--text-secondary);">${formattedPrev}</td>
                <td>
                    <span class="delta-badge ${deltaClass}">
                        ${delta.isPositive ? '▲' : '▼'} ${delta.text}
                    </span>
                </td>
                <td style="font-family:'Outfit',sans-serif; color:var(--text-muted); font-size:0.85rem;">
                    ${delta.diff > 0 ? '+' : ''}${fmtFn(delta.diff)}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml;
}

// Render Daily Revenue & Conversion Trajectory
function renderDailyAugust() {
    const container = document.getElementById("dailyTrajectoryStrip");
    if (!container || !RETAIL_DSR_DATA.dailyAug) return;

    let maxRev = 1;
    RETAIL_DSR_DATA.dailyAug.forEach(d => {
        if (d.revenue > maxRev) maxRev = d.revenue;
    });

    let html = "";
    RETAIL_DSR_DATA.dailyAug.forEach(d => {
        const isWeekend = d.dow === "Sat" || d.dow === "Sun";
        const pctFill = Math.min(100, Math.round((d.revenue / maxRev) * 100));

        html += `
            <div class="daily-block ${isWeekend ? 'weekend' : ''}">
                <div class="daily-header-row">
                    <span class="daily-date">Day ${d.day}</span>
                    <span class="daily-dow-badge">${d.dow}</span>
                </div>
                <div class="daily-rev">${formatters.currency(d.revenue)}</div>
                <div class="daily-stats-row">
                    <span>${d.conversions} orders</span>
                    <span class="daily-cvr-pill">${Number(d.cvr).toFixed(1)}% CVR</span>
                </div>
                <div class="daily-mini-track">
                    <div class="daily-mini-fill" style="width:${pctFill}%;"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Charts Management
function renderCharts() {
    renderTrendChart();
    renderChannelMixChart();
    renderFunnelChart();
    renderCancellationChart();
}

function getFilteredMonths() {
    const allMonths = RETAIL_DSR_DATA.months || [];
    if (state.timeHorizon === "current-fy") {
        const fyMonths = allMonths.filter(m => {
            const d = parseMonthToDate(m);
            return d >= new Date(2026, 3, 1);
        });
        if (fyMonths.length > 0) return fyMonths;
        return allMonths.slice(-6);
    }

    const horizon = typeof state.timeHorizon === "number" ? state.timeHorizon : 6;
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
    const revenueData = months.map(m => getOverviewMonthly(m).metrics?.ebvmr_net || 0);
    const conversionsData = months.map(m => getOverviewMonthly(m).metrics?.conversions || 0);
    const leadsData = months.map(m => getOverviewMonthly(m).metrics?.leads || 0);

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
    const cvrData = months.map(m => getOverviewMonthly(m).metrics?.cvr || 0);
    const arpuData = months.map(m => getOverviewMonthly(m).metrics?.arpu_blended || 0);

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
    const channels = [
        { key: "walkin", label: "Walk-in", color: "#00e5ff" },
        { key: "popin", label: "Video Call Leads", color: "#0077ff" },
        { key: "app_lead", label: "App Leads", color: "#38bdf8" },
        { key: "is_leads", label: "IS Leads", color: "#818cf8" },
        { key: "store_calls", label: "Store Calls", color: "#10b981" }
    ];

    const labels = channels.map(c => c.label);
    const data = channels.map(c => {
        const ch = RETAIL_DSR_DATA.channels?.[c.key];
        return getChannelMonthly(ch, m).revenue || 0;
    });
    const colors = channels.map(c => c.color);

    const isLight = state.theme === "light-ice";
    const textColor = isLight ? "#475569" : "#94a3b8";

    state.charts.channelMix = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: isLight ? "#ffffff" : "#0d1b2a"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: textColor, font: { family: "Outfit", size: 11 }, padding: 12 }
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

function renderCancellationChart() {
    const ctx = document.getElementById("cancelChartCanvas")?.getContext("2d");
    if (!ctx) return;

    if (state.charts.cancel) {
        state.charts.cancel.destroy();
    }

    const months = getFilteredMonths();
    const rentalCancelVal = months.map(m => getOverviewMonthly(m).metrics?.rental_cancel_val || 0);
    const sellingCancelVal = months.map(m => getOverviewMonthly(m).metrics?.selling_cancel_val || 0);

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

    // Build Store Cards
    let cardsHtml = "";
    storesList.forEach(store => {
        const curr = getStoreMonthly(store, m);
        const prev = curr.isFallback ? getStorePreviousMonthly(store, curr.monthLabel) : getStoreMonthly(store, prevM);


        const deltaLeads = formatters.deltaPercent(curr.leads, prev.leads);
        const deltaConv = formatters.deltaPercent(curr.conversions, prev.conversions);
        const deltaCvr = formatters.deltaPercent(curr.cvr, prev.cvr);
        const deltaRev = formatters.deltaPercent(curr.ebvmr_net, prev.ebvmr_net);

        let fallbackBadge = "";
        if (curr.isFallback) {
            fallbackBadge = `<span class="coco-tab-badge" style="color:#f59e0b; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3);">Showing: ${curr.monthLabel} (Sep MTD pending)</span>`;
        }

        cardsHtml += `
            <div class="glass-panel coco-store-card">
                <div class="coco-store-header">
                    <div>
                        <div class="coco-store-name">🏬 ${store.name}</div>
                        <div class="coco-tab-badge">Tab: ${store.tab} • ${store.city}</div>
                        ${fallbackBadge}
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
            const revA = getStoreMonthly(a, m).ebvmr_net || 0;
            const revB = getStoreMonthly(b, m).ebvmr_net || 0;
            return revB - revA;
        });

        const topRevenue = getStoreMonthly(sortedStores[0], m).ebvmr_net || 1;

        let rankHtml = "";
        sortedStores.forEach((st, idx) => {
            const rank = idx + 1;
            const curr = getStoreMonthly(st, m);
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
    const revenueData = storesList.map(s => getStoreMonthly(s, m).ebvmr_net || 0);
    const cvrData = storesList.map(s => getStoreMonthly(s, m).cvr || 0);
    const convData = storesList.map(s => getStoreMonthly(s, m).conversions || 0);

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

// Leads Analysis — 5 channel cards + comparison charts + leaderboard
function renderChannels() {
    const container = document.getElementById("channelsGrid");
    if (!container) return;

    const m = state.selectedMonth;
    const prevM = state.compareMonth;

    const channelDefs = [
        { key: "walkin",      label: "Walk-in",          icon: "🏬", color: "#00e5ff" },
        { key: "popin",       label: "Video Call Leads",  icon: "📹", color: "#0077ff" },
        { key: "app_lead",    label: "App Leads",         icon: "📱", color: "#38bdf8" },
        { key: "is_leads",    label: "IS Leads",          icon: "🎧", color: "#818cf8" },
        { key: "store_calls", label: "Store Calls",       icon: "📞", color: "#10b981" }
    ];

    let html = "";

    channelDefs.forEach(chDef => {
        const ch = RETAIL_DSR_DATA.channels?.[chDef.key];
        const curr = getChannelMonthly(ch, m);
        const prev = getChannelMonthly(ch, prevM);

        const deltaLeads = formatters.deltaPercent(curr.leads, prev.leads);
        const deltaConv  = formatters.deltaPercent(curr.conversions, prev.conversions);
        const deltaCvr   = formatters.deltaPercent(curr.cvr, prev.cvr);
        const deltaRev   = formatters.deltaPercent(curr.revenue, prev.revenue);

        // Leads vs conversions bar widths
        const maxBar = Math.max(curr.leads, 1);
        const convWidth = Math.min(100, Math.round((curr.conversions / maxBar) * 100));
        const leadsWidth = 100;

        html += `
            <div class="glass-panel leads-channel-card" style="border-top: 3px solid ${chDef.color};">
                <!-- Header -->
                <div class="leads-channel-header">
                    <div class="leads-channel-title">
                        <span style="font-size:1.4rem;">${chDef.icon}</span>
                        <span class="leads-channel-name">${chDef.label}</span>
                    </div>
                    <span class="delta-badge ${deltaRev.isPositive ? 'delta-positive' : 'delta-negative'}" title="MoM Revenue Change">
                        ${deltaRev.isPositive ? '▲' : '▼'} ${deltaRev.text}
                    </span>
                </div>

                <!-- Leads vs Conversions Visual Bar -->
                <div class="leads-funnel-visual">
                    <div class="funnel-row">
                        <span class="funnel-label">Leads</span>
                        <div class="funnel-bar-track">
                            <div class="funnel-bar-fill" style="width:${leadsWidth}%; background: ${chDef.color}44;"></div>
                        </div>
                        <div class="funnel-val-group">
                            <span class="funnel-value" style="color:${chDef.color};">${formatters.number(curr.leads)}</span>
                            <span class="delta-badge ${deltaLeads.isPositive ? 'delta-positive' : 'delta-negative'}" style="font-size:0.65rem; padding:1px 5px;">${deltaLeads.text}</span>
                        </div>
                    </div>
                    <div class="funnel-arrow">↓ ${formatters.percent(curr.cvr)} CVR</div>
                    <div class="funnel-row">
                        <span class="funnel-label">Conversions</span>
                        <div class="funnel-bar-track">
                            <div class="funnel-bar-fill" style="width:${convWidth}%; background: ${chDef.color};"></div>
                        </div>
                        <div class="funnel-val-group">
                            <span class="funnel-value">${formatters.number(curr.conversions)}</span>
                            <span class="delta-badge ${deltaConv.isPositive ? 'delta-positive' : 'delta-negative'}" style="font-size:0.65rem; padding:1px 5px;">${deltaConv.text}</span>
                        </div>
                    </div>
                </div>

                <!-- KPI Row: CVR + Revenue -->
                <div class="leads-kpi-row">
                    <div class="leads-kpi-box">
                        <div class="leads-kpi-box-label">CVR %</div>
                        <div class="leads-kpi-box-val" style="color:${chDef.color};">${formatters.percent(curr.cvr)}</div>
                        <div class="delta-badge ${deltaCvr.isPositive ? 'delta-positive' : 'delta-negative'}" style="font-size:0.65rem; padding:1px 5px; margin-top:2px;">${deltaCvr.text}</div>
                    </div>
                    <div class="leads-kpi-box">
                        <div class="leads-kpi-box-label">Revenue</div>
                        <div class="leads-kpi-box-val" style="color:var(--color-brand-cyan); font-size:1rem;">${formatters.currency(curr.revenue)}</div>
                        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">ARPU: ${formatters.currency(curr.arpu)}</div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Render the comparison charts + leaderboard
    renderLeadsComparisonCharts(channelDefs, m);
    renderChannelLeaderboard(channelDefs, m);
}

function renderLeadsComparisonCharts(channelDefs, m) {
    const isLight = state.theme === "light-ice";
    const gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
    const textColor = isLight ? "#475569" : "#94a3b8";

    const labels  = channelDefs.map(c => c.label);
    const colors  = channelDefs.map(c => c.color);
    const leadsD  = channelDefs.map(c => {
        const ch = RETAIL_DSR_DATA.channels?.[c.key];
        return getChannelMonthly(ch, m).leads || 0;
    });
    const convD   = channelDefs.map(c => {
        const ch = RETAIL_DSR_DATA.channels?.[c.key];
        return getChannelMonthly(ch, m).conversions || 0;
    });
    const cvrD    = channelDefs.map(c => {
        const ch = RETAIL_DSR_DATA.channels?.[c.key];
        return getChannelMonthly(ch, m).cvr || 0;
    });
    const revD    = channelDefs.map(c => {
        const ch = RETAIL_DSR_DATA.channels?.[c.key];
        return getChannelMonthly(ch, m).revenue || 0;
    });

    // 1. Leads vs Conversions grouped bar
    const lvcCtx = document.getElementById("leadsVsConvCanvas")?.getContext("2d");
    if (lvcCtx) {
        if (state.charts.leadsVsConv) state.charts.leadsVsConv.destroy();
        state.charts.leadsVsConv = new Chart(lvcCtx, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Total Leads",
                        data: leadsD,
                        backgroundColor: colors.map(c => c + "55"),
                        borderColor: colors,
                        borderWidth: 1.5,
                        borderRadius: 6
                    },
                    {
                        label: "Conversions",
                        data: convD,
                        backgroundColor: colors.map(c => c + "cc"),
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { family: "Outfit" } } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatters.number(ctx.parsed.y)}` } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor } }
                }
            }
        });
    }

    // 2. Revenue by channel (horizontal bar)
    const revCtx = document.getElementById("channelRevenueCanvas")?.getContext("2d");
    if (revCtx) {
        if (state.charts.channelRevenue) state.charts.channelRevenue.destroy();
        state.charts.channelRevenue = new Chart(revCtx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Revenue (₹)",
                    data: revD,
                    backgroundColor: colors.map(c => c + "cc"),
                    borderRadius: 8
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` Revenue: ${formatters.currency(ctx.parsed.x)}` } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => formatters.currency(v) } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: "Outfit", weight: 600 } } }
                }
            }
        });
    }

    // 3. CVR % bar chart
    const cvrCtx = document.getElementById("channelCvrCanvas")?.getContext("2d");
    if (cvrCtx) {
        if (state.charts.channelCvr) state.charts.channelCvr.destroy();
        state.charts.channelCvr = new Chart(cvrCtx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "CVR % (All LOBs)",
                    data: cvrD,
                    backgroundColor: colors.map(c => c + "99"),
                    borderColor: colors,
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` CVR: ${ctx.parsed.y}%` } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => `${v}%` } }
                }
            }
        });
    }
}

function renderChannelLeaderboard(channelDefs, m) {
    const container = document.getElementById("channelLeaderboard");
    if (!container) return;

    const ranked = [...channelDefs].sort((a, b) => {
        const rA = getChannelMonthly(RETAIL_DSR_DATA.channels?.[a.key], m).revenue || 0;
        const rB = getChannelMonthly(RETAIL_DSR_DATA.channels?.[b.key], m).revenue || 0;
        return rB - rA;
    });

    const topRev = getChannelMonthly(RETAIL_DSR_DATA.channels?.[ranked[0]?.key], m).revenue || 1;
    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

    let html = "";
    ranked.forEach((ch, idx) => {
        const data = getChannelMonthly(RETAIL_DSR_DATA.channels?.[ch.key], m);
        const rev  = data.revenue || 0;
        const cvr  = data.cvr || 0;
        const leads = data.leads || 0;
        const conv = data.conversions || 0;
        const pct  = Math.min(100, Math.round((rev / topRev) * 100));

        html += `
            <div style="display:flex; align-items:center; gap:0.75rem; padding:0.55rem 0.35rem; border-bottom:1px solid rgba(255,255,255,0.04);">
                <span style="font-size:1.2rem; flex-shrink:0;">${medals[idx]}</span>
                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                        <span style="font-family:'Outfit',sans-serif; font-weight:700; font-size:0.9rem; color:${ch.color};">${ch.icon} ${ch.label}</span>
                        <span style="font-weight:700; font-size:0.88rem; color:var(--color-brand-cyan);">${formatters.currency(rev)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.74rem; color:var(--text-muted); margin-bottom:4px;">
                        <span>${formatters.number(conv)} conv / ${formatters.number(leads)} leads</span>
                        <span>CVR: <strong style="color:var(--text-secondary);">${formatters.percent(cvr)}</strong></span>
                    </div>
                    <div style="height:3px; background:rgba(255,255,255,0.07); border-radius:99px; overflow:hidden;">
                        <div style="height:100%; width:${pct}%; background:linear-gradient(90deg,${ch.color},${ch.color}99); border-radius:99px;"></div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Render Categories & Products
function renderCategories() {
    const container = document.getElementById("categoriesGrid");
    if (!container || !RETAIL_DSR_DATA.categories) return;

    const m = state.selectedMonth;
    const prevM = state.compareMonth;
    let html = "";

    Object.values(RETAIL_DSR_DATA.categories).forEach(cat => {
        const curr = cat.monthly?.[m] || { sales: 0, revenue: 0, arpu: 0, ppu: 0, mix_pct: 0 };
        const prev = cat.monthly?.[prevM] || { sales: 0, revenue: 0, arpu: 0, ppu: 0, mix_pct: 0 };
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

    if (RETAIL_DSR_DATA.subCategories) {
        Object.values(RETAIL_DSR_DATA.subCategories).forEach(sub => {
            const curr = sub.monthly?.[m] || { sales: 0, revenue: 0, aov: 0, ppu: 0 };
            const prev = sub.monthly?.[prevM] || { sales: 0, revenue: 0 };
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
    }

    container.innerHTML = html;
}

function updateChartThemes() {
    renderCharts();
    if (RETAIL_DSR_DATA.cocoStores) {
        renderCocoVisualizations(Object.values(RETAIL_DSR_DATA.cocoStores), state.selectedMonth);
    }
}

// CSV Export Utility
function exportDashboardCSV() {
    const months = RETAIL_DSR_DATA.months || [];
    let csv = "KPI Metric," + months.join(",") + "\n";

    const metrics = RETAIL_DSR_DATA.overviewMetrics || [];
    metrics.forEach(met => {
        const rowVals = months.map(m => getOverviewMonthly(m).metrics?.[met.id] || 0);
        csv += `"${met.name}",` + rowVals.join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `V2_COCO_STORES_DSR_${state.selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
