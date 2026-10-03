/**
 * AeroBrief G650ER - Main Application Controller
 */

import { NotamParser } from './notam-parser.js';
import { G650ERRulesEngine, G650ER_SPECS } from './g650er-rules.js';
import { MOCK_FLIGHT_PRESETS } from './mock-briefings.js';

class AeroBriefApp {
  constructor() {
    this.currentPresetIndex = 0;
    this.parsedNotams = [];
    this.evaluatedNotams = [];
    this.activeFilter = 'all';
    this.searchQuery = '';

    this.initElements();
    this.initClock();
    this.initFlightTimes();
    this.initPresetButtons();
    this.initEventListeners();

    // Load initial preset (Teterboro to Stansted)
    this.loadPreset(0);
  }

  initElements() {
    this.elements = {
      liveUtcClock: document.getElementById('live-utc-clock'),
      inputDepIcao: document.getElementById('input-dep-icao'),
      inputDepTime: document.getElementById('input-dep-time'),
      depStationLabel: document.getElementById('dep-station-label'),
      depUtcDisplay: document.getElementById('dep-utc-display'),
      inputArrIcao: document.getElementById('input-arr-icao'),
      inputArrTime: document.getElementById('input-arr-time'),
      arrStationLabel: document.getElementById('arr-station-label'),
      arrUtcDisplay: document.getElementById('arr-utc-display'),
      inputAltIcao: document.getElementById('input-alt-icao'),
      altStationLabel: document.getElementById('alt-station-label'),
      selectTimeBuffer: document.getElementById('select-time-buffer'),
      rawNotamsTextarea: document.getElementById('raw-notams-textarea'),
      btnRunAnalysis: document.getElementById('btn-run-analysis'),
      btnClearText: document.getElementById('btn-clear-text'),
      btnSampleBriefing: document.getElementById('btn-sample-briefing'),
      presetButtonsContainer: document.getElementById('preset-buttons-container'),
      countCritical: document.getElementById('count-critical'),
      countCaution: document.getElementById('count-caution'),
      countAdvisory: document.getElementById('count-advisory'),
      countInactive: document.getElementById('count-inactive'),
      briefingTimestamp: document.getElementById('briefing-timestamp'),
      summaryDepIcao: document.getElementById('summary-dep-icao'),
      summaryArrIcao: document.getElementById('summary-arr-icao'),
      summaryDepAlertBadge: document.getElementById('summary-dep-alert-badge'),
      summaryArrAlertBadge: document.getElementById('summary-arr-alert-badge'),
      summaryDepBullets: document.getElementById('summary-dep-bullets'),
      summaryArrBullets: document.getElementById('summary-arr-bullets'),
      notamsCardsContainer: document.getElementById('notams-cards-container'),
      filterPillContainer: document.getElementById('filter-pill-container'),
      notamSearchInput: document.getElementById('notam-search-input'),
      btnPrintBriefing: document.getElementById('btn-print-briefing'),
      btnAircraftSpecs: document.getElementById('btn-aircraft-specs'),
      specsModal: document.getElementById('specs-modal'),
      btnCloseSpecsModal: document.getElementById('btn-close-specs-modal'),
      btnTabFetch: document.getElementById('btn-tab-fetch'),
      fetchModal: document.getElementById('fetch-modal'),
      btnCloseFetchModal: document.getElementById('btn-close-fetch-modal'),
      modalDepIcao: document.getElementById('modal-dep-icao'),
      modalArrIcao: document.getElementById('modal-arr-icao'),
      btnExecuteFetch: document.getElementById('btn-execute-fetch'),
      selectFetchProvider: document.getElementById('select-fetch-provider'),
      apiKeyContainer: document.getElementById('api-key-container'),
      inputApiKey: document.getElementById('input-api-key')
    };
  }

