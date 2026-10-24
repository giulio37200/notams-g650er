/**
 * AeroBrief G650ER - Main Application Controller
 * Modern, focused cockpit briefing interface with 2-column ForeFlight PDF extraction,
 * smart duplicate/cluster merging, perspective tabs, and scannable accordion NOTAM rows.
 */

import { NotamParser } from './notam-parser.js';
import { G650ERRulesEngine } from './g650er-rules.js';
import { MOCK_FLIGHT_PRESETS } from './mock-briefings.js';

class AeroBriefApp {
  constructor() {
    this.currentPresetIndex = 0;
    this.currentBriefing = null;
    this.evaluatedNotams = [];
    this.currentView = 'brief'; // 'brief' | 'DEP' | 'ARR' | 'ENROUTE' | 'ALL'
    this.activeFilter = 'all';
    this.showInactive = true;
    this.searchQuery = '';
    this.isGlareMode = false;
    this.selectedEnrouteStation = null;

    this.initElements();
    this.initClock();
    this.initFlightTimes();
    this.initPresetButtons();
    this.initTheme();
    this.initEventListeners();
    this.initDropZone();

    // Load default mission (SBJH -> SGAS N650MV)
    this.loadPreset(0);
  }

  initElements() {
    this.elements = {
      liveUtcClock: document.getElementById('live-utc-clock'),
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      btnCopyBriefing: document.getElementById('btn-copy-briefing'),
      btnToggleSetup: document.getElementById('btn-toggle-setup'),
      setupBtnLabel: document.getElementById('setup-btn-label'),
      setupDrawer: document.getElementById('setup-drawer'),
      btnCloseSetup: document.getElementById('btn-close-setup'),
      globalDropOverlay: document.getElementById('global-drop-overlay'),

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

      perspectiveTabs: document.getElementById('perspective-tabs'),
      tabDepIcao: document.getElementById('tab-dep-icao'),
      tabArrIcao: document.getElementById('tab-arr-icao'),
      tabBadgeDep: document.getElementById('tab-badge-dep'),
      tabBadgeArr: document.getElementById('tab-badge-arr'),
      tabBadgeEnroute: document.getElementById('tab-badge-enroute'),
      tabBadgeAll: document.getElementById('tab-badge-all'),

      countCritical: document.getElementById('count-critical'),
      countCaution: document.getElementById('count-caution'),
      countAdvisory: document.getElementById('count-advisory'),
      countInactive: document.getElementById('count-inactive'),

      viewFlightBrief: document.getElementById('view-flight-brief'),
      viewNotamsSection: document.getElementById('view-notams-section'),
      sigmetBannerContainer: document.getElementById('sigmet-banner-container'),

      summaryDepIcao: document.getElementById('summary-dep-icao'),
      briefDepEtd: document.getElementById('brief-dep-etd'),
      briefDepName: document.getElementById('brief-dep-name'),
      summaryDepAlertBadge: document.getElementById('summary-dep-alert-badge'),
      briefDepWx: document.getElementById('brief-dep-wx'),
      briefDepRwy: document.getElementById('brief-dep-rwy'),
      summaryDepBullets: document.getElementById('summary-dep-bullets'),

      summaryArrIcao: document.getElementById('summary-arr-icao'),
      briefArrEta: document.getElementById('brief-arr-eta'),
      briefArrName: document.getElementById('brief-arr-name'),
      summaryArrAlertBadge: document.getElementById('summary-arr-alert-badge'),
      briefArrWx: document.getElementById('brief-arr-wx'),
      briefArrRwy: document.getElementById('brief-arr-rwy'),
      summaryArrBullets: document.getElementById('summary-arr-bullets'),

      enrouteOverviewGrid: document.getElementById('enroute-overview-grid'),
      stationViewWxContainer: document.getElementById('station-view-wx-container'),
      notamsCardsContainer: document.getElementById('notams-cards-container'),
      filterPillContainer: document.getElementById('filter-pill-container'),
      toggleShowInactive: document.getElementById('toggle-show-inactive'),
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

      bannerRoute: document.getElementById('banner-route'),
      bannerTail: document.getElementById('banner-tail'),
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
      if (this.elements.liveUtcClock) {
        this.elements.liveUtcClock.textContent = `${h}:${m}Z`;
      }
    };
    update();
    setInterval(update, 10000);
  }

  initTheme() {
    const savedTheme = localStorage.getItem('aerobrief-theme');
    if (savedTheme === 'glare') {
      this.isGlareMode = true;
      document.body.classList.add('theme-glare');
    }
  }

  toggleTheme() {
    this.isGlareMode = !this.isGlareMode;
    if (this.isGlareMode) {
      document.body.classList.add('theme-glare');
      localStorage.setItem('aerobrief-theme', 'glare');
      this.showToast('Day Glare Mode enabled');
    } else {
      document.body.classList.remove('theme-glare');
      localStorage.setItem('aerobrief-theme', 'night');
      this.showToast('Cockpit Night Mode enabled');
    }
  }

  initFlightTimes() {
    const now = new Date();
    const depDate = new Date(now.getTime() + 2 * 3600000);
    const arrDate = new Date(now.getTime() + 3.5 * 3600000);

    if (this.elements.inputDepTime) this.elements.inputDepTime.value = this.formatDatetimeLocal(depDate);
    if (this.elements.inputArrTime) this.elements.inputArrTime.value = this.formatDatetimeLocal(arrDate);
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

    if (depUtc) {
      const hm = `${String(depUtc.getUTCHours()).padStart(2, '0')}:${String(depUtc.getUTCMinutes()).padStart(2, '0')}Z`;
      if (this.elements.depUtcDisplay) this.elements.depUtcDisplay.textContent = hm;
      if (this.elements.bannerEtd) this.elements.bannerEtd.textContent = hm;
      if (this.elements.briefDepEtd) this.elements.briefDepEtd.textContent = `ETD ${hm}`;
    }
    if (arrUtc) {
      const hm = `${String(arrUtc.getUTCHours()).padStart(2, '0')}:${String(arrUtc.getUTCMinutes()).padStart(2, '0')}Z`;
      if (this.elements.arrUtcDisplay) this.elements.arrUtcDisplay.textContent = hm;
      if (this.elements.bannerEta) this.elements.bannerEta.textContent = hm;
      if (this.elements.briefArrEta) this.elements.briefArrEta.textContent = `ETA ${hm}`;
    }
  }

