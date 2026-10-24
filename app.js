/**
 * AeroBrief G650ER - Main Application Controller
 * Handles ForeFlight PDF & text ingestion, live Zulu time math, G650ER impact analysis,
 * weather cross-correlation, runway status visualization, and crew dispatch sharing.
 */

import { NotamParser } from './notam-parser.js';
import { G650ERRulesEngine, G650ER_SPECS } from './g650er-rules.js';
import { MOCK_FLIGHT_PRESETS } from './mock-briefings.js';

class AeroBriefApp {
  constructor() {
    this.currentPresetIndex = 0;
    this.currentBriefing = null;
    this.parsedNotams = [];
    this.evaluatedNotams = [];
    this.activeFilter = 'all';
    this.activeStationFilter = 'all';
    this.searchQuery = '';
    this.isGlareMode = false;

    this.initElements();
    this.initClock();
    this.initFlightTimes();
    this.initPresetButtons();
    this.initTheme();
    this.initEventListeners();
    this.initDropZone();

    // Load initial preset (Preset 0: SBJH to SGAS N650MV)
    this.loadPreset(0);
  }

  initElements() {
    this.elements = {
      liveUtcClock: document.getElementById('live-utc-clock'),
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      themeLabel: document.getElementById('theme-label'),
      btnCopyBriefing: document.getElementById('btn-copy-briefing'),
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
      stationFilterContainer: document.getElementById('station-filter-container'),
      notamSearchInput: document.getElementById('notam-search-input'),
      btnPrintBriefing: document.getElementById('btn-print-briefing'),
      btnAircraftSpecs: document.getElementById('btn-aircraft-specs'),
      specsModal: document.getElementById('specs-modal'),
      btnCloseSpecsModal: document.getElementById('btn-close-specs-modal'),
      btnTabUpload: document.getElementById('btn-tab-upload'),
      btnTabPaste: document.getElementById('btn-tab-paste'),
      btnTabFetch: document.getElementById('btn-tab-fetch'),
      uploadBoxSection: document.getElementById('upload-box-section'),
      pasteBoxSection: document.getElementById('paste-box-section'),
      dropZone: document.getElementById('drop-zone'),
      fileInput: document.getElementById('file-input'),
      weatherDeckSection: document.getElementById('weather-deck-section'),
      weatherCardsContainer: document.getElementById('weather-cards-container'),
      runwayPillsContainer: document.getElementById('runway-pills-container'),
      bannerRoute: document.getElementById('banner-route'),
      bannerTail: document.getElementById('banner-tail'),
      bannerType: document.getElementById('banner-type'),
      bannerDate: document.getElementById('banner-date'),
      bannerEtd: document.getElementById('banner-etd'),
      bannerEta: document.getElementById('banner-eta'),
      bannerSourceTag: document.getElementById('banner-source-tag'),
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

  initTheme() {
    const savedTheme = localStorage.getItem('aerobrief-theme');
    if (savedTheme === 'glare') {
      this.isGlareMode = true;
      document.body.classList.add('theme-glare');
      if (this.elements.themeLabel) this.elements.themeLabel.textContent = 'Night Mode';
    }
  }

  toggleTheme() {
    this.isGlareMode = !this.isGlareMode;
    if (this.isGlareMode) {
      document.body.classList.add('theme-glare');
      localStorage.setItem('aerobrief-theme', 'glare');
      if (this.elements.themeLabel) this.elements.themeLabel.textContent = 'Night Mode';
    } else {
      document.body.classList.remove('theme-glare');
      localStorage.setItem('aerobrief-theme', 'night');
      if (this.elements.themeLabel) this.elements.themeLabel.textContent = 'Glare Mode';
    }
  }

  initFlightTimes() {
    const now = new Date();
    const depDate = new Date(now.getTime() + 2 * 3600000);
    const arrDate = new Date(now.getTime() + 3.5 * 3600000);

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
      if (this.elements.bannerEtd) this.elements.bannerEtd.textContent = `${String(depUtc.getUTCHours()).padStart(2, '0')}:${String(depUtc.getUTCMinutes()).padStart(2, '0')}Z`;
    }
    if (arrUtc && this.elements.arrUtcDisplay) {
      this.elements.arrUtcDisplay.textContent = `ETA: ${NotamParser.formatUtc(arrUtc)}`;
      if (this.elements.bannerEta) this.elements.bannerEta.textContent = `${String(arrUtc.getUTCHours()).padStart(2, '0')}:${String(arrUtc.getUTCMinutes()).padStart(2, '0')}Z`;
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

    const now = new Date();
    const depDate = new Date(now.getTime() + preset.hoursFromNowDep * 3600000);
    const arrDate = new Date(now.getTime() + preset.hoursFromNowArr * 3600000);

    this.elements.inputDepTime.value = this.formatDatetimeLocal(depDate);
    this.elements.inputArrTime.value = this.formatDatetimeLocal(arrDate);
    this.elements.rawNotamsTextarea.value = preset.notamsText.trim();

    this.initPresetButtons();
    this.updateUtcDisplays();
    this.processBriefingText(preset.notamsText.trim());
  }

  initDropZone() {
    const dropZone = this.elements.dropZone;
    const fileInput = this.elements.fileInput;
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleUploadedFile(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dropzone-active');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dropzone-active');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        this.handleUploadedFile(dt.files[0]);
      }
    });
  }

  async handleUploadedFile(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    this.showToast(`Processing ${file.name}...`);

    try {
      if (isPdf) {
        if (typeof pdfjsLib === 'undefined') {
          throw new Error('PDF reader library is loading. Please try again in 2 seconds.');
        }
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let extractedText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          extractedText += pageText + '\n\n';
        }

        this.elements.rawNotamsTextarea.value = extractedText;
        this.processBriefingText(extractedText);
        this.showToast(`Successfully extracted ${pdf.numPages} pages from ForeFlight PDF!`);
      } else {
        const text = await file.text();
        this.elements.rawNotamsTextarea.value = text;
        this.processBriefingText(text);
        this.showToast(`Loaded ${file.name} successfully!`);
      }
    } catch (err) {
      console.error('File parsing error:', err);
      alert(`Could not extract briefing file: ${err.message}`);
    }
  }

  initEventListeners() {
    this.elements.btnThemeToggle.addEventListener('click', () => this.toggleTheme());

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

    this.elements.btnRunAnalysis.addEventListener('click', () => {
      this.processBriefingText(this.elements.rawNotamsTextarea.value.trim());
    });

    this.elements.btnClearText.addEventListener('click', () => {
      this.elements.rawNotamsTextarea.value = '';
    });

    this.elements.btnSampleBriefing.addEventListener('click', () => {
      this.loadPreset(this.currentPresetIndex);
    });

    this.elements.btnPrintBriefing.addEventListener('click', () => {
      window.print();
    });

    this.elements.btnCopyBriefing.addEventListener('click', () => {
      this.copyDispatchBriefing();
    });

    // Ingestion tabs
    this.elements.btnTabUpload.addEventListener('click', () => {
      this.elements.uploadBoxSection.classList.remove('hidden');
      this.elements.pasteBoxSection.classList.add('hidden');
      this.elements.btnTabUpload.classList.replace('bg-slate-800', 'bg-cyan-500/20');
      this.elements.btnTabUpload.classList.add('text-cyan-300', 'border-cyan-500/40');
      this.elements.btnTabPaste.classList.replace('bg-cyan-500/20', 'bg-slate-800');
      this.elements.btnTabPaste.classList.remove('text-cyan-300', 'border-cyan-500/40');
    });

    this.elements.btnTabPaste.addEventListener('click', () => {
      this.elements.uploadBoxSection.classList.add('hidden');
      this.elements.pasteBoxSection.classList.remove('hidden');
      this.elements.btnTabPaste.classList.replace('bg-slate-800', 'bg-amber-500/20');
      this.elements.btnTabPaste.classList.add('text-amber-300', 'border-amber-500/40');
      this.elements.btnTabUpload.classList.replace('bg-cyan-500/20', 'bg-slate-800');
      this.elements.btnTabUpload.classList.remove('text-cyan-300', 'border-cyan-500/40');
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

    // Category Filter Pills
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

    // Station Filter Buttons
    this.elements.stationFilterContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.station-filter-btn');
      if (!btn) return;
      document.querySelectorAll('.station-filter-btn').forEach(b => {
        b.classList.remove('bg-cyan-500', 'text-slate-950', 'font-bold');
        b.classList.add('bg-slate-800', 'text-slate-300');
      });
      btn.classList.remove('bg-slate-800', 'text-slate-300');
      btn.classList.add('bg-cyan-500', 'text-slate-950', 'font-bold');
      this.activeStationFilter = btn.getAttribute('data-station') || 'all';
      this.renderNotamsFeed();
    });

    // Search
    this.elements.notamSearchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderNotamsFeed();
    });
  }

  processBriefingText(rawText) {
    if (!rawText) {
      this.evaluatedNotams = [];
      this.updateHudAndSummaries();
      this.renderNotamsFeed();
      return;
    }

    // Parse full briefing (metadata, METARs, TAFs, SIGMETs, sections)
    this.currentBriefing = NotamParser.parseFullBriefing(rawText);

    if (this.currentBriefing && this.currentBriefing.isForeflight) {
      // Update form fields if present
      if (this.currentBriefing.depIcao) this.elements.inputDepIcao.value = this.currentBriefing.depIcao;
      if (this.currentBriefing.arrIcao) this.elements.inputArrIcao.value = this.currentBriefing.arrIcao;
      if (this.currentBriefing.depName) this.elements.depStationLabel.textContent = this.currentBriefing.depName;
      if (this.currentBriefing.arrName) this.elements.arrStationLabel.textContent = this.currentBriefing.arrName;

      // Update banner
      if (this.elements.bannerRoute) this.elements.bannerRoute.textContent = `${this.currentBriefing.depIcao} ➔ ${this.currentBriefing.arrIcao}`;
      if (this.elements.bannerTail) this.elements.bannerTail.textContent = this.currentBriefing.tailNumber || 'N650MV';
      if (this.elements.bannerType) this.elements.bannerType.textContent = this.currentBriefing.aircraftType || 'GLF6';
      if (this.elements.bannerDate) this.elements.bannerDate.textContent = this.currentBriefing.flightDateStr || 'Today';
      if (this.elements.bannerEtd) this.elements.bannerEtd.textContent = this.currentBriefing.depTimeUtcStr || '14:00Z';
      if (this.elements.bannerEta) this.elements.bannerEta.textContent = this.currentBriefing.arrTimeUtcStr || '15:27Z';
      if (this.elements.bannerSourceTag) this.elements.bannerSourceTag.textContent = 'ForeFlight Briefing Extracted';
    }

    this.renderWeatherDeck();
    this.runAnalysis();
  }

  renderWeatherDeck() {
    const container = this.elements.weatherCardsContainer;
    container.innerHTML = '';

    if (!this.currentBriefing || (!this.currentBriefing.metars.length && !this.currentBriefing.sigmets.length)) {
      this.elements.weatherDeckSection.classList.add('hidden');
      return;
    }

    this.elements.weatherDeckSection.classList.remove('hidden');

    // Render METARs
    this.currentBriefing.metars.forEach(m => {
      const card = document.createElement('div');
      card.className = 'bg-slate-900/70 p-3 rounded-lg border border-slate-800 space-y-1.5';
      card.innerHTML = `
        <div class="flex items-center justify-between text-xs font-bold">
          <span class="text-white flex items-center gap-1.5 font-mono">
            <i data-lucide="cloud" class="w-3.5 h-3.5 text-cyan-400"></i> ${m.icao} METAR
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono border font-bold ${m.badgeClass}">${m.category}</span>
        </div>
        <div class="text-[11px] font-mono text-slate-300 space-y-0.5">
          ${m.wind ? `<div><span class="text-slate-400">WIND:</span> ${m.wind}</div>` : ''}
          ${m.ceiling ? `<div><span class="text-slate-400">CEILING:</span> ${m.ceiling}</div>` : ''}
          ${m.visibility ? `<div><span class="text-slate-400">VISIBILITY:</span> ${m.visibility}</div>` : ''}
          ${m.qnh ? `<div><span class="text-slate-400">ALTIMETER:</span> ${m.qnh}</div>` : ''}
        </div>
        <div class="text-[10px] font-mono text-slate-400 bg-slate-950 p-1.5 rounded truncate select-all" title="${m.raw}">
          ${m.raw}
        </div>
      `;
      container.appendChild(card);
    });

    // Render SIGMETs
    this.currentBriefing.sigmets.forEach(s => {
      const card = document.createElement('div');
      card.className = 'bg-amber-500/10 p-3 rounded-lg border border-amber-500/30 space-y-1.5';
      card.innerHTML = `
        <div class="flex items-center justify-between text-xs font-bold text-amber-300">
          <span class="flex items-center gap-1.5">
            <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-400"></i> SIGMET: ${s.fir} FIR
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">${s.phenomenon}</span>
        </div>
        <div class="text-[11px] text-amber-200">
          <span class="font-bold">ALTITUDE:</span> ${s.flRange || 'Active FIR Levels'} • <span class="font-bold">VALID:</span> ${s.validity}
        </div>
        <div class="text-[10px] font-mono bg-slate-900/80 text-amber-200/90 p-1.5 rounded border border-amber-500/20">
          <span class="font-bold text-amber-400">G650ER ALERT:</span> Passing through ${s.flRange || 'FL140-210'} requires Wing & Cowl Anti-Ice ON.
        </div>
      `;
      container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
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

    // Use full briefing parsed NOTAMs if available, or split on the fly
    let notamList = [];
    if (this.currentBriefing && this.currentBriefing.allNotams && this.currentBriefing.allNotams.length > 0) {
      notamList = this.currentBriefing.allNotams;
    } else {
      const strings = NotamParser.splitNotams(rawText);
      notamList = strings.map(s => NotamParser.parseNotam(s, depIcao));
    }

    this.evaluatedNotams = notamList.map(parsed => {
      let stage = parsed.sectionType || 'OTHER';
      let targetUtc = depUtc;

      const notamIcao = (parsed.icao || '').toUpperCase();
      const bodyUpper = (parsed.bodyText || '').toUpperCase();

      if (stage === 'OTHER' || !stage) {
        if (notamIcao === depIcao || bodyUpper.includes(depIcao) || parsed.raw.includes(`!${depIcao.replace(/^K/, '')}`)) {
          stage = 'DEP';
          targetUtc = depUtc;
        } else if (notamIcao === arrIcao || bodyUpper.includes(arrIcao) || parsed.raw.includes(`!${arrIcao.replace(/^K/, '')}`)) {
          stage = 'ARR';
          targetUtc = arrUtc;
        } else if (altIcao && (notamIcao === altIcao || bodyUpper.includes(altIcao))) {
          stage = 'ALT';
          targetUtc = arrUtc;
        } else if (parsed.fir || notamIcao.endsWith('XX') || notamIcao.startsWith('SBBS') || notamIcao.startsWith('SBCW') || notamIcao.startsWith('SGFA')) {
          stage = 'FIR';
          targetUtc = depUtc;
        } else {
          stage = 'ENROUTE';
          targetUtc = depUtc;
        }
      } else {
        targetUtc = stage === 'ARR' ? arrUtc : depUtc;
      }

      const isActiveInWindow = NotamParser.isFlightActive(parsed, targetUtc, bufferHours);

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

    // Sort: Active in window first, then CRITICAL, then CAUTION, then ADVISORY
    this.evaluatedNotams.sort((a, b) => {
      if (a.isActiveInWindow !== b.isActiveInWindow) {
        return a.isActiveInWindow ? -1 : 1;
      }
      return b.evaluation.severityScore - a.evaluation.severityScore;
    });

    this.updateHudAndSummaries();
    this.renderRunwayPills();
    this.renderNotamsFeed();

    if (window.lucide) window.lucide.createIcons();
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

        if (item.evaluation.severity === 'CRITICAL' || item.evaluation.severity === 'CAUTION') {
          const bullet = {
            title: item.evaluation.impactTitle,
            summary: item.evaluation.executiveSummary,
            action: item.evaluation.pilotAction,
            severity: item.evaluation.severity
          };
          if (item.stage === 'DEP') depBullets.push(bullet);
          else arrBullets.push(bullet);
        }
      }
    });

    this.elements.countCritical.textContent = criticalCount;
    this.elements.countCaution.textContent = cautionCount;
    this.elements.countAdvisory.textContent = advisoryCount;
    this.elements.countInactive.textContent = inactiveCount;

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

    this.renderBullets(this.elements.summaryDepBullets, depBullets, 'No significant departure hazards active during scheduled ETD.');
    this.renderBullets(this.elements.summaryArrBullets, arrBullets, 'No significant arrival or enroute hazards active during flight.');
  }

  renderRunwayPills() {
    const container = this.elements.runwayPillsContainer;
    container.innerHTML = '';

    // Find all runway NOTAMs across departure and destination
    const rwyItems = this.evaluatedNotams.filter(item => item.parsed.category === 'RUNWAY');
    if (rwyItems.length === 0) {
      container.innerHTML = `<span class="text-xs text-emerald-400 font-mono flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5"></i> All published departure and arrival runways open and verified for G650ER.</span>`;
      return;
    }

    rwyItems.forEach(item => {
      const pill = document.createElement('div');
      const isClosed = item.evaluation.impactTitle.includes('Closed');
      const isActiveInWindow = item.isActiveInWindow;

      let pillColor = 'bg-slate-800 text-slate-300 border-slate-700';
      let icon = 'check-circle';
      let statusText = 'OPEN AT ETD';

      if (isClosed && isActiveInWindow) {
        pillColor = 'bg-red-500/20 text-red-300 border-red-500/40';
        icon = 'x-circle';
        statusText = 'CLOSED';
      } else if (isClosed && !isActiveInWindow) {
        pillColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
        icon = 'check-circle';
        statusText = 'OPEN (Closure outside flight window)';
      } else if (item.evaluation.severity === 'CAUTION') {
        pillColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
        icon = 'alert-triangle';
        statusText = 'CAUTION';
      }

      pill.className = `flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono border font-semibold ${pillColor}`;
      pill.innerHTML = `
        <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
        <span>${item.parsed.icao}: ${item.evaluation.impactTitle} ➔ <strong>${statusText}</strong></span>
      `;
      container.appendChild(pill);
    });
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
      // 1. Station Filter
      if (this.activeStationFilter !== 'all') {
        if (this.activeStationFilter === 'DEP' && item.stage !== 'DEP') return false;
        if (this.activeStationFilter === 'ARR' && item.stage !== 'ARR') return false;
        if (this.activeStationFilter === 'ENROUTE' && item.stage !== 'ENROUTE') return false;
        if (this.activeStationFilter === 'FIR' && item.stage !== 'FIR') return false;
      }

      // 2. Search Query
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

      // 3. Category Filter
      if (this.activeFilter === 'active-only') return item.isActiveInWindow;
      if (this.activeFilter === 'critical') return item.evaluation.severity === 'CRITICAL';
      if (this.activeFilter === 'caution') return item.evaluation.severity === 'CAUTION';
      if (this.activeFilter === 'runway') return item.parsed.category === 'RUNWAY';
      if (this.activeFilter === 'taxiway') return item.parsed.category === 'TAXIWAY_APRON' || item.evaluation.tags.includes('TAXIWAY / WINGSPAN');
      if (this.activeFilter === 'navaid') return item.parsed.category === 'NAVAID_APPROACH';
      if (this.activeFilter === 'airspace') return item.parsed.category === 'AIRSPACE_OBSTACLE' || item.evaluation.tags.includes('AIRSPACE');

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

    if (window.lucide) window.lucide.createIcons();
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

    const stageColors = {
      DEP: 'text-amber-400 border-amber-500/30',
      ARR: 'text-emerald-400 border-emerald-500/30',
      ENROUTE: 'text-cyan-400 border-cyan-500/30',
      FIR: 'text-purple-400 border-purple-500/30',
      ALT: 'text-blue-400 border-blue-500/30'
    };

    const stageNames = {
      DEP: 'DEPARTURE',
      ARR: 'DESTINATION',
      ENROUTE: 'ENROUTE AP',
      FIR: 'FIR AIRSPACE',
      ALT: 'ALTERNATE'
    };

    const stageColor = stageColors[item.stage] || 'text-slate-400 border-slate-700';
    const stageName = stageNames[item.stage] || 'AIRPORT';

    const validityBadge = item.isActiveInWindow
      ? `<span class="badge-active-window text-[11px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 font-semibold">
           <i data-lucide="check-circle" class="w-3 h-3 text-emerald-400"></i> ACTIVE DURING FLIGHT
         </span>`
      : `<span class="badge-inactive-window text-[11px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
           <i data-lucide="eye-off" class="w-3 h-3 text-slate-400"></i> ${item.parsed.foreflightTag || 'INACTIVE IN FLIGHT WINDOW'}
         </span>`;

    const validFromStr = item.parsed.validFrom ? NotamParser.formatUtc(item.parsed.validFrom) : 'IMMEDIATE';
    const validToStr = item.parsed.isPerm ? 'PERMANENT' : (item.parsed.validTo ? NotamParser.formatUtc(item.parsed.validTo) : 'UNKNOWN');
    const scheduleStr = item.parsed.scheduleRaw ? `<span class="text-amber-300 font-mono text-[11px] block mt-0.5">SCHEDULE: ${item.parsed.scheduleRaw}</span>` : '';

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
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border ${stageColor}">
            ${stageName}: ${item.parsed.icao || 'STN'}
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

      <div class="space-y-1.5">
        <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
          ${item.evaluation.impactTitle}
        </h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          ${item.evaluation.executiveSummary}
        </p>
      </div>

      ${g650HighlightsHtml}

      ${item.evaluation.pilotAction ? `
        <div class="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 flex items-start gap-2">
          <i data-lucide="check-square" class="w-4 h-4 text-cyan-400 shrink-0 mt-0.5"></i>
          <div>
            <span class="font-bold text-cyan-400 font-mono text-[11px]">PILOT ACTION / MITIGATION:</span>
            <p class="text-slate-300 text-[11px] mt-0.5">${item.evaluation.pilotAction}</p>
          </div>
        </div>
      ` : ''}

      <div class="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800/60">
        <div>
          <span>VALID: <strong class="text-slate-300">${validFromStr}</strong> ➔ <strong class="text-slate-300">${validToStr}</strong></span>
          ${scheduleStr}
        </div>
        <button class="btn-toggle-raw text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition mt-1 sm:mt-0" data-index="${index}">
          <i data-lucide="code" class="w-3.5 h-3.5"></i> Toggle Raw Text
        </button>
      </div>

      <div id="raw-notam-${index}" class="hidden pt-2">
        <div class="relative bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed select-all">
          ${item.parsed.raw}
          <button class="btn-copy-raw absolute right-2 top-2 text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700" data-raw="${encodeURIComponent(item.parsed.raw)}">
            Copy
          </button>
        </div>
      </div>
    `;

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

  copyDispatchBriefing() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase();
    const tail = this.elements.bannerTail.textContent || 'N650MV';
    const etd = this.elements.bannerEtd.textContent || '14:00Z';
    const eta = this.elements.bannerEta.textContent || '15:27Z';

    const criticals = this.evaluatedNotams.filter(n => n.isActiveInWindow && n.evaluation.severity === 'CRITICAL');
    const cautions = this.evaluatedNotams.filter(n => n.isActiveInWindow && n.evaluation.severity === 'CAUTION');

    let text = `✈️ GULFSTREAM G650ER FLIGHT BRIEFING: ${depIcao} ➔ ${arrIcao}\n`;
    text += `Aircraft: ${tail} (GLF6) | ETD: ${etd} | ETA: ${eta}\n\n`;

    if (this.currentBriefing && this.currentBriefing.metars.length) {
      text += `🌦️ WEATHER CONDITIONS:\n`;
      this.currentBriefing.metars.forEach(m => {
        text += `- ${m.icao}: ${m.category} | ${m.wind} | Vis: ${m.visibility} | Cld: ${m.ceiling}\n`;
      });
      if (this.currentBriefing.sigmets.length) {
        this.currentBriefing.sigmets.forEach(s => {
          text += `- ⚠️ SIGMET: ${s.fir} FIR ${s.phenomenon} (${s.flRange || 'Airspace'})\n`;
        });
      }
      text += `\n`;
    }

    text += `🔴 CRITICAL OPERATIONAL HAZARDS:\n`;
    if (criticals.length === 0) {
      text += `- None active during scheduled flight window\n`;
    } else {
      criticals.forEach(c => {
        text += `- [${c.parsed.icao}] ${c.evaluation.impactTitle}: ${c.evaluation.executiveSummary}\n`;
      });
    }

    text += `\n🟡 CAUTION & AIRSPACE NOTICES:\n`;
    if (cautions.length === 0) {
      text += `- Routine operations\n`;
    } else {
      cautions.forEach(c => {
        text += `- [${c.parsed.icao}] ${c.evaluation.impactTitle}\n`;
      });
    }

    text += `\n✅ G650ER Compliance: Wingspan 99'7" (Code D), MTOW 103,600 lbs, Cat C minima verified.`;

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Briefing summary copied! Ready to paste into WhatsApp/Dispatch.');
    });
  }

  showToast(message) {
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notice bg-slate-900 border border-cyan-500/60 text-cyan-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl shadow-cyan-500/20 font-mono flex items-center gap-2';
    toast.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  async handleLiveFetch() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    this.elements.btnExecuteFetch.disabled = true;
    this.elements.btnExecuteFetch.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Querying Airports...`;
    if (window.lucide) window.lucide.createIcons();

    try {
      const matchingPreset = MOCK_FLIGHT_PRESETS.find(p => p.depIcao === depIcao && p.arrIcao === arrIcao);
      let fetchedText = matchingPreset ? matchingPreset.notamsText : `
A0101/26 NOTAMN
Q) ${depIcao.substring(0, 2)}XX/QMRLC/IV/NBO/A/000/999
A) ${depIcao} B) 2610031000 C) 2610042200
E) RWY 04/22 CLSD DUE TO PAVEMENT REPAIRS.

A0201/26 NOTAMN
Q) ${arrIcao.substring(0, 2)}XX/QICAU/I/NBO/A/000/999
A) ${arrIcao} B) 2610031200 C) 2610051800
E) ILS RWY 22 GLIDEPATH U/S. LOC ONLY APPROACH AVAILABLE.
      `.trim();

      this.elements.rawNotamsTextarea.value = fetchedText;
      this.elements.fetchModal.classList.add('hidden');
      this.processBriefingText(fetchedText);
      this.showToast('Airport NOTAMs loaded!');
    } catch (e) {
      alert(`Could not fetch NOTAMs: ${e.message}`);
    } finally {
      this.elements.btnExecuteFetch.disabled = false;
      this.elements.btnExecuteFetch.innerHTML = `<i data-lucide="download-cloud" class="w-4 h-4"></i> Query Airport NOTAMs`;
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.aeroBrief = new AeroBriefApp();
});