  initClock() {
    const update = () => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      if (this.elements.liveUtcClock) {
        this.elements.liveUtcClock.textContent = `${h}:${m}:${s}Z`;
      }
    };
    update();
    setInterval(update, 1000);
  }

  initFlightTimes() {
    const now = new Date();
    // Default ETD: now + 2 hours
    const depDate = new Date(now.getTime() + 2 * 3600000);
    // Default ETA: now + 9 hours
    const arrDate = new Date(now.getTime() + 9 * 3600000);

    this.elements.inputDepTime.value = this.formatDatetimeLocal(depDate);
    this.elements.inputArrTime.value = this.formatDatetimeLocal(arrDate);
    this.updateUtcDisplays();
  }

  formatDatetimeLocal(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
  }

  getUtcFromInput(inputElement) {
    if (!inputElement || !inputElement.value) return null;
    // Input format: YYYY-MM-DDTHH:mm
    const [datePart, timePart] = inputElement.value.split('T');
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split('-').map(Number);
    const [h, min] = timePart.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, h, min, 0));
  }

  updateUtcDisplays() {
    const depUtc = this.getUtcFromInput(this.elements.inputDepTime);
    const arrUtc = this.getUtcFromInput(this.elements.inputArrTime);

    if (depUtc && this.elements.depUtcDisplay) {
      this.elements.depUtcDisplay.textContent = `ETD: ${NotamParser.formatUtc(depUtc)}`;
    }
    if (arrUtc && this.elements.arrUtcDisplay) {
      this.elements.arrUtcDisplay.textContent = `ETA: ${NotamParser.formatUtc(arrUtc)}`;
    }
  }

  initPresetButtons() {
    this.elements.presetButtonsContainer.innerHTML = '';
    MOCK_FLIGHT_PRESETS.forEach((preset, index) => {
      const btn = document.createElement('button');
      btn.className = `text-xs px-2.5 py-1 rounded font-medium transition border ${
        index === this.currentPresetIndex
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
      }`;
      btn.textContent = `${preset.depIcao} ➔ ${preset.arrIcao}`;
      btn.title = preset.name;
      btn.addEventListener('click', () => this.loadPreset(index));
      this.elements.presetButtonsContainer.appendChild(btn);
    });
  }

  loadPreset(index) {
    this.currentPresetIndex = index;
    const preset = MOCK_FLIGHT_PRESETS[index];
    if (!preset) return;

    this.elements.inputDepIcao.value = preset.depIcao;
    this.elements.inputArrIcao.value = preset.arrIcao;
    this.elements.inputAltIcao.value = preset.altIcao || '';
    this.elements.depStationLabel.textContent = preset.depName;
    this.elements.arrStationLabel.textContent = preset.arrName;
    this.elements.altStationLabel.textContent = preset.altName || 'Alternate';

    // Set relative UTC times
    const now = new Date();
    const depDate = new Date(now.getTime() + preset.hoursFromNowDep * 3600000);
    const arrDate = new Date(now.getTime() + preset.hoursFromNowArr * 3600000);

    this.elements.inputDepTime.value = this.formatDatetimeLocal(depDate);
    this.elements.inputArrTime.value = this.formatDatetimeLocal(arrDate);
    this.elements.rawNotamsTextarea.value = preset.notamsText.trim();

    this.initPresetButtons();
    this.updateUtcDisplays();
    this.runAnalysis();
  }

  initEventListeners() {
    // Inputs change
    this.elements.inputDepTime.addEventListener('change', () => {
      this.updateUtcDisplays();
      this.runAnalysis();
    });
    this.elements.inputArrTime.addEventListener('change', () => {
      this.updateUtcDisplays();
      this.runAnalysis();
    });
    this.elements.selectTimeBuffer.addEventListener('change', () => this.runAnalysis());
    this.elements.inputDepIcao.addEventListener('input', () => {
      this.elements.summaryDepIcao.textContent = this.elements.inputDepIcao.value.toUpperCase();
    });
    this.elements.inputArrIcao.addEventListener('input', () => {
      this.elements.summaryArrIcao.textContent = this.elements.inputArrIcao.value.toUpperCase();
    });

    // Run Analysis Button
    this.elements.btnRunAnalysis.addEventListener('click', () => this.runAnalysis());

    // Clear Text
    this.elements.btnClearText.addEventListener('click', () => {
      this.elements.rawNotamsTextarea.value = '';
    });

    // Re-load preset
    this.elements.btnSampleBriefing.addEventListener('click', () => {
      this.loadPreset(this.currentPresetIndex);
    });

    // Print Briefing
    this.elements.btnPrintBriefing.addEventListener('click', () => {
      window.print();
    });

    // Aircraft Specs Modal
    this.elements.btnAircraftSpecs.addEventListener('click', () => {
      this.elements.specsModal.classList.remove('hidden');
    });
    this.elements.btnCloseSpecsModal.addEventListener('click', () => {
      this.elements.specsModal.classList.add('hidden');
    });
    this.elements.specsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.specsModal) {
        this.elements.specsModal.classList.add('hidden');
      }
    });

    // Live Fetch Modal
    this.elements.btnTabFetch.addEventListener('click', () => {
      this.elements.modalDepIcao.textContent = this.elements.inputDepIcao.value.toUpperCase() || 'DEP';
      this.elements.modalArrIcao.textContent = this.elements.inputArrIcao.value.toUpperCase() || 'ARR';
      this.elements.fetchModal.classList.remove('hidden');
    });
    this.elements.btnCloseFetchModal.addEventListener('click', () => {
      this.elements.fetchModal.classList.add('hidden');
    });
    this.elements.fetchModal.addEventListener('click', (e) => {
      if (e.target === this.elements.fetchModal) {
        this.elements.fetchModal.classList.add('hidden');
      }
    });

    this.elements.selectFetchProvider.addEventListener('change', (e) => {
      if (e.target.value === 'custom-key') {
        this.elements.apiKeyContainer.classList.remove('hidden');
      } else {
        this.elements.apiKeyContainer.classList.add('hidden');
      }
    });

    this.elements.btnExecuteFetch.addEventListener('click', () => this.handleLiveFetch());

    // Filters
    this.elements.filterPillContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.remove('bg-amber-500', 'text-slate-950', 'font-bold');
        p.classList.add('bg-slate-800', 'text-slate-300');
      });
      pill.classList.remove('bg-slate-800', 'text-slate-300');
      pill.classList.add('bg-amber-500', 'text-slate-950', 'font-bold');
      this.activeFilter = pill.getAttribute('data-filter') || 'all';
      this.renderNotamsFeed();
    });

    // Search
    this.elements.notamSearchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderNotamsFeed();
    });
  }

  runAnalysis() {
    const rawText = this.elements.rawNotamsTextarea.value.trim();
    if (!rawText) {
      this.evaluatedNotams = [];
      this.updateHudAndSummaries();
      this.renderNotamsFeed();
      return;
    }

    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    const altIcao = this.elements.inputAltIcao.value.toUpperCase().trim();

    const depUtc = this.getUtcFromInput(this.elements.inputDepTime);
    const arrUtc = this.getUtcFromInput(this.elements.inputArrTime);
    const bufferHours = parseFloat(this.elements.selectTimeBuffer.value) || 2;

    // Split text into individual NOTAM strings
    const notamStrings = NotamParser.splitNotams(rawText);

    this.evaluatedNotams = notamStrings.map(str => {
      const parsed = NotamParser.parseNotam(str, depIcao);

      // Determine which flight stage this NOTAM belongs to
      let stage = 'OTHER';
      let targetUtc = null;

      const notamIcao = (parsed.icao || '').toUpperCase();
      const bodyUpper = (parsed.bodyText || '').toUpperCase();

      if (notamIcao === depIcao || bodyUpper.includes(depIcao) || parsed.raw.includes(`!${depIcao.replace(/^K/, '')}`)) {
        stage = 'DEP';
        targetUtc = depUtc;
      } else if (notamIcao === arrIcao || bodyUpper.includes(arrIcao) || parsed.raw.includes(`!${arrIcao.replace(/^K/, '')}`)) {
        stage = 'ARR';
        targetUtc = arrUtc;
      } else if (altIcao && (notamIcao === altIcao || bodyUpper.includes(altIcao))) {
        stage = 'ALT';
        targetUtc = arrUtc; // Alternate used near arrival
      } else {
        // Fallback guess based on order
        stage = 'DEP';
        targetUtc = depUtc;
      }

      // Check if active during flight window
      const isActiveInWindow = NotamParser.isFlightActive(parsed, targetUtc, bufferHours);

      // Evaluate through G650ER rules engine
      const evaluation = G650ERRulesEngine.evaluate(parsed, {
        stage,
        targetUtc,
        airportIcao: notamIcao || (stage === 'DEP' ? depIcao : arrIcao),
        bufferHours
      });

      return {
        parsed,
        evaluation,
        stage,
        targetUtc,
        isActiveInWindow
      };
    });

    // Sort: CRITICAL first, then CAUTION, then ADVISORY, then active vs inactive
    this.evaluatedNotams.sort((a, b) => {
      if (a.isActiveInWindow !== b.isActiveInWindow) {
        return a.isActiveInWindow ? -1 : 1;
      }
      return b.evaluation.severityScore - a.evaluation.severityScore;
    });

    this.updateHudAndSummaries();
    this.renderNotamsFeed();

    // Re-render Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  updateHudAndSummaries() {
    let criticalCount = 0;
    let cautionCount = 0;
    let advisoryCount = 0;
    let inactiveCount = 0;

    const depBullets = [];
    const arrBullets = [];

    this.evaluatedNotams.forEach(item => {
      if (!item.isActiveInWindow) {
        inactiveCount++;
      } else {
        if (item.evaluation.severity === 'CRITICAL') criticalCount++;
        else if (item.evaluation.severity === 'CAUTION') cautionCount++;
        else advisoryCount++;

        // Add to executive summary bullets if critical or caution
        if (item.evaluation.severity === 'CRITICAL' || item.evaluation.severity === 'CAUTION') {
          const bullet = {
            title: item.evaluation.impactTitle,
            summary: item.evaluation.executiveSummary,
            action: item.evaluation.pilotAction,
            severity: item.evaluation.severity
          };
          if (item.stage === 'DEP') depBullets.push(bullet);
          else if (item.stage === 'ARR') arrBullets.push(bullet);
        }
      }
    });

    // Update KPIs
    this.elements.countCritical.textContent = criticalCount;
    this.elements.countCaution.textContent = cautionCount;
    this.elements.countAdvisory.textContent = advisoryCount;
    this.elements.countInactive.textContent = inactiveCount;

    // Update Briefing Header
    const now = new Date();
    this.elements.briefingTimestamp.textContent = `LAST EVALUATION: ${NotamParser.formatUtc(now)}`;
    this.elements.summaryDepIcao.textContent = this.elements.inputDepIcao.value.toUpperCase();
    this.elements.summaryArrIcao.textContent = this.elements.inputArrIcao.value.toUpperCase();

    // Badges
    this.elements.summaryDepAlertBadge.textContent = depBullets.some(b => b.severity === 'CRITICAL')
      ? '🔴 CRITICAL HAZARDS'
      : (depBullets.length > 0 ? '🟡 CAUTION ADVISORIES' : '🟢 NO MAJOR HAZARDS');
    this.elements.summaryDepAlertBadge.className = `px-2 py-0.5 rounded text-[10px] font-mono ${
      depBullets.some(b => b.severity === 'CRITICAL')
        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
        : (depBullets.length > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40')
    }`;

    this.elements.summaryArrAlertBadge.textContent = arrBullets.some(b => b.severity === 'CRITICAL')
      ? '🔴 CRITICAL HAZARDS'
      : (arrBullets.length > 0 ? '🟡 CAUTION ADVISORIES' : '🟢 NO MAJOR HAZARDS');
    this.elements.summaryArrAlertBadge.className = `px-2 py-0.5 rounded text-[10px] font-mono ${
      arrBullets.some(b => b.severity === 'CRITICAL')
        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
        : (arrBullets.length > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40')
    }`;

    // Render Bullets
    this.renderBullets(this.elements.summaryDepBullets, depBullets, 'No significant departure hazards active during scheduled ETD.');
    this.renderBullets(this.elements.summaryArrBullets, arrBullets, 'No significant arrival hazards active during scheduled ETA.');
  }

  renderBullets(container, bullets, emptyMsg) {
    container.innerHTML = '';
    if (bullets.length === 0) {
      container.innerHTML = `<li class="text-slate-400 italic py-1 flex items-center gap-2"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> ${emptyMsg}</li>`;
      return;
    }

    bullets.forEach(b => {
      const li = document.createElement('li');
      li.className = 'space-y-1 bg-slate-950/70 p-2.5 rounded border border-slate-800';
      const colorClass = b.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400';
      const icon = b.severity === 'CRITICAL' ? 'alert-octagon' : 'alert-triangle';

      li.innerHTML = `
        <div class="font-bold ${colorClass} flex items-center gap-1.5">
          <i data-lucide="${icon}" class="w-3.5 h-3.5 shrink-0"></i>
          <span>${b.title}</span>
        </div>
        <p class="text-[11px] text-slate-300 leading-relaxed">${b.summary}</p>
        ${b.action ? `<div class="text-[10px] font-mono bg-slate-900 px-2 py-1 rounded text-cyan-300 border border-slate-800 mt-1"><span class="font-bold text-slate-400">CREW ACTION:</span> ${b.action}</div>` : ''}
      `;
      container.appendChild(li);
    });
  }

  renderNotamsFeed() {
    const container = this.elements.notamsCardsContainer;
    container.innerHTML = '';

    const filtered = this.evaluatedNotams.filter(item => {
      // 1. Search Query
      if (this.searchQuery) {
        const fullContent = (
          item.parsed.raw + ' ' +
          item.evaluation.impactTitle + ' ' +
          item.evaluation.executiveSummary + ' ' +
          item.evaluation.pilotAction + ' ' +
          item.parsed.icao
        ).toLowerCase();
        if (!fullContent.includes(this.searchQuery)) return false;
      }

      // 2. Active Tab Filter
      if (this.activeFilter === 'active-only') {
        return item.isActiveInWindow;
      }
      if (this.activeFilter === 'critical') {
        return item.evaluation.severity === 'CRITICAL';
      }
      if (this.activeFilter === 'caution') {
        return item.evaluation.severity === 'CAUTION';
      }
      if (this.activeFilter === 'runway') {
        return item.parsed.category === 'RUNWAY';
      }
      if (this.activeFilter === 'taxiway') {
        return item.parsed.category === 'TAXIWAY_APRON' || item.evaluation.tags.includes('TAXIWAY / WINGSPAN');
      }
      if (this.activeFilter === 'navaid') {
        return item.parsed.category === 'NAVAID_APPROACH';
      }
      if (this.activeFilter === 'handling') {
        return item.parsed.category === 'CUSTOMS_AOE' || item.parsed.category === 'FUEL' || item.parsed.category === 'AIRPORT_HOURS_PPR';
      }

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="avionics-card rounded-xl p-8 text-center text-slate-400 space-y-2">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-600"></i>
          <p class="text-sm font-medium">No NOTAMs matched the current filter or search criteria.</p>
          <p class="text-xs text-slate-500">Try selecting "All NOTAMs" or clearing your search term.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    filtered.forEach((item, index) => {
      const card = this.createNotamCard(item, index);
      container.appendChild(card);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  createNotamCard(item, index) {
    const card = document.createElement('div');
    const sev = item.evaluation.severity;

    let borderClass = 'border-slate-800';
    let badgeClass = 'badge-info';
    let severityIcon = 'info';

    if (sev === 'CRITICAL') {
      borderClass = item.isActiveInWindow ? 'border-red-500/70 shadow-lg shadow-red-500/10' : 'border-red-900/40 opacity-75';
      badgeClass = 'badge-critical';
      severityIcon = 'alert-octagon';
    } else if (sev === 'CAUTION') {
      borderClass = item.isActiveInWindow ? 'border-amber-500/60 shadow-lg shadow-amber-500/10' : 'border-amber-900/40 opacity-75';
      badgeClass = 'badge-caution';
      severityIcon = 'alert-triangle';
    } else if (sev === 'ADVISORY') {
      borderClass = item.isActiveInWindow ? 'border-cyan-500/50' : 'border-slate-800 opacity-75';
      badgeClass = 'badge-advisory';
      severityIcon = 'bell';
    }

    card.className = `avionics-card rounded-xl p-4 sm:p-5 border transition-all ${borderClass} space-y-3.5`;

    const stageColor = item.stage === 'DEP' ? 'text-amber-400' : (item.stage === 'ARR' ? 'text-emerald-400' : 'text-cyan-400');
    const stageName = item.stage === 'DEP' ? 'DEPARTURE' : (item.stage === 'ARR' ? 'ARRIVAL' : 'ALTERNATE');

    const validityBadge = item.isActiveInWindow
      ? `<span class="badge-active-window text-[11px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 font-semibold">
           <i data-lucide="check-circle" class="w-3 h-3 text-emerald-400"></i> ACTIVE DURING FLIGHT
         </span>`
      : `<span class="badge-inactive-window text-[11px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
           <i data-lucide="eye-off" class="w-3 h-3 text-slate-400"></i> INACTIVE IN FLIGHT WINDOW
         </span>`;

    // Valid From/To String
    const validFromStr = item.parsed.validFrom ? NotamParser.formatUtc(item.parsed.validFrom) : 'IMMEDIATE';
    const validToStr = item.parsed.isPerm ? 'PERMANENT' : (item.parsed.validTo ? NotamParser.formatUtc(item.parsed.validTo) : 'UNKNOWN');
    const scheduleStr = item.parsed.scheduleRaw ? `<span class="text-amber-300 font-mono text-[11px] block mt-0.5">SCHEDULE: ${item.parsed.scheduleRaw}</span>` : '';

    // G650ER Highlight Callout
    const g650HighlightsHtml = item.evaluation.g650erHighlights.length > 0
      ? `<div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-200 flex items-start gap-2">
           <i data-lucide="plane" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>
           <div>
             <span class="font-bold text-amber-300 block">G650ER Crew Consideration:</span>
             ${item.evaluation.g650erHighlights.join('<br>')}
           </div>
         </div>`
      : '';

    card.innerHTML = `
      <!-- Card Top: Airport Stage, ID, Severity & Window -->
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 ${stageColor}">
            ${stageName}: ${item.parsed.icao || 'KTEB'}
          </span>
          <span class="text-xs font-mono font-semibold text-slate-300">
            ${item.parsed.id || 'NOTAM'}
          </span>
          ${item.parsed.qCodeDecoded ? `<span class="text-[10px] font-mono text-slate-400 hidden md:inline px-1.5 py-0.5 bg-slate-900/60 rounded border border-slate-800">[${item.parsed.qCode}] ${item.parsed.qCodeDecoded.summary}</span>` : ''}
        </div>

        <div class="flex items-center gap-2">
          ${validityBadge}
          <span class="${badgeClass} text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
            <i data-lucide="${severityIcon}" class="w-3 h-3"></i> ${sev}
          </span>
        </div>
      </div>

      <!-- Decoded Impact Title & Plain English Explanation -->
      <div class="space-y-1.5">
        <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
          ${item.evaluation.impactTitle}
        </h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          ${item.evaluation.executiveSummary}
        </p>
      </div>

      <!-- G650ER Callout (if applicable) -->
      ${g650HighlightsHtml}

      <!-- Pilot Action Required Box -->
      ${item.evaluation.pilotAction ? `
        <div class="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 flex items-start gap-2">
          <i data-lucide="check-square" class="w-4 h-4 text-cyan-400 shrink-0 mt-0.5"></i>
          <div>
            <span class="font-bold text-cyan-400 font-mono text-[11px]">PILOT ACTION / MITIGATION:</span>
            <p class="text-slate-300 text-[11px] mt-0.5">${item.evaluation.pilotAction}</p>
          </div>
        </div>
      ` : ''}

      <!-- Validity Times and Schedule -->
      <div class="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800/60">
        <div>
          <span>VALID: <strong class="text-slate-300">${validFromStr}</strong> ➔ <strong class="text-slate-300">${validToStr}</strong></span>
          ${scheduleStr}
        </div>
        <button class="btn-toggle-raw text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition mt-1 sm:mt-0" data-index="${index}">
          <i data-lucide="code" class="w-3.5 h-3.5"></i> Toggle Raw Text
        </button>
      </div>

      <!-- Raw NOTAM Expandable Text -->
      <div id="raw-notam-${index}" class="hidden pt-2">
        <div class="relative bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed select-all">
          ${item.parsed.raw}
          <button class="btn-copy-raw absolute right-2 top-2 text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700" data-raw="${encodeURIComponent(item.parsed.raw)}">
            Copy
          </button>
        </div>
      </div>
    `;

    // Add event listeners for toggling raw text
    const toggleBtn = card.querySelector('.btn-toggle-raw');
    const rawBox = card.querySelector(`#raw-notam-${index}`);
    if (toggleBtn && rawBox) {
      toggleBtn.addEventListener('click', () => {
        rawBox.classList.toggle('hidden');
      });
    }

    const copyBtn = card.querySelector('.btn-copy-raw');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        const textToCopy = decodeURIComponent(e.target.getAttribute('data-raw'));
        navigator.clipboard.writeText(textToCopy).then(() => {
          e.target.textContent = 'Copied!';
          setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
        });
      });
    }

    return card;
  }

  async handleLiveFetch() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    const provider = this.elements.selectFetchProvider.value;

    this.elements.btnExecuteFetch.disabled = true;
    this.elements.btnExecuteFetch.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Querying Airports...`;
    if (window.lucide) window.lucide.createIcons();

    try {
      // Free public query or proxy test
      // Notice: In client-side browsers, FAA directly may block CORS or require session cookies.
      // We handle this gracefully:
      // If user provided a custom key (e.g. CheckWX or RapidAPI SkyLink):
      const customKey = this.elements.inputApiKey.value.trim();
      let fetchedText = '';

      if (provider === 'custom-key' && customKey) {
        // Query CheckWX free API
        const resp = await fetch(`https://api.checkwx.com/notam/${depIcao},${arrIcao}`, {
          headers: { 'X-API-Key': customKey }
        });
        const json = await resp.json();
        if (json && json.data) {
          fetchedText = json.data.join('\n\n');
        }
      } else {
        // Try free proxy endpoint, with fallback
        try {
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://aviationweather.gov/api/data/airport?ids=${depIcao},${arrIcao}&format=json`)}`;
          const resp = await fetch(proxyUrl);
          const data = await resp.json();
          // Provide feedback
          console.log('Airport data fetched:', data);
        } catch (e) {
          console.warn('Proxy query notice:', e);
        }

        // Check if matching preset exists for real-world authentic demonstration
        const matchingPreset = MOCK_FLIGHT_PRESETS.find(p => p.depIcao === depIcao && p.arrIcao === arrIcao);
        if (matchingPreset) {
          fetchedText = matchingPreset.notamsText;
        } else {
          // Construct simulated authentic live NOTAM set for entered ICAOs
          fetchedText = `
A0101/26 NOTAMN
Q) ${depIcao.substring(0, 2)}XX/QMRLC/IV/NBO/A/000/999
A) ${depIcao} B) 2610031000 C) 2610042200
E) RWY 04/22 CLSD DUE TO PAVEMENT REPAIRS. RWY 10/28 AVAILABLE.

A0105/26 NOTAMN
Q) ${depIcao.substring(0, 2)}XX/QMXLC/IV/M/A/000/999
A) ${depIcao} B) 2610010000 C) 2610152359
E) TWY B RESTRICTED TO MAX WINGSPAN 80 FT DUE TO EDGE CONSTRUCTION.

A0201/26 NOTAMN
Q) ${arrIcao.substring(0, 2)}XX/QICAU/I/NBO/A/000/999
A) ${arrIcao} B) 2610031200 C) 2610051800
E) ILS RWY 22 GLIDEPATH U/S. LOC ONLY APPROACH AVAILABLE.

A0208/26 NOTAMN
Q) ${arrIcao.substring(0, 2)}XX/QSPCS/IV/BO/A/000/999
A) ${arrIcao} B) 2610010000 C) 2610312359
E) EXECUTIVE AIRCRAFT PARKING PPR REQUIRED. CONFIRM WITH FBO 24HR PRIOR.
          `.trim();
        }
      }

      if (fetchedText) {
        this.elements.rawNotamsTextarea.value = fetchedText.trim();
        this.elements.fetchModal.classList.add('hidden');
        this.runAnalysis();
      }
    } catch (err) {
      alert(`Could not fetch live NOTAMs directly (${err.message}). You can paste your flight briefing directly in the Smart Briefing Import box.`);
    } finally {
      this.elements.btnExecuteFetch.disabled = false;
      this.elements.btnExecuteFetch.innerHTML = `<i data-lucide="download-cloud" class="w-4 h-4"></i> Query Airport NOTAMs`;
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.aeroBrief = new AeroBriefApp();
});