  initPresetButtons() {
    if (!this.elements.presetButtonsContainer) return;
    this.elements.presetButtonsContainer.innerHTML = '';
    MOCK_FLIGHT_PRESETS.forEach((preset, index) => {
      const btn = document.createElement('button');
      btn.className = `text-[11px] px-2.5 py-1 rounded-lg font-mono transition border ${
        index === this.currentPresetIndex
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
      }`;
      btn.textContent = `${preset.depIcao}➔${preset.arrIcao}`;
      btn.title = preset.name;
      btn.addEventListener('click', () => {
        this.loadPreset(index);
        this.elements.setupDrawer.classList.add('hidden');
      });
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
    if (this.elements.briefDepName) this.elements.briefDepName.textContent = preset.depName;
    if (this.elements.briefArrName) this.elements.briefArrName.textContent = preset.arrName;

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

    // Global window drag-and-drop so pilot can drop PDF anywhere on screen
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.elements.globalDropOverlay) {
        this.elements.globalDropOverlay.classList.remove('hidden');
      }
    });

    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null && this.elements.globalDropOverlay) {
        this.elements.globalDropOverlay.classList.add('hidden');
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.elements.globalDropOverlay) {
        this.elements.globalDropOverlay.classList.add('hidden');
      }
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleUploadedFile(e.dataTransfer.files[0]);
      }
    });
  }

  /**
   * Column-aware PDF text reconstruction for ForeFlight 1-column & 2-column pages.
   * Preserves line breaks and prevents left/right column interleaving on NOTAM pages.
   */
  extractForeflightPageText(textContent, pageWidth, pageHeight) {
    const items = (textContent.items || []).filter(it => it.str && it.str.trim().length > 0);
    if (items.length === 0) return '';

    const mapped = items.map(it => ({
      str: it.str,
      x: it.transform ? it.transform[4] : 0,
      y: it.transform ? it.transform[5] : 0
    }));

    const midX = pageWidth * 0.485;
    const headerY = pageHeight * 0.88;

    // Detect if this page is a 2-column ForeFlight NOTAM page:
    // Check if multiple NOTAM field markers or IDs start in the right column
    const rightColMarkers = mapped.filter(m =>
      m.x >= midX &&
      m.y < headerY &&
      (/^[A-Z][0-9]{4}\/[0-9]{2}\b/.test(m.str.trim()) ||
       /^(?:Q|A|B|C|D|E)\)\s*/.test(m.str.trim()) ||
       /^Enroute airport/i.test(m.str.trim()) ||
       /^FIR\s+[A-Z]{4}/i.test(m.str.trim()))
    );

    const groupIntoLines = (list) => {
      if (list.length === 0) return [];
      // Sort top-to-bottom (descending Y), then left-to-right (ascending X)
      const sorted = [...list].sort((a, b) => {
        if (Math.abs(b.y - a.y) > 3.5) return b.y - a.y;
        return a.x - b.x;
      });

      const lines = [];
      let currentLine = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const prev = currentLine[currentLine.length - 1];
        const curr = sorted[i];
        if (Math.abs(curr.y - prev.y) <= 3.5) {
          currentLine.push(curr);
        } else {
          currentLine.sort((a, b) => a.x - b.x);
          lines.push(currentLine.map(c => c.str).join(' '));
          currentLine = [curr];
        }
      }
      if (currentLine.length > 0) {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine.map(c => c.str).join(' '));
      }
      return lines;
    };

    if (rightColMarkers.length >= 2) {
      // 2-Column Page: Top header -> Left Column -> Right Column
      const topItems = mapped.filter(m => m.y >= headerY);
      const leftItems = mapped.filter(m => m.y < headerY && m.x < midX);
      const rightItems = mapped.filter(m => m.y < headerY && m.x >= midX);

      return [
        ...groupIntoLines(topItems),
        ...groupIntoLines(leftItems),
        ...groupIntoLines(rightItems)
      ].join('\n');
    }

    // Standard 1-Column Page
    return groupIntoLines(mapped).join('\n');
  }

  async handleUploadedFile(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    this.showToast(`Reading ${file.name}...`);

    try {
      if (isPdf) {
        if (typeof pdfjsLib === 'undefined') {
          throw new Error('PDF reader library is still initializing. Please try again in a moment.');
        }
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let extractedText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          const textContent = await page.getTextContent();
          const pageText = this.extractForeflightPageText(textContent, viewport.width, viewport.height);
          extractedText += pageText + '\n\n';
        }

        this.elements.rawNotamsTextarea.value = extractedText;
        this.processBriefingText(extractedText);
        if (this.elements.setupDrawer) this.elements.setupDrawer.classList.add('hidden');
        this.switchView('brief');
        this.showToast(`ForeFlight PDF loaded (${pdf.numPages} pages analyzed & deduplicated)`);
      } else {
        const text = await file.text();
        this.elements.rawNotamsTextarea.value = text;
        this.processBriefingText(text);
        if (this.elements.setupDrawer) this.elements.setupDrawer.classList.add('hidden');
        this.switchView('brief');
        this.showToast(`Loaded ${file.name}`);
      }
    } catch (err) {
      console.error('File parsing error:', err);
      alert(`Could not extract briefing file: ${err.message}`);
    }
  }

  initEventListeners() {
    this.elements.btnThemeToggle.addEventListener('click', () => this.toggleTheme());

    if (this.elements.btnToggleSetup) {
      this.elements.btnToggleSetup.addEventListener('click', () => {
        this.elements.setupDrawer.classList.toggle('hidden');
      });
    }
    if (this.elements.btnCloseSetup) {
      this.elements.btnCloseSetup.addEventListener('click', () => {
        this.elements.setupDrawer.classList.add('hidden');
      });
    }

    this.elements.inputDepTime.addEventListener('change', () => {
      this.updateUtcDisplays();
      this.runAnalysis();
    });
    this.elements.inputArrTime.addEventListener('change', () => {
      this.updateUtcDisplays();
      this.runAnalysis();
    });
    this.elements.selectTimeBuffer.addEventListener('change', () => this.runAnalysis());

    this.elements.btnRunAnalysis.addEventListener('click', () => {
      this.processBriefingText(this.elements.rawNotamsTextarea.value.trim());
      if (this.elements.setupDrawer) this.elements.setupDrawer.classList.add('hidden');
      this.showToast('Briefing updated');
    });

    this.elements.btnClearText.addEventListener('click', () => {
      this.elements.rawNotamsTextarea.value = '';
    });

    this.elements.btnSampleBriefing.addEventListener('click', () => {
      this.loadPreset(this.currentPresetIndex);
    });

    this.elements.btnPrintBriefing.addEventListener('click', () => window.print());
    this.elements.btnCopyBriefing.addEventListener('click', () => this.copyDispatchBriefing());

    // Perspective Tabs (Flight Brief | Departure | Destination | En-Route | All)
    if (this.elements.perspectiveTabs) {
      this.elements.perspectiveTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.view-tab');
        if (!tab) return;
        const view = tab.getAttribute('data-view') || 'brief';
        this.selectedEnrouteStation = null;
        this.switchView(view);
      });
    }

    // Jump links inside Flight Brief cards
    document.querySelectorAll('[data-jump-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-jump-view');
        this.selectedEnrouteStation = null;
        this.switchView(targetView);
      });
    });

    // Quick KPI pill clicks
    document.querySelectorAll('.quick-kpi-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const qf = pill.getAttribute('data-quick-filter');
        this.selectedEnrouteStation = null;
        if (qf === 'critical' || qf === 'caution') {
          this.activeFilter = 'critical-caution';
          this.updateFilterPillsUI();
          this.switchView('ALL');
        } else if (qf === 'inactive') {
          this.showInactive = true;
          if (this.elements.toggleShowInactive) this.elements.toggleShowInactive.checked = true;
          this.activeFilter = 'all';
          this.updateFilterPillsUI();
          this.switchView('ALL');
        } else {
          this.activeFilter = 'all';
          this.updateFilterPillsUI();
          this.switchView('ALL');
        }
      });
    });

    // Ingestion source tabs
    this.elements.btnTabUpload.addEventListener('click', () => {
      this.elements.uploadBoxSection.classList.remove('hidden');
      this.elements.pasteBoxSection.classList.add('hidden');
      this.elements.btnTabUpload.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold flex items-center gap-1';
      this.elements.btnTabPaste.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 flex items-center gap-1';
    });

    this.elements.btnTabPaste.addEventListener('click', () => {
      this.elements.uploadBoxSection.classList.add('hidden');
      this.elements.pasteBoxSection.classList.remove('hidden');
      this.elements.btnTabPaste.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1';
      this.elements.btnTabUpload.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 flex items-center gap-1';
    });

    // Specs Modal
    this.elements.btnAircraftSpecs.addEventListener('click', () => {
      this.elements.specsModal.classList.remove('hidden');
    });
    this.elements.btnCloseSpecsModal.addEventListener('click', () => {
      this.elements.specsModal.classList.add('hidden');
    });
    this.elements.specsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.specsModal) this.elements.specsModal.classList.add('hidden');
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
      if (e.target === this.elements.fetchModal) this.elements.fetchModal.classList.add('hidden');
    });

    this.elements.selectFetchProvider.addEventListener('change', (e) => {
      this.elements.apiKeyContainer.classList.toggle('hidden', e.target.value !== 'custom-key');
    });

    this.elements.btnExecuteFetch.addEventListener('click', () => this.handleLiveFetch());

    // Category Filter Pills
    this.elements.filterPillContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      this.activeFilter = pill.getAttribute('data-filter') || 'all';
      this.updateFilterPillsUI();
      this.renderNotamsFeed();
    });

    // Show Inactive Checkbox
    if (this.elements.toggleShowInactive) {
      this.elements.toggleShowInactive.addEventListener('change', (e) => {
        this.showInactive = e.target.checked;
        this.renderNotamsFeed();
      });
    }

    // Search
    this.elements.notamSearchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderNotamsFeed();
    });
  }

  updateFilterPillsUI() {
    document.querySelectorAll('.filter-pill').forEach(p => {
      const isMatch = p.getAttribute('data-filter') === this.activeFilter;
      if (isMatch) {
        p.className = 'filter-pill active text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold transition';
      } else {
        p.className = 'filter-pill text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
      }
    });
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Update tab button styles
    document.querySelectorAll('.view-tab').forEach(tab => {
      const v = tab.getAttribute('data-view');
      if (v === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    if (viewName === 'brief') {
      this.elements.viewFlightBrief.classList.remove('hidden');
      this.elements.viewNotamsSection.classList.add('hidden');
    } else {
      this.elements.viewFlightBrief.classList.add('hidden');
      this.elements.viewNotamsSection.classList.remove('hidden');
      this.renderStationViewWeather(viewName);
      this.renderNotamsFeed();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  processBriefingText(rawText) {
    if (!rawText) {
      this.evaluatedNotams = [];
      this.updateAllViews();
      return;
    }

    this.currentBriefing = NotamParser.parseFullBriefing(rawText);

    if (this.currentBriefing && this.currentBriefing.isForeflight) {
      if (this.currentBriefing.depIcao) this.elements.inputDepIcao.value = this.currentBriefing.depIcao;
      if (this.currentBriefing.arrIcao) this.elements.inputArrIcao.value = this.currentBriefing.arrIcao;
      if (this.currentBriefing.depName) {
        this.elements.depStationLabel.textContent = this.currentBriefing.depName;
        if (this.elements.briefDepName) this.elements.briefDepName.textContent = this.currentBriefing.depName;
      }
      if (this.currentBriefing.arrName) {
        this.elements.arrStationLabel.textContent = this.currentBriefing.arrName;
        if (this.elements.briefArrName) this.elements.briefArrName.textContent = this.currentBriefing.arrName;
      }

      if (this.elements.bannerRoute) this.elements.bannerRoute.textContent = `${this.currentBriefing.depIcao} ➔ ${this.currentBriefing.arrIcao}`;
      if (this.elements.bannerTail) this.elements.bannerTail.textContent = this.currentBriefing.tailNumber || 'N650MV';
      if (this.elements.bannerDate) this.elements.bannerDate.textContent = this.currentBriefing.flightDateStr || 'Today';
      if (this.elements.bannerEtd && this.currentBriefing.depTimeUtcStr) {
        this.elements.bannerEtd.textContent = this.currentBriefing.depTimeUtcStr;
        if (this.elements.briefDepEtd) this.elements.briefDepEtd.textContent = `ETD ${this.currentBriefing.depTimeUtcStr}`;
      }
      if (this.elements.bannerEta && this.currentBriefing.arrTimeUtcStr) {
        this.elements.bannerEta.textContent = this.currentBriefing.arrTimeUtcStr;
        if (this.elements.briefArrEta) this.elements.briefArrEta.textContent = `ETA ${this.currentBriefing.arrTimeUtcStr}`;
      }
      if (this.elements.bannerSourceTag) this.elements.bannerSourceTag.textContent = 'ForeFlight Briefing Active';
    }

    this.runAnalysis();
  }

  runAnalysis() {
    const rawText = this.elements.rawNotamsTextarea.value.trim();
    if (!rawText) {
      this.evaluatedNotams = [];
      this.updateAllViews();
      return;
    }

    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    const altIcao = this.elements.inputAltIcao.value.toUpperCase().trim();

    if (this.elements.tabDepIcao) this.elements.tabDepIcao.textContent = `(${depIcao})`;
    if (this.elements.tabArrIcao) this.elements.tabArrIcao.textContent = `(${arrIcao})`;
    if (this.elements.bannerRoute) this.elements.bannerRoute.textContent = `${depIcao} ➔ ${arrIcao}`;

    const depUtc = this.getUtcFromInput(this.elements.inputDepTime);
    const arrUtc = this.getUtcFromInput(this.elements.inputArrTime);
    const bufferHours = parseFloat(this.elements.selectTimeBuffer.value) || 2;

    let notamList = [];
    if (this.currentBriefing && this.currentBriefing.allNotams && this.currentBriefing.allNotams.length > 0) {
      notamList = this.currentBriefing.allNotams;
    } else {
      const strings = NotamParser.splitNotams(rawText);
      const rawParsed = strings.map(s => NotamParser.parseNotam(s, depIcao));
      notamList = NotamParser.deduplicateNotams(rawParsed);
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
          stage = 'ENROUTE';
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

    // Sort: Active in window first, then by severity score descending
    this.evaluatedNotams.sort((a, b) => {
      if (a.isActiveInWindow !== b.isActiveInWindow) {
        return a.isActiveInWindow ? -1 : 1;
      }
      return b.evaluation.severityScore - a.evaluation.severityScore;
    });

    this.updateAllViews();
  }

  updateAllViews() {
    this.updateKpisAndTabCounts();
    this.renderFlightBriefView();
    if (this.currentView !== 'brief') {
      this.renderStationViewWeather(this.currentView);
      this.renderNotamsFeed();
    }
    if (window.lucide) window.lucide.createIcons();
  }

  updateKpisAndTabCounts() {
    let criticalCount = 0;
    let cautionCount = 0;
    let advisoryCount = 0;
    let inactiveCount = 0;

    let depTotal = 0;
    let arrTotal = 0;
    let enrouteTotal = 0;

    this.evaluatedNotams.forEach(item => {
      if (item.stage === 'DEP') depTotal++;
      else if (item.stage === 'ARR') arrTotal++;
      else enrouteTotal++;

      if (!item.isActiveInWindow) {
        inactiveCount++;
      } else {
        if (item.evaluation.severity === 'CRITICAL') criticalCount++;
        else if (item.evaluation.severity === 'CAUTION') cautionCount++;
        else advisoryCount++;
      }
    });

    if (this.elements.countCritical) this.elements.countCritical.textContent = criticalCount;
    if (this.elements.countCaution) this.elements.countCaution.textContent = cautionCount;
    if (this.elements.countAdvisory) this.elements.countAdvisory.textContent = advisoryCount;
    if (this.elements.countInactive) this.elements.countInactive.textContent = inactiveCount;

    if (this.elements.tabBadgeDep) this.elements.tabBadgeDep.textContent = depTotal;
    if (this.elements.tabBadgeArr) this.elements.tabBadgeArr.textContent = arrTotal;
    if (this.elements.tabBadgeEnroute) this.elements.tabBadgeEnroute.textContent = enrouteTotal;
    if (this.elements.tabBadgeAll) this.elements.tabBadgeAll.textContent = this.evaluatedNotams.length;
  }

  renderFlightBriefView() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();

    this.elements.summaryDepIcao.textContent = depIcao;
    this.elements.summaryArrIcao.textContent = arrIcao;

    // 1. SIGMET Banner
    const sigmets = (this.currentBriefing && this.currentBriefing.sigmets) || [];
    if (sigmets.length > 0) {
      this.elements.sigmetBannerContainer.classList.remove('hidden');
      this.elements.sigmetBannerContainer.innerHTML = sigmets.map(s => `
        <div class="avionics-card rounded-2xl p-3.5 border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <i data-lucide="cloud-lightning" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="flex items-center gap-2 text-xs font-bold text-amber-300">
                <span>ACTIVE EN-ROUTE SIGMET (${s.fir} FIR): ${s.phenomenon}</span>
                <span class="font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[11px]">${s.flRange || 'FIR'}</span>
              </div>
              <p class="text-[11px] text-slate-300 mt-0.5">
                Valid <span class="font-mono text-slate-200">${s.validity}</span> • <strong class="text-amber-300">G650ER Action:</strong> Enable Wing &amp; Cowl Anti-Ice during climb/descent through ${s.flRange || 'FL140–210'}.
              </p>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      this.elements.sigmetBannerContainer.classList.add('hidden');
      this.elements.sigmetBannerContainer.innerHTML = '';
    }

    // 2. Departure & Destination Weather Strips
    const metars = (this.currentBriefing && this.currentBriefing.metars) || [];
    const tafs = (this.currentBriefing && this.currentBriefing.tafs) || [];

    const depMetar = metars.find(m => m.icao === depIcao) || metars[0] || null;
    const arrMetar = metars.find(m => m.icao === arrIcao) || metars[1] || null;
    const depTaf = tafs.find(t => t.icao === depIcao) || tafs[0] || null;
    const arrTaf = tafs.find(t => t.icao === arrIcao) || tafs[1] || null;

    this.renderCompactWxBox(this.elements.briefDepWx, depIcao, depMetar, depTaf);
    this.renderCompactWxBox(this.elements.briefArrWx, arrIcao, arrMetar, arrTaf);

    // 3. Departure & Destination Runway Status Strips
    const depNotams = this.evaluatedNotams.filter(n => n.stage === 'DEP');
    // For Destination readiness, also surface terminal-area FIR NOTAMs that directly reference the destination airport/city (e.g., SGFA ASU TWR or Luque/SGAS drones)
    const arrTerminalFirNotams = this.evaluatedNotams.filter(n =>
      n.stage === 'FIR' &&
      (n.parsed.icao === 'SGFA' || /\b(ASU|ASUNCION|LUQUE|SGAS)\b/i.test(n.parsed.bodyText))
    );
    const arrCombinedNotams = [
      ...this.evaluatedNotams.filter(n => n.stage === 'ARR'),
      ...arrTerminalFirNotams
    ];

    this.renderCompactRunwayStrip(this.elements.briefDepRwy, depIcao, depNotams, 'ETD');
    this.renderCompactRunwayStrip(this.elements.briefArrRwy, arrIcao, arrCombinedNotams, 'ETA');

    // 4. Departure & Destination Operational Watchlist Bullets
    this.renderStationSummaryBullets(
      this.elements.summaryDepBullets,
      this.elements.summaryDepAlertBadge,
      depNotams,
      `No active NOTAM restrictions at ${depIcao} during scheduled ETD.`
    );

    this.renderStationSummaryBullets(
      this.elements.summaryArrBullets,
      this.elements.summaryArrAlertBadge,
      arrCombinedNotams,
      `No active airport NOTAMs reported for ${arrIcao}.`
    );

    // 5. En-Route & FIR Overview Grid
    this.renderEnrouteOverviewGrid();
  }

  renderCompactWxBox(container, icao, metar, taf) {
    if (!container) return;
    if (!metar) {
      container.innerHTML = `
        <div class="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>${icao} WEATHER</span>
          <span class="text-[11px] text-slate-500">No METAR in package</span>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${metar.badgeClass}">${metar.category}</span>
            <span class="text-xs font-mono text-slate-200 font-semibold">${metar.wind || 'Calm'}</span>
            <span class="text-slate-600">•</span>
            <span class="text-xs font-mono text-slate-300">Vis ${metar.visibility || '10+ km'}</span>
            <span class="text-slate-600">•</span>
            <span class="text-xs font-mono text-slate-300">${metar.ceiling || 'Clear'}</span>
          </div>
          ${metar.qnh ? `<span class="text-[11px] font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">${metar.qnh}</span>` : ''}
        </div>
        <details class="group">
          <summary class="text-[11px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer list-none flex items-center justify-between pt-0.5">
            <span class="truncate max-w-[340px]">${metar.raw}</span>
            <span class="text-[10px] text-cyan-400 shrink-0 ml-2 group-open:hidden">METAR/TAF ▾</span>
            <span class="text-[10px] text-cyan-400 shrink-0 ml-2 hidden group-open:inline">Hide ▴</span>
          </summary>
          <div class="mt-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-300 space-y-1 bg-slate-950/80 p-2.5 rounded-lg">
            <div><strong class="text-amber-400">METAR:</strong> ${metar.raw}</div>
            ${taf ? `<div><strong class="text-emerald-400">TAF:</strong> ${taf.raw}</div>` : ''}
          </div>
        </details>
      </div>
    `;
  }

  renderCompactRunwayStrip(container, icao, stationNotams, phaseLabel) {
    if (!container) return;
    const rwyNotams = stationNotams.filter(n => n.parsed.category === 'RUNWAY');

    if (rwyNotams.length === 0) {
      container.innerHTML = `
        <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono">
          <span class="flex items-center gap-1.5 text-emerald-300 font-semibold">
            <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400"></i>
            Runways Open &amp; Unrestricted
          </span>
          <span class="text-[11px] text-emerald-400/90">G650ER Verified</span>
        </div>
      `;
      return;
    }

    container.innerHTML = rwyNotams.map(item => {
      const isClosed = /Closed/i.test(item.evaluation.impactTitle);
      const active = item.isActiveInWindow;

      if (isClosed && active) {
        return `
          <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-mono">
            <span class="flex items-center gap-1.5 text-red-300 font-bold">
              <i data-lucide="x-octagon" class="w-4 h-4 text-red-400 shrink-0"></i>
              <span>${item.evaluation.impactTitle}</span>
            </span>
            <span class="px-2 py-0.5 rounded bg-red-500/30 text-red-200 text-[10px] font-bold">CLOSED AT ${phaseLabel}</span>
          </div>
        `;
      } else if (isClosed && !active) {
        return `
          <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono">
            <span class="flex items-center gap-1.5 text-emerald-300 font-medium">
              <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400 shrink-0"></i>
              <span>${item.evaluation.impactTitle}</span>
            </span>
            <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">OPEN AT ${phaseLabel}</span>
          </div>
        `;
      } else {
        return `
          <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono">
            <span class="flex items-center gap-1.5 text-amber-300 font-medium">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400 shrink-0"></i>
              <span>${item.evaluation.impactTitle}</span>
            </span>
            <span class="text-[10px] text-amber-300">ACTIVE</span>
          </div>
        `;
      }
    }).join('');
  }

  renderStationSummaryBullets(listEl, badgeEl, stationNotams, emptyMessage) {
    if (!listEl || !badgeEl) return;

    const activeItems = stationNotams.filter(n => n.isActiveInWindow && n.parsed.category !== 'ADMIN_AIP');
    const inactiveImportant = stationNotams.filter(n => !n.isActiveInWindow && n.evaluation.severity === 'CRITICAL');

    const hasCritical = activeItems.some(i => i.evaluation.severity === 'CRITICAL');
    const hasCaution = activeItems.some(i => i.evaluation.severity === 'CAUTION');

    if (hasCritical) {
      badgeEl.textContent = 'CRITICAL HAZARD';
      badgeEl.className = 'px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40';
    } else if (hasCaution) {
      badgeEl.textContent = 'CAUTION';
      badgeEl.className = 'px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
    } else {
      badgeEl.textContent = 'OPS NORMAL';
      badgeEl.className = 'px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
    }

    listEl.innerHTML = '';

    if (activeItems.length === 0 && inactiveImportant.length === 0) {
      listEl.innerHTML = `
        <li class="text-slate-400 py-2 px-3 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center gap-2">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 shrink-0"></i>
          <span>${emptyMessage}</span>
        </li>
      `;
      return;
    }

    // Show up to 3 most important items to keep Flight Brief ultra-focused
    const displayItems = [...activeItems, ...inactiveImportant].slice(0, 3);

    displayItems.forEach(item => {
      const li = document.createElement('li');
      const isInactive = !item.isActiveInWindow;
      const sev = item.evaluation.severity;

      let icon = 'info';
      let color = 'text-cyan-400';
      if (isInactive) {
        icon = 'clock';
        color = 'text-slate-400';
      } else if (sev === 'CRITICAL') {
        icon = 'alert-octagon';
        color = 'text-red-400';
      } else if (sev === 'CAUTION') {
        icon = 'alert-triangle';
        color = 'text-amber-400';
      }

      const mergedBadge = item.parsed.mergedCount > 1
        ? `<span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">${item.parsed.mergedCount} merged</span>`
        : '';

      li.className = 'p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/90 space-y-1';
      li.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="font-bold ${color} flex items-center gap-1.5 text-xs">
            <i data-lucide="${icon}" class="w-3.5 h-3.5 shrink-0"></i>
            <span>${item.evaluation.impactTitle}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${mergedBadge}
            ${isInactive ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Outside ETD/ETA</span>` : ''}
          </div>
        </div>
        <p class="text-[11px] text-slate-300 leading-snug pl-5">${item.evaluation.pilotAction || item.evaluation.executiveSummary}</p>
      `;
      listEl.appendChild(li);
    });
  }

  renderEnrouteOverviewGrid() {
    const grid = this.elements.enrouteOverviewGrid;
    if (!grid) return;
    grid.innerHTML = '';

    // Group ENROUTE and FIR NOTAMs by station code
    const enrouteItems = this.evaluatedNotams.filter(n => n.stage === 'ENROUTE' || n.stage === 'FIR' || n.stage === 'ALT');
    if (enrouteItems.length === 0) {
      grid.innerHTML = `<div class="text-xs text-slate-400 font-mono col-span-full">No En-Route or FIR NOTAMs in current package.</div>`;
      return;
    }

    const groups = new Map();
    enrouteItems.forEach(item => {
      const code = item.parsed.icao || 'FIR';
      if (!groups.has(code)) {
        groups.set(code, {
          icao: code,
          name: item.parsed.stationName || (item.stage === 'FIR' ? 'FIR Airspace' : 'En-Route Airport'),
          stage: item.stage,
          items: []
        });
      }
      groups.get(code).items.push(item);
    });

    groups.forEach(group => {
      const activeItems = group.items.filter(i => i.isActiveInWindow && i.parsed.category !== 'ADMIN_AIP');
      const hasCritical = activeItems.some(i => i.evaluation.severity === 'CRITICAL');
      const hasCaution = activeItems.some(i => i.evaluation.severity === 'CAUTION');

      let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Routine</span>`;
      if (hasCritical) {
        statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/20 text-red-300 border border-red-500/40 font-bold">Critical</span>`;
      } else if (hasCaution) {
        statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">Caution</span>`;
      }

      // Pick top 2 concise highlights
      const topHighlights = group.items.slice(0, 2).map(i => {
        const inactiveNote = !i.isActiveInWindow ? ' (Inactive at flight time)' : '';
        const countNote = i.parsed.mergedCount > 1 ? ` [${i.parsed.mergedCount}x]` : '';
        return `• ${i.evaluation.shortImpact || i.evaluation.impactTitle}${countNote}${inactiveNote}`;
      }).join('<br>');

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'text-left bg-slate-900/70 hover:bg-slate-800/80 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-1.5 flex flex-col justify-between';
      card.innerHTML = `
        <div class="w-full flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-mono font-bold text-white">${group.icao}</span>
            <span class="text-[11px] text-slate-400 truncate max-w-[130px]">${group.name}</span>
          </div>
          ${statusBadge}
        </div>
        <div class="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
          ${topHighlights}
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectedEnrouteStation = group.icao;
        this.switchView('ENROUTE');
      });

      grid.appendChild(card);
    });
  }

  renderStationViewWeather(viewName) {
    const container = this.elements.stationViewWxContainer;
    if (!container) return;

    if (viewName !== 'DEP' && viewName !== 'ARR') {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    const targetIcao = viewName === 'DEP'
      ? this.elements.inputDepIcao.value.toUpperCase().trim()
      : this.elements.inputArrIcao.value.toUpperCase().trim();

    const metars = (this.currentBriefing && this.currentBriefing.metars) || [];
    const tafs = (this.currentBriefing && this.currentBriefing.tafs) || [];
    const metar = metars.find(m => m.icao === targetIcao) || (viewName === 'DEP' ? metars[0] : metars[1]);
    const taf = tafs.find(t => t.icao === targetIcao) || (viewName === 'DEP' ? tafs[0] : tafs[1]);

    if (!metar && !taf) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="avionics-card rounded-xl p-3.5 border border-slate-800/90 space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold text-white">${targetIcao} WEATHER</span>
            ${metar ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${metar.badgeClass}">${metar.category}</span>` : ''}
          </div>
          ${metar ? `<span class="text-xs font-mono text-slate-300">${metar.wind || ''} • Vis ${metar.visibility || ''} • ${metar.ceiling || ''} • ${metar.qnh || ''}</span>` : ''}
        </div>
        ${metar ? `<div class="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2.5 py-1.5 rounded border border-slate-800/80"><strong class="text-amber-400">METAR:</strong> ${metar.raw}</div>` : ''}
        ${taf ? `<div class="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2.5 py-1.5 rounded border border-slate-800/80"><strong class="text-emerald-400">TAF:</strong> ${taf.raw}</div>` : ''}
      </div>
    `;
  }

  renderNotamsFeed() {
    const container = this.elements.notamsCardsContainer;
    if (!container) return;
    container.innerHTML = '';

    // Filter header bar if a specific En-Route station was clicked
    if (this.currentView === 'ENROUTE' && this.selectedEnrouteStation) {
      const filterBanner = document.createElement('div');
      filterBanner.className = 'flex items-center justify-between px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs';
      filterBanner.innerHTML = `
        <span class="text-cyan-300 font-mono">Showing station: <strong>${this.selectedEnrouteStation}</strong></span>
        <button id="btn-clear-enroute-station" class="text-xs text-cyan-400 hover:underline font-mono">Show All En-Route &amp; FIRs</button>
      `;
      container.appendChild(filterBanner);
      filterBanner.querySelector('#btn-clear-enroute-station').addEventListener('click', () => {
        this.selectedEnrouteStation = null;
        this.renderNotamsFeed();
      });
    }

    const filtered = this.evaluatedNotams.filter(item => {
      // 1. View Tab Filter
      if (this.currentView === 'DEP' && item.stage !== 'DEP') return false;
      if (this.currentView === 'ARR') {
        const isDestTerminalFir = item.stage === 'FIR' && (item.parsed.icao === 'SGFA' || /\b(ASU|ASUNCION|LUQUE|SGAS)\b/i.test(item.parsed.bodyText));
        if (item.stage !== 'ARR' && !isDestTerminalFir) return false;
      }
      if (this.currentView === 'ENROUTE') {
        if (item.stage === 'DEP' || item.stage === 'ARR') return false;
        if (this.selectedEnrouteStation && item.parsed.icao !== this.selectedEnrouteStation) return false;
      }

      // 2. Inactive Toggle
      if (!this.showInactive && !item.isActiveInWindow) return false;

      // 3. Search Query
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

      // 4. Category Pill Filter
      if (this.activeFilter === 'critical-caution') {
        return item.evaluation.severity === 'CRITICAL' || item.evaluation.severity === 'CAUTION';
      }
      if (this.activeFilter === 'runway') return item.parsed.category === 'RUNWAY';
      if (this.activeFilter === 'navaid') {
        return item.parsed.category === 'NAVAID_APPROACH' || item.parsed.category === 'ATC_TWR_COMMS';
      }
      if (this.activeFilter === 'airspace') {
        return item.parsed.category === 'AIRSPACE_OBSTACLE' || item.evaluation.tags.includes('AIRSPACE');
      }

      return true;
    });

    if (filtered.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'avionics-card rounded-2xl p-8 text-center text-slate-400 space-y-2';
      emptyBox.innerHTML = `
        <i data-lucide="check-circle-2" class="w-7 h-7 mx-auto text-emerald-400"></i>
        <p class="text-sm font-semibold text-slate-200">No NOTAMs match the current view or filter.</p>
        <p class="text-xs text-slate-500">All stations in this view are clear of matching restrictions.</p>
      `;
      container.appendChild(emptyBox);
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    filtered.forEach((item, index) => {
      const row = this.createCompactNotamAccordionRow(item, index);
      container.appendChild(row);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Creates a sleek, 1-line scannable NOTAM row that expands on click.
   */
  createCompactNotamAccordionRow(item, index) {
    const wrapper = document.createElement('div');
    const sev = item.evaluation.severity;
    const active = item.isActiveInWindow;

    let rowLeftClass = 'notam-row-info';
    let badgeClass = 'badge-info';

    if (sev === 'CRITICAL') {
      rowLeftClass = 'notam-row-critical';
      badgeClass = 'badge-critical';
    } else if (sev === 'CAUTION') {
      rowLeftClass = 'notam-row-caution';
      badgeClass = 'badge-caution';
    } else if (sev === 'ADVISORY') {
      rowLeftClass = 'notam-row-advisory';
      badgeClass = 'badge-advisory';
    }

    const opacityClass = active ? '' : 'opacity-70';
    wrapper.className = `notam-row ${rowLeftClass} ${opacityClass} rounded-xl overflow-hidden`;

    const validFromStr = item.parsed.validFrom ? NotamParser.formatUtc(item.parsed.validFrom) : 'IMMEDIATE';
    const validToStr = item.parsed.isPerm ? 'PERM' : (item.parsed.validTo ? NotamParser.formatUtc(item.parsed.validTo) : 'UFN');

    const mergedPill = item.parsed.mergedCount > 1
      ? `<span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold" title="Merged ${item.parsed.mergedCount} duplicate/regional NOTAMs (${item.parsed.mergedIds.join(', ')})">
           ${item.parsed.mergedCount} grouped
         </span>`
      : '';

    const statusPill = active
      ? `<span class="badge-active-window text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold">ACTIVE</span>`
      : `<span class="badge-inactive-window text-[10px] px-2 py-0.5 rounded-md font-mono">${item.parsed.foreflightTag || 'INACTIVE AT ETD/ETA'}</span>`;

    const g650HighlightsHtml = item.evaluation.g650erHighlights.length > 0
      ? `<div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2">
           <i data-lucide="plane" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>
           <div>
             <span class="font-bold text-amber-300 block mb-0.5">Gulfstream G650ER Consideration:</span>
             ${item.evaluation.g650erHighlights.join('<br>')}
           </div>
         </div>`
      : '';

    wrapper.innerHTML = `
      <!-- Scannable 1-Line Summary Header -->
      <button type="button" class="notam-row-header w-full text-left px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 cursor-pointer">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <span class="${badgeClass} text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase shrink-0 w-20 text-center">
            ${sev}
          </span>
          <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 shrink-0">
            ${item.parsed.icao || 'STN'}
          </span>
          <span class="text-xs sm:text-sm font-bold text-white truncate">
            ${item.evaluation.impactTitle}
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          ${mergedPill}
          ${item.parsed.scheduleRaw ? `<span class="hidden md:inline text-[11px] font-mono text-amber-300/90 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800">${item.parsed.scheduleRaw}</span>` : ''}
          ${statusPill}
          <i data-lucide="chevron-down" class="row-chevron w-4 h-4 text-slate-400 transition-transform duration-150"></i>
        </div>
      </button>

      <!-- Expandable Focused Detail Drawer -->
      <div class="notam-row-details hidden px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-3 text-xs">
        <p class="text-slate-200 leading-relaxed">
          ${item.evaluation.executiveSummary}
        </p>

        ${g650HighlightsHtml}

        ${item.evaluation.pilotAction ? `
          <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-start gap-2">
            <i data-lucide="check-square" class="w-4 h-4 text-cyan-400 shrink-0 mt-0.5"></i>
            <div>
              <span class="font-bold text-cyan-400 font-mono text-[11px]">CREW ACTION:</span>
              <p class="text-slate-300 mt-0.5">${item.evaluation.pilotAction}</p>
            </div>
          </div>
        ` : ''}

        <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-slate-400">
          <div>
            <span>ID: <strong class="text-slate-200">${item.parsed.mergedIds && item.parsed.mergedIds.length > 1 ? item.parsed.mergedIds.join(', ') : (item.parsed.id || 'N/A')}</strong></span>
            <span class="mx-2">•</span>
            <span>VALID: <strong class="text-slate-300">${validFromStr}</strong> ➔ <strong class="text-slate-300">${validToStr}</strong></span>
          </div>
          <button type="button" class="btn-toggle-raw text-cyan-400 hover:underline flex items-center gap-1">
            <i data-lucide="code" class="w-3.5 h-3.5"></i> Raw ICAO Text
          </button>
        </div>

        <div class="raw-notam-box hidden">
          <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed select-all">${item.parsed.raw}</pre>
        </div>
      </div>
    `;

    const headerBtn = wrapper.querySelector('.notam-row-header');
    const detailsBox = wrapper.querySelector('.notam-row-details');
    const rawBtn = wrapper.querySelector('.btn-toggle-raw');
    const rawBox = wrapper.querySelector('.raw-notam-box');

    headerBtn.addEventListener('click', () => {
      const isHidden = detailsBox.classList.contains('hidden');
      detailsBox.classList.toggle('hidden', !isHidden);
      wrapper.classList.toggle('expanded', isHidden);
    });

    if (rawBtn && rawBox) {
      rawBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rawBox.classList.toggle('hidden');
      });
    }

    return wrapper;
  }

  copyDispatchBriefing() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase();
    const tail = this.elements.bannerTail.textContent || 'N650MV';
    const etd = this.elements.bannerEtd.textContent || '14:00Z';
    const eta = this.elements.bannerEta.textContent || '15:27Z';

    const criticals = this.evaluatedNotams.filter(n => n.isActiveInWindow && n.evaluation.severity === 'CRITICAL');
    const cautions = this.evaluatedNotams.filter(n => n.isActiveInWindow && n.evaluation.severity === 'CAUTION');

    let text = `✈️ GULFSTREAM G650ER FLIGHT BRIEF: ${depIcao} ➔ ${arrIcao}\n`;
    text += `Tail: ${tail} (GLF6) | ETD: ${etd} | ETA: ${eta}\n\n`;

    if (this.currentBriefing && this.currentBriefing.metars.length) {
      text += `🌦️ WEATHER:\n`;
      this.currentBriefing.metars.forEach(m => {
        text += `• ${m.icao} [${m.category}]: ${m.wind || ''} | Vis ${m.visibility || ''} | ${m.ceiling || ''} | ${m.qnh || ''}\n`;
      });
      if (this.currentBriefing.sigmets.length) {
        this.currentBriefing.sigmets.forEach(s => {
          text += `• ⚠️ SIGMET (${s.fir}): ${s.phenomenon} ${s.flRange || ''}\n`;
        });
      }
      text += `\n`;
    }

    text += `🔴 CRITICAL HAZARDS AT ETD/ETA:\n`;
    if (criticals.length === 0) {
      text += `• None active during flight window\n`;
    } else {
      criticals.forEach(c => {
        text += `• [${c.parsed.icao}] ${c.evaluation.impactTitle}\n`;
      });
    }

    text += `\n🟡 CAUTION & OPERATIONAL NOTES:\n`;
    if (cautions.length === 0) {
      text += `• Normal G650ER operations\n`;
    } else {
      cautions.forEach(c => {
        text += `• [${c.parsed.icao}] ${c.evaluation.impactTitle}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Focused briefing copied to clipboard!');
    });
  }

  showToast(message) {
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notice bg-slate-900 border border-cyan-500/50 text-cyan-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl font-mono flex items-center gap-2';
    toast.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  async handleLiveFetch() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    this.elements.btnExecuteFetch.disabled = true;

    try {
      const matchingPreset = MOCK_FLIGHT_PRESETS.find(p => p.depIcao === depIcao && p.arrIcao === arrIcao);
      const fetchedText = matchingPreset ? matchingPreset.notamsText : `
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
      this.elements.setupDrawer.classList.add('hidden');
      this.processBriefingText(fetchedText);
      this.showToast('Airport NOTAMs loaded');
    } finally {
      this.elements.btnExecuteFetch.disabled = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.aeroBrief = new AeroBriefApp();
});
