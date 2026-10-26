/**
 * AeroBrief G650ER - Main Application Controller
 * Features:
 * - Interactive Leaflet Tactical Route, Waypoint, SIGMET Polygon & NOTAM Map
 * - Live Onboard Web Weather (NOAA AviationWeather.gov METAR/TAF + RainViewer Live Radar)
 * - 2-Column ForeFlight PDF Text Reconstruction & Visual Chart Page Renderer (Pages 1–3)
 * - Smart Bilingual & Cluster NOTAM Deduplication + Haversine Distance Badges
 */

import { NotamParser, AIRPORT_COORDS_DB } from './notam-parser.js?v=9';
import { G650ERRulesEngine } from './g650er-rules.js?v=9';
import { MOCK_FLIGHT_PRESETS } from './mock-briefings.js?v=9';
import {
  JeppesenComplianceEngine,
  DEFAULT_PRESET_FIRS,
  GLOBAL_COMPLIANCE_SCENARIOS
} from './jeppesen-compliance.js?v=9';

class AeroBriefApp {
  constructor() {
    this.currentPresetIndex = 0;
    this.currentBriefing = null;
    this.evaluatedNotams = [];
    this.currentView = 'brief'; // 'brief' | 'MAP' | 'DEP' | 'ARR' | 'ALT' | 'ENROUTE' | 'JEPPESEN' | 'CHARTS' | 'ALL'
    this.activeFilter = 'all';
    this.showInactive = true;
    this.filterClutter = true; // Concentrates on operational NOTAMs, suppressing low-impact clutter
    this.searchQuery = '';
    this.isGlareMode = false;
    this.selectedEnrouteStation = null;

    // Jeppesen Airway Manual Compliance Engine State
    this.jeppesenEngine = new JeppesenComplianceEngine();
    this.activeScenarioExtraIcaos = [];
    this.isCustomScenarioOverride = false;

    // Leaflet Map State
    this.map = null;
    this.baseTileLayer = null;
    this.satTileLayer = null;
    this.radarTileLayer = null;
    this.isSatelliteActive = false;
    this.isRadarActive = false;
    this.isMapExpanded = false;
    this.mapOverlaysGroup = null;
    this.notamMapLayers = new Map();

    this.initElements();
    this.initClock();
    this.initFlightTimes();
    this.initPresetButtons();
    this.initTheme();
    this.initMap();
    this.initEventListeners();
    this.initDropZone();
    this.initJeppesenModule();

    // Load default mission (SBJH -> SGAS N650MV)
    this.loadPreset(0);
  }

  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  isClutterNotam(item) {
    if (!item) return false;
    const ev = item.evaluation || {};
    if (ev.isClutter) return true;

    // Critical and Caution are operational priorities and NEVER clutter
    if (ev.severity === 'CRITICAL' || ev.severity === 'CAUTION') return false;

    const p = item.parsed || {};
    if (['RUNWAY', 'APPROACH_LIGHTING', 'NAVAID_APPROACH', 'FUEL', 'CUSTOMS'].includes(p.category)) {
      return false;
    }

    const text = `${p.bodyText || ''} ${p.raw || ''}`.toUpperCase();

    // Grass cutting / mowing
    if (/\b(?:GRASS\s+CUTTING|MOWING|WEED|VEGETATION)\b/i.test(text)) return true;

    // Bird activity / wildlife hazard without runway closure
    if (/\b(?:BIRD\s+(?:ACTIVITY|HAZARD|STRIKE|WATCH|CONCENTRATION)|WILDLIFE\s+HAZARD|AVIAN\s+HAZARD|FLOCKS?\s+OF\s+BIRDS?)\b/i.test(text)) {
      return true;
    }

    // Administrative, contact, telephone, AIP SUP, Trigger notices
    if (/\b(?:TEL\s+(?:NO|NUM|CHANGED)|PHONE\s+(?:NO|NUM)|OFFICE\s+HOURS|OFFICE\s+HRS|ADMINISTRATIVE|CONTACT\s+DETAILS|AIP\s+SUP|TRIGGER\s+NOTAM)\b/i.test(text) || p.category === 'ADMIN_AIP') {
      return true;
    }

    // Commercial passenger jetway outages (G650ER has built-in airstairs)
    if (/\b(?:JETWAY|PASSENGER\s+BOARDING\s+BRIDGE|PBB\s+U\/S)\b/i.test(text) || (ev.tags && ev.tags.includes('TERMINAL'))) {
      return true;
    }

    // Apron line painting / marking maintenance without closure
    if (/\b(?:LINE\s+MARKING|PAINTING|MARKING\s+MAINT)\b/i.test(text) && !/\b(?:CLSD|CLOSED)\b/i.test(text)) {
      return true;
    }

    // Distant / low obstacle outside approach path
    if (ev.tags && ev.tags.includes('OBSTACLE')) {
      if (typeof p.distanceFromNearestNm === 'number' && p.distanceFromNearestNm > 2.5) return true;
      if (/\b(?:150FT\s*AGL|100FT\s*AGL|80FT\s*AGL|60FT\s*AGL|40FT\s*AGL)\b/i.test(text)) return true;
    }

    // Routine beacon / windsock / anemometer light bulb maintenance
    if (/\b(?:WDI\s+LIGHT|ANEMOMETER\s+LIGHT|ABN\s+U\/S|WIND\s+CONE\s+LIGHT)\b/i.test(text)) return true;

    // Routine general notices with no pilot action required
    if (ev.severity === 'INFO' && !ev.pilotAction) return true;

    return false;
  }

  updateClutterFilterUI() {
    if (!this.elements.btnToggleClutter || !this.elements.clutterFilterLabel) return;
    const clutterCount = (this.evaluatedNotams || []).filter(n => this.isClutterNotam(n)).length;

    if (this.filterClutter) {
      this.elements.btnToggleClutter.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30';
      this.elements.clutterFilterLabel.textContent = `🛡️ Clutter Filter: ACTIVE (${clutterCount} Suppressed)`;
      this.elements.btnToggleClutter.title = `Click to show all ${clutterCount} routine/clutter notices (birds, grass, admin)`;
    } else {
      this.elements.btnToggleClutter.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700';
      this.elements.clutterFilterLabel.textContent = `👁️ All Notices Shown (${clutterCount} Clutter)`;
      this.elements.btnToggleClutter.title = 'Click to activate clutter filter and hide low-impact notices';
    }
  }

  initElements() {
    this.elements = {
      liveUtcClock: document.getElementById('live-utc-clock'),
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      btnCopyBriefing: document.getElementById('btn-copy-briefing'),
      btnLiveWebWx: document.getElementById('btn-live-web-wx'),
      liveWxBtnLabel: document.getElementById('live-wx-btn-label'),
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
      btnTabCharts: document.getElementById('btn-tab-charts'),
      tabBadgeCharts: document.getElementById('tab-badge-charts'),
      tabDepIcao: document.getElementById('tab-dep-icao'),
      tabArrIcao: document.getElementById('tab-arr-icao'),
      tabBadgeDep: document.getElementById('tab-badge-dep'),
      tabBadgeArr: document.getElementById('tab-badge-arr'),
      tabAltIcao: document.getElementById('tab-alt-icao'),
      tabBadgeAlt: document.getElementById('tab-badge-alt'),
      tabBadgeEnroute: document.getElementById('tab-badge-enroute'),
      tabBadgeAll: document.getElementById('tab-badge-all'),

      countCritical: document.getElementById('count-critical'),
      countCaution: document.getElementById('count-caution'),
      countAdvisory: document.getElementById('count-advisory'),
      countInactive: document.getElementById('count-inactive'),

      tacticalMapCard: document.getElementById('tactical-map-card'),
      routeMapCanvas: document.getElementById('route-map-canvas'),
      liveRadarBadge: document.getElementById('live-radar-badge'),
      btnMapFitRoute: document.getElementById('btn-map-fit-route'),
      btnMapZoomDep: document.getElementById('btn-map-zoom-dep'),
      btnMapZoomArr: document.getElementById('btn-map-zoom-arr'),
      mapBtnDepLbl: document.getElementById('map-btn-dep-lbl'),
      mapBtnArrLbl: document.getElementById('map-btn-arr-lbl'),
      btnMapToggleRadar: document.getElementById('btn-map-toggle-radar'),
      btnMapStyleDark: document.getElementById('btn-map-style-dark'),
      btnMapStyleOsm: document.getElementById('btn-map-style-osm'),
      btnMapToggleSat: document.getElementById('btn-map-toggle-sat'),
      btnMapExpand: document.getElementById('btn-map-expand'),
      routeTimelineStrip: document.getElementById('route-timeline-strip'),

      viewFlightBrief: document.getElementById('view-flight-brief'),
      viewChartsSection: document.getElementById('view-charts-section'),
      pdfChartsContainer: document.getElementById('pdf-charts-container'),
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

      summaryAltIcao: document.getElementById('summary-alt-icao'),
      briefAltTime: document.getElementById('brief-alt-time'),
      briefAltName: document.getElementById('brief-alt-name'),
      summaryAltAlertBadge: document.getElementById('summary-alt-alert-badge'),
      briefAltWx: document.getElementById('brief-alt-wx'),
      briefAltRwy: document.getElementById('brief-alt-rwy'),
      summaryAltBullets: document.getElementById('summary-alt-bullets'),

      btnToggleClutter: document.getElementById('btn-toggle-clutter'),
      clutterFilterLabel: document.getElementById('clutter-filter-label'),

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
      inputApiKey: document.getElementById('input-api-key'),

      // Jeppesen Airway Manual Compliance Elements
      inputRouteFirs: document.getElementById('input-route-firs'),
      capFans1a: document.getElementById('cap-fans1a'),
      capAtnb1: document.getElementById('cap-atnb1'),
      capAdsb: document.getElementById('cap-adsb'),
      capRnp: document.getElementById('cap-rnp'),
      capHudEfvs: document.getElementById('cap-hud-efvs'),

      btnTabJeppesen: document.getElementById('btn-tab-jeppesen'),
      tabBadgeJeppesen: document.getElementById('tab-badge-jeppesen'),
      briefJeppesenSummaryGrid: document.getElementById('brief-jeppesen-summary-grid'),
      viewJeppesenSection: document.getElementById('view-jeppesen-section'),
      jeppScenarioButtons: document.getElementById('jepp-scenario-buttons'),
      jeppActiveFlightBanner: document.getElementById('jepp-active-flight-banner'),
      jeppInlineFirs: document.getElementById('jepp-inline-firs'),
      btnJeppApplyFirs: document.getElementById('btn-jepp-apply-firs'),
      jeppCnsStatusBadge: document.getElementById('jepp-cns-status-badge'),
      jeppCpdlcTimelineContainer: document.getElementById('jepp-cpdlc-timeline-container'),
      jeppPbnValidatorContainer: document.getElementById('jepp-pbn-validator-container'),
      jeppSpecialAlertsContainer: document.getElementById('jepp-special-alerts-container'),
      jeppAdizDelaySlider: document.getElementById('jepp-adiz-delay-slider'),
      jeppAdizDelayLabel: document.getElementById('jepp-adiz-delay-label'),
      jeppShowAllAdiz: document.getElementById('jepp-show-all-adiz'),
      jeppAdizCardsContainer: document.getElementById('jepp-adiz-cards-container'),

      btnJeppSyncDestNotams: document.getElementById('btn-jepp-sync-dest-notams'),
      aomLvtoRegime: document.getElementById('aom-lvto-regime'),
      aomLvpActive: document.getElementById('aom-lvp-active'),
      aomLvtoHirl: document.getElementById('aom-lvto-hirl'),
      aomLvtoCl: document.getElementById('aom-lvto-cl'),
      aomLvtoRclm: document.getElementById('aom-lvto-rclm'),
      aomLvtoHud: document.getElementById('aom-lvto-hud'),
      aomLvtoResultBox: document.getElementById('aom-lvto-result-box'),

      aomAppType: document.getElementById('aom-app-type'),
      aomAppDh: document.getElementById('aom-app-dh'),
      aomDegAlsOut: document.getElementById('aom-deg-als-out'),
      aomDegTdzOut: document.getElementById('aom-deg-tdz-out'),
      aomDegNofd: document.getElementById('aom-deg-nofd'),
      aomDegObstacles: document.getElementById('aom-deg-obstacles'),
      aomDegEfvs: document.getElementById('aom-deg-efvs'),
      aomAppResultBox: document.getElementById('aom-app-result-box'),

      jeppShowGlobalNcn: document.getElementById('jepp-show-global-ncn'),
      jeppCcnNcnContainer: document.getElementById('jepp-ccn-ncn-container'),
      jeppSsrRouteCards: document.getElementById('jepp-ssr-route-cards'),
      jeppSsrGlobalTable: document.getElementById('jepp-ssr-global-table')
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
    this.updateMapBaseTile();
  }

  /**
   * Initialize Interactive Leaflet Tactical Map (100% Free CartoDB / OSM / Esri / RainViewer tiles)
   */
  initMap() {
    if (!this.elements.routeMapCanvas) return;

    if (typeof L === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => this.initMap();
      document.head.appendChild(script);
      return;
    }

    if (this.map) return;

    this.mapStyleMode = 'dark'; // 'dark' | 'osm' | 'sat'
    this.map = L.map(this.elements.routeMapCanvas, {
      center: [-24.3, -52.3],
      zoom: 6,
      zoomControl: true,
      attributionControl: true
    });

    this.updateMapBaseTile();
    this.mapOverlaysGroup = L.layerGroup().addTo(this.map);

    // Ensure map size & bounds stay synced after Tailwind CDN or window resize
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (this.map) this.map.invalidateSize();
      });
      ro.observe(this.elements.routeMapCanvas);
    }

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        this.renderMapOverlays();
      }
    }, 250);
  }

  setMapStyleMode(mode) {
    this.mapStyleMode = mode;
    this.isSatelliteActive = (mode === 'sat');

    const activeCls = 'px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold transition';
    const idleCls = 'px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition';

    if (this.elements.btnMapStyleDark) this.elements.btnMapStyleDark.className = mode === 'dark' ? activeCls : idleCls;
    if (this.elements.btnMapStyleOsm) this.elements.btnMapStyleOsm.className = mode === 'osm' ? activeCls : idleCls;
    if (this.elements.btnMapToggleSat) this.elements.btnMapToggleSat.className = mode === 'sat' ? activeCls : idleCls;

    this.updateMapBaseTile();
  }

  updateMapBaseTile() {
    if (!this.map || typeof L === 'undefined') return;

    if (this.baseTileLayer) {
      this.map.removeLayer(this.baseTileLayer);
      this.baseTileLayer = null;
    }
    if (this.satTileLayer) {
      this.map.removeLayer(this.satTileLayer);
      this.satTileLayer = null;
    }

    if (this.isSatelliteActive || this.mapStyleMode === 'sat') {
      this.baseTileLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Esri World Satellite', maxZoom: 18 }
      ).addTo(this.map);
      // Add hybrid airport/city/border reference labels on top of satellite imagery
      this.satTileLayer = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 18, opacity: 0.85 }
      ).addTo(this.map);
      return;
    }

    if (this.mapStyleMode === 'osm' || this.isGlareMode) {
      this.baseTileLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '&copy; OpenStreetMap', maxZoom: 19 }
      ).addTo(this.map);
      return;
    }

    const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    this.baseTileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
      className: 'map-tiles-dark-boost'
    }).addTo(this.map);

    // Automatic fallback to standard OpenStreetMap if CartoDB tiles ever fail
    let fallbackTriggered = false;
    this.baseTileLayer.on('tileerror', () => {
      if (!fallbackTriggered && this.map) {
        fallbackTriggered = true;
        this.setMapStyleMode('osm');
      }
    });
  }

  /**
   * Toggle Live Global Weather Radar overlay via RainViewer Public API
   */
  async toggleWeatherRadar() {
    if (!this.map || typeof L === 'undefined') return;

    if (this.isRadarActive && this.radarTileLayer) {
      this.map.removeLayer(this.radarTileLayer);
      this.radarTileLayer = null;
      this.isRadarActive = false;
      if (this.elements.liveRadarBadge) this.elements.liveRadarBadge.classList.add('hidden');
      this.showToast('Weather Radar overlay hidden');
      return;
    }

    try {
      this.showToast('Fetching live global weather radar...');
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
        const latest = data.radar.past[data.radar.past.length - 1];
        const radarUrl = `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
        if (this.radarTileLayer) this.map.removeLayer(this.radarTileLayer);
        this.radarTileLayer = L.tileLayer(radarUrl, {
          opacity: 0.55,
          zIndex: 250,
          attribution: 'RainViewer Live Radar'
        }).addTo(this.map);
        this.isRadarActive = true;
        if (this.elements.liveRadarBadge) this.elements.liveRadarBadge.classList.remove('hidden');
        this.showToast('Live Weather Radar overlay active');
      }
    } catch (e) {
      console.warn('RainViewer radar fetch error:', e);
      this.showToast('Could not reach live radar server (check onboard internet)');
    }
  }

  /**
   * Render Route Polyline, Waypoints, Airports, SIGMET Polygons, and Geo-Referenced NOTAMs on the map.
   */
  renderMapOverlays() {
    if (!this.map || !this.mapOverlaysGroup || typeof L === 'undefined') return;

    this.mapOverlaysGroup.clearLayers();
    this.notamMapLayers.clear();

    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    if (this.elements.mapBtnDepLbl) this.elements.mapBtnDepLbl.textContent = depIcao;
    if (this.elements.mapBtnArrLbl) this.elements.mapBtnArrLbl.textContent = arrIcao;

    const boundsPoints = [];

    // 1. Plot SIGMET Polygons (e.g. SBCW SIGMET 13, 14, 15 Severe Icing)
    const sigmets = (this.currentBriefing && this.currentBriefing.sigmets) || [];
    sigmets.forEach(sig => {
      if (sig.polygon && sig.polygon.length >= 3) {
        const poly = L.polygon(sig.polygon, {
          color: '#f59e0b',
          weight: 1.5,
          dashArray: '5, 5',
          fillColor: '#f59e0b',
          fillOpacity: 0.12
        }).addTo(this.mapOverlaysGroup);

        poly.bindPopup(`
          <div class="text-xs space-y-1 p-1 max-w-xs">
            <div class="font-mono font-bold text-amber-400">⚠️ ${sig.fir} SIGMET ${sig.number}: ${sig.phenomenon}</div>
            <div class="font-mono text-[11px] text-slate-300">Altitude: <strong>${sig.flRange || 'FIR'}</strong> • Valid: ${sig.validity}</div>
            <div class="text-[11px] text-amber-200 pt-1 border-t border-slate-700">
              <strong>G650ER Action:</strong> Enable Wing &amp; Cowl Anti-Ice when climbing or descending through ${sig.flRange || 'icing layer'}.
            </div>
          </div>
        `);
      }
    });

    // 2. Plot Route Polyline & Waypoints
    const profile = this.currentBriefing && this.currentBriefing.routeProfile;
    if (profile && profile.waypoints && profile.waypoints.length >= 2) {
      const routeLatLngs = profile.waypoints.map(w => [w.lat, w.lon]);
      routeLatLngs.forEach(pt => boundsPoints.push(pt));

      // Outer glow line
      L.polyline(routeLatLngs, {
        color: '#06b6d4',
        weight: 6,
        opacity: 0.25
      }).addTo(this.mapOverlaysGroup);

      // Core flight path line
      L.polyline(routeLatLngs, {
        color: '#22d3ee',
        weight: 2.5,
        opacity: 0.95
      }).addTo(this.mapOverlaysGroup);

      // Waypoint Diamonds
      profile.waypoints.forEach(wp => {
        if (wp.phase === 'DEP' || wp.phase === 'ARR') return; // Handled by airport markers
        const isTocTod = wp.phase === 'TOC' || wp.phase === 'TOD';
        const iconHtml = `
          <div class="flex flex-col items-center">
            <div class="w-2.5 h-2.5 rotate-45 ${isTocTod ? 'bg-amber-400 border border-slate-950 shadow shadow-amber-400/50' : 'bg-cyan-400 border border-slate-950'}"></div>
            <span class="mt-0.5 px-1 py-0.2 rounded bg-slate-950/85 text-[9px] font-mono ${isTocTod ? 'text-amber-300 font-bold border border-amber-500/40' : 'text-slate-300'} whitespace-nowrap">
              ${wp.id} ${wp.time}
            </span>
          </div>
        `;
        const wpIcon = L.divIcon({
          html: iconHtml,
          className: 'custom-wp-icon',
          iconSize: [60, 28],
          iconAnchor: [30, 5]
        });

        L.marker([wp.lat, wp.lon], { icon: wpIcon })
          .bindPopup(`
            <div class="text-xs font-mono space-y-1 p-1">
              <div class="font-bold text-cyan-400">WAYPOINT: ${wp.id} (${wp.phase})</div>
              <div>Crossing UTC: <strong>${wp.time}</strong></div>
              <div>Planned Level: <strong>FL${wp.fl}</strong></div>
            </div>
          `)
          .addTo(this.mapOverlaysGroup);
      });
    }

    // 3. Plot Geo-Referenced NOTAM Circles & Polygons
    this.evaluatedNotams.forEach((item, idx) => {
      const geo = item.parsed.geometry;
      if (!geo || !geo.center) return;
      if (item.parsed.category === 'ADMIN_AIP') return;

      const sev = item.evaluation.severity;
      const active = item.isActiveInWindow;

      let strokeColor = '#38bdf8';
      let fillColor = '#06b6d4';
      if (sev === 'CRITICAL') {
        strokeColor = '#ef4444';
        fillColor = '#ef4444';
      } else if (sev === 'CAUTION') {
        strokeColor = '#f59e0b';
        fillColor = '#f59e0b';
      } else if (sev === 'INFO') {
        strokeColor = '#94a3b8';
        fillColor = '#64748b';
      }

      const popupHtml = `
        <div class="text-xs space-y-1.5 p-1 max-w-xs">
          <div class="flex items-center justify-between gap-2 border-b border-slate-700 pb-1">
            <span class="font-mono font-bold text-white">${item.parsed.icao} • ${item.parsed.id || 'NOTAM'}</span>
            <span class="font-mono text-[10px] px-1.5 py-0.2 rounded ${active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}">
              ${active ? 'ACTIVE' : 'INACTIVE AT ETD/ETA'}
            </span>
          </div>
          <div class="font-bold text-slate-100">${item.evaluation.impactTitle}</div>
          ${item.parsed.distanceBadge ? `<div class="text-[11px] font-mono text-cyan-300">📍 ${item.parsed.distanceBadge}</div>` : ''}
          <p class="text-[11px] text-slate-300 leading-snug">${item.evaluation.executiveSummary}</p>
          ${item.evaluation.pilotAction ? `<div class="text-[10px] font-mono text-amber-300 bg-slate-900 p-1.5 rounded border border-slate-800"><strong>ACTION:</strong> ${item.evaluation.pilotAction}</div>` : ''}
        </div>
      `;

      let layerObj = null;

      if (geo.polygon && geo.polygon.length >= 3) {
        layerObj = L.polygon(geo.polygon, {
          color: strokeColor,
          weight: active ? 2 : 1,
          dashArray: active ? null : '4, 4',
          fillColor,
          fillOpacity: active ? 0.25 : 0.08
        }).addTo(this.mapOverlaysGroup);
        layerObj.bindPopup(popupHtml);
      } else {
        // Draw radius circle in meters (cap visual radius at 25 NM so large VOR rings don't cover whole map)
        const displayRadiusNm = Math.min(geo.radiusNm || 1.5, 18);
        layerObj = L.circle(geo.center, {
          radius: displayRadiusNm * 1852,
          color: strokeColor,
          weight: active ? 2 : 1,
          dashArray: active ? null : '4, 4',
          fillColor,
          fillOpacity: active ? 0.20 : 0.07
        }).addTo(this.mapOverlaysGroup);
        layerObj.bindPopup(popupHtml);
      }

      this.notamMapLayers.set(idx, { layer: layerObj, center: geo.center, radiusNm: geo.radiusNm || 2 });
    });

    // 4. Plot Departure, Destination, and En-Route Airports
    const metars = (this.currentBriefing && this.currentBriefing.metars) || [];
    const stationsToPlot = new Set([depIcao, arrIcao]);
    if (this.currentBriefing && this.currentBriefing.sections) {
      this.currentBriefing.sections.forEach(s => {
        if (s.type !== 'FIR' && s.icao) stationsToPlot.add(s.icao);
      });
    }

    stationsToPlot.forEach(code => {
      const coord = AIRPORT_COORDS_DB[code];
      if (!coord) return;

      boundsPoints.push([coord.lat, coord.lon]);
      const isDep = code === depIcao;
      const isArr = code === arrIcao;
      const metar = metars.find(m => m.icao === code);

      let ringColor = 'border-cyan-400 bg-slate-900 text-cyan-300';
      if (isDep) ringColor = 'border-amber-400 bg-amber-500 text-slate-950 font-black';
      else if (isArr) ringColor = 'border-emerald-400 bg-emerald-500 text-slate-950 font-black';

      const wxPill = metar ? `<span class="ml-1 px-1 rounded bg-slate-900 text-emerald-300 text-[9px]">${metar.category}</span>` : '';

      const stationIcon = L.divIcon({
        html: `
          <div class="flex items-center gap-1 px-2 py-0.5 rounded-full border-2 shadow-lg font-mono text-[11px] whitespace-nowrap ${ringColor}">
            <span>${code}</span>
            ${wxPill}
          </div>
        `,
        className: 'custom-station-icon',
        iconSize: [68, 24],
        iconAnchor: [34, 12]
      });

      const stNotams = this.evaluatedNotams.filter(n => n.parsed.icao === code);
      const stSummary = stNotams.length === 0
        ? 'No active airport NOTAMs'
        : stNotams.slice(0, 3).map(n => `• ${n.evaluation.shortImpact || n.evaluation.impactTitle}`).join('<br>');

      L.marker([coord.lat, coord.lon], { icon: stationIcon, zIndexOffset: isDep || isArr ? 1000 : 500 })
        .bindPopup(`
          <div class="text-xs space-y-1 p-1 min-w-[200px]">
            <div class="font-mono font-bold text-white text-sm">${code} — ${coord.name || ''}</div>
            ${metar ? `<div class="font-mono text-[11px] text-emerald-300 bg-slate-900 p-1.5 rounded border border-slate-800">${metar.raw}</div>` : ''}
            <div class="text-[11px] text-slate-300 pt-1">
              <strong class="text-slate-400 block mb-0.5">Station NOTAMs (${stNotams.length}):</strong>
              ${stSummary}
            </div>
          </div>
        `)
        .addTo(this.mapOverlaysGroup);
    });

    if (boundsPoints.length >= 2) {
      this.map.fitBounds(boundsPoints, { padding: [35, 35] });
    }
  }

  /**
   * Smoothly pan/zoom map to a specific NOTAM and open its popup
   */
  flyToNotamOnMap(index) {
    const entry = this.notamMapLayers.get(index);
    if (!entry || !this.map) return;

    if (this.currentView !== 'brief' && this.currentView !== 'MAP') {
      this.switchView('MAP');
    }

    this.elements.tacticalMapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const targetZoom = entry.radiusNm <= 2 ? 13 : (entry.radiusNm <= 10 ? 11 : 8);
    this.map.flyTo(entry.center, targetZoom, { duration: 0.8 });
    setTimeout(() => {
      entry.layer.openPopup();
    }, 850);
  }

  /**
   * Render interactive route waypoint & vertical profile timeline strip below map
   */
  renderRouteTimelineStrip() {
    const strip = this.elements.routeTimelineStrip;
    if (!strip) return;

    const profile = this.currentBriefing && this.currentBriefing.routeProfile;
    if (!profile || !profile.waypoints) {
      strip.innerHTML = `<span class="text-slate-400 font-mono text-[11px]">Route profile ready</span>`;
      return;
    }

    const wpButtons = profile.waypoints.map(wp => {
      const isKey = wp.phase === 'DEP' || wp.phase === 'TOC' || wp.phase === 'TOD' || wp.phase === 'ARR';
      const badgeStyle = isKey
        ? 'bg-slate-800 text-amber-300 border-amber-500/40 font-bold'
        : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700';
      return `
        <button type="button" data-lat="${wp.lat}" data-lon="${wp.lon}" class="wp-timeline-btn px-2 py-1 rounded-lg border text-[10px] font-mono transition flex items-center gap-1 ${badgeStyle}">
          <span>${wp.id}</span>
          <span class="text-slate-400">${wp.time}</span>
          <span class="text-cyan-400">FL${wp.fl}</span>
        </button>
      `;
    }).join('<span class="text-slate-600 text-[10px]">➔</span>');

    strip.innerHTML = `
      <div class="w-full space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div class="flex flex-wrap items-center gap-2 font-mono">
            <span class="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">CRUISE ${profile.cruiseFl}</span>
            <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">TROPOPAUSE ${profile.tropoRange}</span>
            <span class="text-slate-300 font-sans">${profile.climbNote}</span>
          </div>
        </div>
        <div class="flex items-center gap-1 overflow-x-auto pb-1">
          ${wpButtons}
        </div>
      </div>
    `;

    strip.querySelectorAll('.wp-timeline-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.getAttribute('data-lat'));
        const lon = parseFloat(btn.getAttribute('data-lon'));
        if (this.map && !isNaN(lat) && !isNaN(lon)) {
          this.map.flyTo([lat, lon], 9, { duration: 0.6 });
        }
      });
    });
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
    this.selectedEnrouteStation = null;
    const preset = MOCK_FLIGHT_PRESETS[index];
    if (!preset) return;

    this.elements.inputDepIcao.value = preset.depIcao;
    this.elements.inputArrIcao.value = preset.arrIcao;
    this.elements.inputAltIcao.value = preset.altIcao || '';
    this.elements.depStationLabel.textContent = preset.depName;
    this.elements.arrStationLabel.textContent = preset.arrName;
    if (this.elements.briefDepName) this.elements.briefDepName.textContent = preset.depName;
    if (this.elements.briefArrName) this.elements.briefArrName.textContent = preset.arrName;

    // For Mission 0 (SBJH -> SGAS), default to the exact Oct 02 2026 14:00Z / 15:27Z from the ForeFlight PDF
    if (index === 0) {
      this.elements.inputDepTime.value = '2026-10-02T14:00';
      this.elements.inputArrTime.value = '2026-10-02T15:27';
    } else {
      const now = new Date();
      const depDate = new Date(now.getTime() + preset.hoursFromNowDep * 3600000);
      const arrDate = new Date(now.getTime() + preset.hoursFromNowArr * 3600000);
      this.elements.inputDepTime.value = this.formatDatetimeLocal(depDate);
      this.elements.inputArrTime.value = this.formatDatetimeLocal(arrDate);
    }

    this.elements.rawNotamsTextarea.value = preset.notamsText.trim();

    this.initPresetButtons();
    this.updateUtcDisplays();
    this.processBriefingText(preset.notamsText.trim(), {
      fromPreset: true,
      presetAltIcao: preset.altIcao || ''
    });
  }

  initDropZone() {
    const dropZone = this.elements.dropZone;
    const fileInput = this.elements.fileInput;
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleUploadedFile(e.target.files[0]);
        e.target.value = '';
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

    const rightColMarkers = mapped.filter(m =>
      m.x >= midX &&
      m.y < headerY &&
      (/^[A-Z][0-9]{4}\/[0-9]{2}\b/.test(m.str.trim()) ||
       /^(?:Q|A|B|C|D|E)\)\s*/.test(m.str.trim()) ||
       /^(?:Departure|Destination|Alternate|Enroute|FIR)\b/i.test(m.str.trim()) ||
       /\bNOTAM[NRC]\b/.test(m.str.trim()) ||
       /^![A-Z0-9]{3,4}\b/.test(m.str.trim()))
    );

    const groupIntoLines = (list) => {
      if (list.length === 0) return [];
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
      const topItems = mapped.filter(m => m.y >= headerY);
      const leftItems = mapped.filter(m => m.y < headerY && m.x < midX);
      const rightItems = mapped.filter(m => m.y < headerY && m.x >= midX);

      return [
        ...groupIntoLines(topItems),
        ...groupIntoLines(leftItems),
        ...groupIntoLines(rightItems)
      ].join('\n');
    }

    return groupIntoLines(mapped).join('\n');
  }

  /**
   * Render visual chart pages (Pages 1–3 of ForeFlight PDF) into the PDF Charts tab
   */
  async renderPdfVisualCharts(pdf) {
    if (!this.elements.pdfChartsContainer || !this.elements.btnTabCharts) return;
    this.elements.pdfChartsContainer.innerHTML = '';

    const chartPages = Math.min(3, pdf.numPages);
    this.elements.btnTabCharts.classList.remove('hidden');
    if (this.elements.tabBadgeCharts) this.elements.tabBadgeCharts.textContent = chartPages;

    for (let pageNum = 1; pageNum <= chartPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.6 });

      const wrapper = document.createElement('div');
      wrapper.className = 'avionics-card rounded-2xl p-3 border border-slate-800 space-y-2';
      wrapper.innerHTML = `
        <div class="text-xs font-mono text-slate-300 flex items-center justify-between px-1">
          <span>FOREFLIGHT BRIEFING CHART — PAGE ${pageNum}</span>
          <span class="text-cyan-400">High-Resolution Vector Render</span>
        </div>
      `;

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = 'w-full h-auto rounded-xl border border-slate-800';
      wrapper.appendChild(canvas);
      this.elements.pdfChartsContainer.appendChild(wrapper);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  }

  async handleUploadedFile(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    this.showToast(`Reading ${file.name}...`);

    try {
      this.currentPresetIndex = -1;
      this.selectedEnrouteStation = null;
      this.initPresetButtons();

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

        // Also render Pages 1-3 visual charts into the PDF Charts tab
        this.renderPdfVisualCharts(pdf).catch(e => console.warn('Chart render note:', e));

        this.elements.rawNotamsTextarea.value = extractedText;
        this.processBriefingText(extractedText, { fromUpload: true, fileName: file.name });
        if (this.elements.setupDrawer) this.elements.setupDrawer.classList.add('hidden');
        if (this.currentView !== 'JEPPESEN') {
          this.switchView('brief');
        }
        this.showToast(`Flight PDF loaded (${pdf.numPages} pages) — All sections & Jeppesen Compliance updated!`);
      } else {
        const text = await file.text();
        if (this.elements.btnTabCharts) this.elements.btnTabCharts.classList.add('hidden');
        if (this.elements.pdfChartsContainer) this.elements.pdfChartsContainer.innerHTML = '';
        this.elements.rawNotamsTextarea.value = text;
        this.processBriefingText(text, { fromUpload: true, fileName: file.name });
        if (this.elements.setupDrawer) this.elements.setupDrawer.classList.add('hidden');
        if (this.currentView !== 'JEPPESEN') {
          this.switchView('brief');
        }
        this.showToast(`Loaded ${file.name} — All sections & Jeppesen Compliance updated!`);
      }
    } catch (err) {
      console.error('File parsing error:', err);
      alert(`Could not extract briefing file: ${err.message}`);
    }
  }

  /**
   * Fetch live METARs & TAFs from AviationWeather.gov over onboard Wi-Fi + activate Live Radar
   */
  async fetchLiveWebWeather() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    const altIcao = this.elements.inputAltIcao.value.toUpperCase().trim();

    const stations = [depIcao, arrIcao, altIcao, ...(this.activeScenarioExtraIcaos || [])].filter(Boolean);
    const uniqueStations = [...new Set(stations)].join(',');

    if (this.elements.liveWxBtnLabel) this.elements.liveWxBtnLabel.textContent = 'Syncing Live WX...';
    this.showToast(`Pulling live METAR/TAF for ${uniqueStations}...`);

    try {
      const targetUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(uniqueStations)}&format=json&taf=true`;
      let wxData = null;

      // Try direct fetch first, then CORS proxy fallback for browser environments
      try {
        const directRes = await fetch(targetUrl);
        if (directRes.ok) wxData = await directRes.json();
      } catch (_) {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const proxyRes = await fetch(proxyUrl);
        if (proxyRes.ok) {
          const wrapped = await proxyRes.json();
          if (wrapped && wrapped.contents) wxData = JSON.parse(wrapped.contents);
        }
      }

      if (Array.isArray(wxData) && wxData.length > 0) {
        if (!this.currentBriefing) {
          this.currentBriefing = { metars: [], tafs: [], sigmets: [], sections: [], allNotams: [] };
        }
        const liveMetars = [];
        const liveTafs = [];

        wxData.forEach(item => {
          const code = (item.icaoId || '').toUpperCase();
          if (item.rawOb) {
            const decoded = NotamParser.decodeMetar(item.rawOb, code);
            decoded.isLiveWeb = true;
            liveMetars.push(decoded);
          }
          if (item.rawTaf) {
            liveTafs.push({ icao: code, raw: item.rawTaf, isLiveWeb: true });
          }
          if (item.lat && item.lon && code) {
            AIRPORT_COORDS_DB[code] = {
              lat: Number(item.lat),
              lon: Number(item.lon),
              name: item.name || code
            };
          }
        });

        if (liveMetars.length > 0) this.currentBriefing.metars = liveMetars;
        if (liveTafs.length > 0) this.currentBriefing.tafs = liveTafs;

        this.updateAllViews();
        this.showToast(`Live Web METAR/TAF updated for ${liveMetars.length} stations!`);
      } else {
        this.showToast('Briefing weather verified • Enabling live radar');
      }

      // Also enable live RainViewer radar if not active
      if (!this.isRadarActive) {
        await this.toggleWeatherRadar();
      }
    } catch (err) {
      console.warn('Live WX fetch error:', err);
      this.showToast('Using briefing package weather (Live NOAA endpoint unreachable)');
    } finally {
      if (this.elements.liveWxBtnLabel) this.elements.liveWxBtnLabel.textContent = 'Live Web WX ✓';
    }
  }

  initEventListeners() {
    this.elements.btnThemeToggle.addEventListener('click', () => this.toggleTheme());

    if (this.elements.btnLiveWebWx) {
      this.elements.btnLiveWebWx.addEventListener('click', () => this.fetchLiveWebWeather());
    }

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

    // Map toolbar buttons
    if (this.elements.btnMapFitRoute) {
      this.elements.btnMapFitRoute.addEventListener('click', () => this.renderMapOverlays());
    }
    if (this.elements.btnMapZoomDep) {
      this.elements.btnMapZoomDep.addEventListener('click', () => {
        const dep = this.elements.inputDepIcao.value.toUpperCase().trim();
        const c = AIRPORT_COORDS_DB[dep];
        if (c && this.map) this.map.flyTo([c.lat, c.lon], 11, { duration: 0.7 });
      });
    }
    if (this.elements.btnMapZoomArr) {
      this.elements.btnMapZoomArr.addEventListener('click', () => {
        const arr = this.elements.inputArrIcao.value.toUpperCase().trim();
        const c = AIRPORT_COORDS_DB[arr];
        if (c && this.map) this.map.flyTo([c.lat, c.lon], 12, { duration: 0.7 });
      });
    }
    if (this.elements.btnMapToggleRadar) {
      this.elements.btnMapToggleRadar.addEventListener('click', () => this.toggleWeatherRadar());
    }
    if (this.elements.btnMapStyleDark) {
      this.elements.btnMapStyleDark.addEventListener('click', () => this.setMapStyleMode('dark'));
    }
    if (this.elements.btnMapStyleOsm) {
      this.elements.btnMapStyleOsm.addEventListener('click', () => this.setMapStyleMode('osm'));
    }
    if (this.elements.btnMapToggleSat) {
      this.elements.btnMapToggleSat.addEventListener('click', () => this.setMapStyleMode('sat'));
    }
    if (this.elements.btnMapExpand) {
      this.elements.btnMapExpand.addEventListener('click', () => {
        this.isMapExpanded = !this.isMapExpanded;
        this.elements.routeMapCanvas.style.height = this.isMapExpanded ? '620px' : '420px';
        setTimeout(() => {
          if (this.map) this.map.invalidateSize();
        }, 220);
      });
    }

    // Sync manual edits to Departure, Destination, and Alternate ICAOs
    const handleManualIcaoChange = () => {
      const dep = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : '').toUpperCase().trim();
      const arr = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : '').toUpperCase().trim();
      const alt = (this.elements.inputAltIcao ? this.elements.inputAltIcao.value : '').toUpperCase().trim();

      if (dep && AIRPORT_COORDS_DB[dep]) {
        this.elements.depStationLabel.textContent = AIRPORT_COORDS_DB[dep].name;
        if (this.elements.briefDepName) this.elements.briefDepName.textContent = AIRPORT_COORDS_DB[dep].name;
      }
      if (arr && AIRPORT_COORDS_DB[arr]) {
        this.elements.arrStationLabel.textContent = AIRPORT_COORDS_DB[arr].name;
        if (this.elements.briefArrName) this.elements.briefArrName.textContent = AIRPORT_COORDS_DB[arr].name;
      }

      this.isCustomScenarioOverride = false;
      this.activeScenarioExtraIcaos = [dep, arr, ...(alt ? [alt] : [])].filter(Boolean);
      if (this.jeppesenEngine && typeof this.jeppesenEngine.inferDefaultFirsForBriefing === 'function') {
        const inferredFirs = this.jeppesenEngine.inferDefaultFirsForBriefing(dep, arr, alt, this.currentBriefing);
        const firStr = inferredFirs.join(' ');
        if (this.elements.inputRouteFirs) this.elements.inputRouteFirs.value = firStr;
        if (this.elements.jeppInlineFirs) this.elements.jeppInlineFirs.value = firStr;
        this.syncJeppesenScenarioHighlight(firStr);
      }
      this.syncAomRegimeForIcaos(dep, arr);
      this.runAnalysis({ syncDestAom: true });
    };

    if (this.elements.inputDepIcao) {
      this.elements.inputDepIcao.addEventListener('change', handleManualIcaoChange);
    }
    if (this.elements.inputArrIcao) {
      this.elements.inputArrIcao.addEventListener('change', handleManualIcaoChange);
    }
    if (this.elements.inputAltIcao) {
      this.elements.inputAltIcao.addEventListener('change', handleManualIcaoChange);
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
      const currentRaw = this.elements.rawNotamsTextarea.value.trim();
      if (currentRaw !== this.lastProcessedRawText) {
        this.processBriefingText(currentRaw, { fromUpload: true });
      } else {
        if (this.elements.inputRouteFirs && this.elements.jeppInlineFirs) {
          this.elements.jeppInlineFirs.value = this.elements.inputRouteFirs.value.toUpperCase().trim();
        }
        this.runAnalysis({ syncDestAom: true });
      }
      if (this.elements.setupDrawer) this.elements.setupDrawer.classList.add('hidden');
      this.showToast('Flight Brief, Route Map & Jeppesen Compliance updated');
    });

    this.elements.btnClearText.addEventListener('click', () => {
      this.elements.rawNotamsTextarea.value = '';
    });

    this.elements.btnSampleBriefing.addEventListener('click', () => {
      this.loadPreset(this.currentPresetIndex >= 0 ? this.currentPresetIndex : 0);
    });

    this.elements.btnPrintBriefing.addEventListener('click', () => window.print());
    this.elements.btnCopyBriefing.addEventListener('click', () => this.copyDispatchBriefing());

    // Perspective Tabs
    if (this.elements.perspectiveTabs) {
      this.elements.perspectiveTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.view-tab');
        if (!tab) return;
        const view = tab.getAttribute('data-view') || 'brief';
        this.selectedEnrouteStation = null;
        this.switchView(view);
      });
    }

    document.querySelectorAll('[data-jump-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-jump-view');
        this.selectedEnrouteStation = null;
        this.switchView(targetView);
      });
    });

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

    if (this.elements.toggleShowInactive) {
      this.elements.toggleShowInactive.addEventListener('change', (e) => {
        this.showInactive = e.target.checked;
        this.renderNotamsFeed();
      });
    }

    if (this.elements.btnToggleClutter) {
      this.elements.btnToggleClutter.addEventListener('click', () => {
        this.filterClutter = !this.filterClutter;
        this.updateClutterFilterUI();
        this.updateAllViews();
        if (this.filterClutter) {
          this.showToast('Clutter Filter ACTIVE: Low-impact notices (birds, grass, admin) suppressed');
        } else {
          this.showToast('Showing ALL notices including routine clutter');
        }
      });
    }

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

    document.querySelectorAll('.view-tab').forEach(tab => {
      const v = tab.getAttribute('data-view');
      tab.classList.toggle('active', v === viewName);
    });

    // Show/hide sections based on perspective
    if (this.elements.viewJeppesenSection) {
      this.elements.viewJeppesenSection.classList.toggle('hidden', viewName !== 'JEPPESEN');
    }

    if (viewName === 'brief') {
      this.elements.tacticalMapCard.classList.remove('hidden');
      this.elements.routeMapCanvas.style.height = this.isMapExpanded ? '620px' : '420px';
      this.elements.viewFlightBrief.classList.remove('hidden');
      this.elements.viewChartsSection.classList.add('hidden');
      this.elements.viewNotamsSection.classList.add('hidden');
    } else if (viewName === 'MAP') {
      this.elements.tacticalMapCard.classList.remove('hidden');
      this.elements.routeMapCanvas.style.height = '600px';
      this.elements.viewFlightBrief.classList.add('hidden');
      this.elements.viewChartsSection.classList.add('hidden');
      this.elements.viewNotamsSection.classList.remove('hidden');
      this.renderStationViewWeather('ALL');
      this.renderNotamsFeed();
    } else if (viewName === 'JEPPESEN') {
      this.elements.tacticalMapCard.classList.add('hidden');
      this.elements.viewFlightBrief.classList.add('hidden');
      this.elements.viewChartsSection.classList.add('hidden');
      this.elements.viewNotamsSection.classList.add('hidden');
      this.renderJeppesenComplianceDeck();
    } else if (viewName === 'CHARTS') {
      this.elements.tacticalMapCard.classList.add('hidden');
      this.elements.viewFlightBrief.classList.add('hidden');
      this.elements.viewChartsSection.classList.remove('hidden');
      this.elements.viewNotamsSection.classList.add('hidden');
    } else {
      this.elements.tacticalMapCard.classList.add('hidden');
      this.elements.viewFlightBrief.classList.add('hidden');
      this.elements.viewChartsSection.classList.add('hidden');
      this.elements.viewNotamsSection.classList.remove('hidden');
      this.renderStationViewWeather(viewName);
      this.renderNotamsFeed();
    }

    setTimeout(() => {
      if (this.map && (viewName === 'brief' || viewName === 'MAP')) {
        this.map.invalidateSize();
      }
    }, 150);

    if (window.lucide) window.lucide.createIcons();
  }

  syncAomRegimeForIcaos(depIcao, arrIcao) {
    if (!this.elements.aomLvtoRegime) return;
    const dep = (depIcao || '').toUpperCase().trim();
    const arr = (arrIcao || '').toUpperCase().trim();
    if (arr.startsWith('SG') || dep.startsWith('SG') || dep.startsWith('SB') || arr.startsWith('SB')) {
      this.elements.aomLvtoRegime.value = 'SAM_AIC';
    } else if (dep.startsWith('K') || arr.startsWith('K') || dep.startsWith('P') || arr.startsWith('P')) {
      this.elements.aomLvtoRegime.value = 'FAA_TERPS';
    } else {
      this.elements.aomLvtoRegime.value = 'EASA_ICAO';
    }
  }

  processBriefingText(rawText, options = {}) {
    this.lastProcessedRawText = (rawText || '').trim();
    if (this.elements.rawNotamsTextarea && this.elements.rawNotamsTextarea.value !== rawText) {
      this.elements.rawNotamsTextarea.value = rawText || '';
    }
    if (!rawText) {
      this.evaluatedNotams = [];
      this.updateAllViews();
      return;
    }

    this.currentBriefing = NotamParser.parseFullBriefing(rawText);

    if (this.currentBriefing) {
      if (this.currentBriefing.depIcao) {
        this.elements.inputDepIcao.value = this.currentBriefing.depIcao;
      }
      if (this.currentBriefing.arrIcao) {
        this.elements.inputArrIcao.value = this.currentBriefing.arrIcao;
      }

      const activeDep = this.elements.inputDepIcao.value.toUpperCase().trim();
      const activeArr = this.elements.inputArrIcao.value.toUpperCase().trim();

      // Update Alternate ICAO from briefing (or preset default if loaded from preset)
      if (options.fromPreset && options.presetAltIcao) {
        this.elements.inputAltIcao.value = options.presetAltIcao;
      } else if (this.currentBriefing.altIcao) {
        this.elements.inputAltIcao.value = this.currentBriefing.altIcao;
      } else if (options.fromUpload) {
        this.elements.inputAltIcao.value = '';
      }
      const activeAlt = this.elements.inputAltIcao.value.toUpperCase().trim();

      // Update Departure & Destination Station Names (never leave stale names from previous flight)
      const resolvedDepName =
        this.currentBriefing.depName ||
        (AIRPORT_COORDS_DB[activeDep] && AIRPORT_COORDS_DB[activeDep].name) ||
        `${activeDep} Aerodrome`;
      const resolvedArrName =
        this.currentBriefing.arrName ||
        (AIRPORT_COORDS_DB[activeArr] && AIRPORT_COORDS_DB[activeArr].name) ||
        `${activeArr} Aerodrome`;

      this.elements.depStationLabel.textContent = resolvedDepName;
      this.elements.arrStationLabel.textContent = resolvedArrName;
      if (this.elements.briefDepName) this.elements.briefDepName.textContent = resolvedDepName;
      if (this.elements.briefArrName) this.elements.briefArrName.textContent = resolvedArrName;

      if (this.elements.bannerRoute) this.elements.bannerRoute.textContent = `${activeDep} ➔ ${activeArr}`;
      if (this.elements.bannerTail) this.elements.bannerTail.textContent = this.currentBriefing.tailNumber || 'N650MV';
      if (this.elements.bannerDate) this.elements.bannerDate.textContent = this.currentBriefing.flightDateStr || 'Active Flight';

      if (this.currentBriefing.depTimeUtc) {
        this.elements.inputDepTime.value = this.formatDatetimeLocal(this.currentBriefing.depTimeUtc);
      }
      if (this.currentBriefing.arrTimeUtc) {
        this.elements.inputArrTime.value = this.formatDatetimeLocal(this.currentBriefing.arrTimeUtc);
      }
      this.updateUtcDisplays();

      if (this.elements.bannerSourceTag) {
        this.elements.bannerSourceTag.textContent = options.fromUpload
          ? (options.fileName ? `Uploaded: ${options.fileName}` : 'Uploaded Briefing Active')
          : 'ForeFlight Briefing Active';
      }

      // Dynamically update active En-Route ICAOs & Route FIRs for Jeppesen Compliance!
      this.isCustomScenarioOverride = false;
      this.activeScenarioExtraIcaos = [
        activeDep,
        activeArr,
        ...(activeAlt ? [activeAlt] : []),
        ...(this.currentBriefing.enrouteIcaos || [])
      ].filter((v, i, a) => v && a.indexOf(v) === i);

      if (this.jeppesenEngine && typeof this.jeppesenEngine.inferDefaultFirsForBriefing === 'function') {
        const inferredFirs = this.jeppesenEngine.inferDefaultFirsForBriefing(
          activeDep,
          activeArr,
          activeAlt,
          this.currentBriefing
        );
        const firStr = inferredFirs.join(' ');
        if (this.elements.inputRouteFirs) this.elements.inputRouteFirs.value = firStr;
        if (this.elements.jeppInlineFirs) this.elements.jeppInlineFirs.value = firStr;
        this.syncJeppesenScenarioHighlight(firStr);
      }

      this.syncAomRegimeForIcaos(activeDep, activeArr);

      // Focus CCN/NCN scanner on the active flight's airports by default
      if (this.elements.jeppShowGlobalNcn) {
        this.elements.jeppShowGlobalNcn.checked = false;
      }
    }

    this.runAnalysis({ syncDestAom: true });
  }

  runAnalysis(options = {}) {
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
    const bufferHours = parseFloat(this.elements.selectTimeBuffer.value) || 1.5;

    let notamList = [];
    if (this.currentBriefing && this.currentBriefing.allNotams && this.currentBriefing.allNotams.length > 0) {
      this.currentBriefing.routeProfile = NotamParser.extractRouteProfile(rawText, depIcao, arrIcao, this.currentBriefing);
      notamList = this.currentBriefing.allNotams.map(p => {
        NotamParser.enrichNotamDistance(p, depIcao, arrIcao);
        return p;
      });
    } else {
      const strings = NotamParser.splitNotams(rawText);
      const rawParsed = strings.map(s => {
        const p = NotamParser.parseNotam(s, depIcao);
        NotamParser.enrichNotamDistance(p, depIcao, arrIcao);
        return p;
      });
      notamList = NotamParser.deduplicateNotams(rawParsed);
    }

    this.evaluatedNotams = notamList.map(parsed => {
      let stage = parsed.sectionType || 'OTHER';
      let targetUtc = depUtc;

      const notamIcao = (parsed.icao || '').toUpperCase();
      const bodyUpper = (parsed.bodyText || '').toUpperCase();
      const nearArr = parsed.nearestAirport === arrIcao && typeof parsed.distanceFromNearestNm === 'number' && parsed.distanceFromNearestNm <= 30;

      if (stage === 'OTHER' || !stage) {
        if (notamIcao === depIcao || bodyUpper.includes(depIcao) || parsed.raw.includes(`!${depIcao.replace(/^K/, '')}`)) {
          stage = 'DEP';
          targetUtc = depUtc;
        } else if (notamIcao === arrIcao || bodyUpper.includes(arrIcao) || parsed.raw.includes(`!${arrIcao.replace(/^K/, '')}`)) {
          stage = 'ARR';
          targetUtc = arrUtc;
        } else if (altIcao && (notamIcao === altIcao || bodyUpper.includes(altIcao) || (parsed.raw && parsed.raw.includes(`!${altIcao.replace(/^K/, '')}`)))) {
          stage = 'ALT';
          targetUtc = arrUtc;
        } else if (parsed.fir || notamIcao.endsWith('XX') || notamIcao.startsWith('SBBS') || notamIcao.startsWith('SBCW') || notamIcao.startsWith('SGFA')) {
          stage = 'FIR';
          targetUtc = (nearArr || (arrIcao.startsWith('SG') && notamIcao === 'SGFA')) ? arrUtc : depUtc;
        } else {
          stage = 'ENROUTE';
          targetUtc = depUtc;
        }
      } else {
        if (stage === 'DEP') targetUtc = depUtc;
        else if (stage === 'ARR' || notamIcao === arrIcao || nearArr) targetUtc = arrUtc;
        else if (stage === 'ALT' || notamIcao === altIcao) targetUtc = arrUtc;
        else targetUtc = depUtc;
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

    this.evaluatedNotams.sort((a, b) => {
      if (a.isActiveInWindow !== b.isActiveInWindow) {
        return a.isActiveInWindow ? -1 : 1;
      }
      return b.evaluation.severityScore - a.evaluation.severityScore;
    });

    if (options.syncDestAom && this.jeppesenEngine) {
      this.syncDestinationNotamDowngrades(false);
    }

    this.updateAllViews();
  }

  isDestinationTerminalFirNotam(item, arrIcao) {
    if (!item || item.stage !== 'FIR') return false;
    const p = item.parsed || {};
    const arr = (arrIcao || '').toUpperCase().trim();
    if (!arr) return false;
    if (p.subLocation && p.subLocation.toUpperCase() === arr) return true;
    if (p.nearestAirport === arr && typeof p.distanceFromNearestNm === 'number' && p.distanceFromNearestNm <= 30) {
      return true;
    }
    const body = (p.bodyText || '').toUpperCase();
    if (body.includes(arr)) return true;
    if (arr === 'SGAS' && (p.icao === 'SGFA' || /\b(ASU|ASUNCION|LUQUE|SGAS|NU GUAZU|SGR-7)\b/i.test(body))) {
      return true;
    }
    return false;
  }

  updateAllViews() {
    this.updateKpisAndTabCounts();
    this.renderFlightBriefView();
    this.renderRouteTimelineStrip();
    this.renderMapOverlays();
    this.renderJeppesenComplianceDeck();
    if (this.currentView !== 'brief' && this.currentView !== 'CHARTS' && this.currentView !== 'JEPPESEN') {
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

    const depIcao = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : 'SBJH').toUpperCase().trim();
    const arrIcao = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();
    const altIcao = (this.elements.inputAltIcao ? this.elements.inputAltIcao.value : 'SBFI').toUpperCase().trim();

    let depTotal = 0;
    let arrTotal = 0;
    let altTotal = 0;
    let enrouteTotal = 0;

    this.evaluatedNotams.forEach(item => {
      const isDestTerminalFir = this.isDestinationTerminalFirNotam(item, arrIcao);
      const isClutter = this.isClutterNotam(item);
      const passesClutter = !this.filterClutter || !isClutter;

      if (item.stage === 'DEP' || item.parsed.icao === depIcao) {
        if (passesClutter) depTotal++;
      } else if (item.stage === 'ARR' || item.parsed.icao === arrIcao || isDestTerminalFir) {
        if (passesClutter) arrTotal++;
      } else if (item.stage === 'ALT' || item.parsed.icao === altIcao) {
        if (passesClutter) altTotal++;
      } else {
        if (passesClutter) enrouteTotal++;
      }

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
    if (this.elements.tabBadgeAlt) this.elements.tabBadgeAlt.textContent = altTotal;
    if (this.elements.tabBadgeEnroute) this.elements.tabBadgeEnroute.textContent = enrouteTotal;
    if (this.elements.tabBadgeAll) this.elements.tabBadgeAll.textContent = this.evaluatedNotams.length;

    if (this.elements.tabDepIcao) this.elements.tabDepIcao.textContent = `(${depIcao})`;
    if (this.elements.tabArrIcao) this.elements.tabArrIcao.textContent = `(${arrIcao})`;
    if (this.elements.tabAltIcao) this.elements.tabAltIcao.textContent = `(${altIcao})`;

    this.updateClutterFilterUI();
  }

  renderFlightBriefView() {
    const depIcao = this.elements.inputDepIcao.value.toUpperCase().trim();
    const arrIcao = this.elements.inputArrIcao.value.toUpperCase().trim();
    const altIcao = (this.elements.inputAltIcao ? this.elements.inputAltIcao.value : 'SBFI').toUpperCase().trim();

    this.elements.summaryDepIcao.textContent = depIcao;
    this.elements.summaryArrIcao.textContent = arrIcao;
    if (this.elements.summaryAltIcao) this.elements.summaryAltIcao.textContent = altIcao;

    const depMeta = AIRPORT_COORDS_DB[depIcao];
    const arrMeta = AIRPORT_COORDS_DB[arrIcao];
    const altMeta = AIRPORT_COORDS_DB[altIcao];

    if (this.elements.briefDepName) this.elements.briefDepName.textContent = depMeta ? depMeta.name : (this.currentBriefing?.depName || depIcao);
    if (this.elements.briefArrName) this.elements.briefArrName.textContent = arrMeta ? arrMeta.name : (this.currentBriefing?.arrName || arrIcao);
    if (this.elements.briefAltName) this.elements.briefAltName.textContent = altMeta ? altMeta.name : (this.currentBriefing?.altName || altIcao);

    if (this.elements.briefAltTime) {
      const arrEtaText = (this.elements.briefArrEta ? this.elements.briefArrEta.textContent.replace('ETA ', '') : '');
      this.elements.briefAltTime.textContent = arrEtaText ? `${arrEtaText} (DIV)` : '--:--Z';
    }

    // 1. SIGMET Banner
    const sigmets = (this.currentBriefing && this.currentBriefing.sigmets) || [];
    if (sigmets.length > 0) {
      this.elements.sigmetBannerContainer.classList.remove('hidden');
      const primarySig = sigmets[0];
      this.elements.sigmetBannerContainer.innerHTML = `
        <div class="avionics-card rounded-2xl p-3.5 border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <i data-lucide="cloud-lightning" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2 text-xs font-bold text-amber-300">
                <span>ACTIVE EN-ROUTE SIGMETS (${sigmets.length} IN ${primarySig.fir} FIR): ${primarySig.phenomenon}</span>
                <span class="font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[11px]">${primarySig.flRange || 'FL140–230'}</span>
              </div>
              <p class="text-[11px] text-slate-300 mt-0.5">
                Plotted on Tactical Map above • <strong class="text-amber-300">G650ER Action:</strong> Enable Wing &amp; Cowl Anti-Ice during initial climb through ${primarySig.flRange || 'FL140–210'} (~4 min exposure). Cruise at FL430–470 is clear.
              </p>
            </div>
          </div>
        </div>
      `;
    } else {
      this.elements.sigmetBannerContainer.classList.add('hidden');
      this.elements.sigmetBannerContainer.innerHTML = '';
    }

    // 2. Weather Strips for DEP, ARR and ALT
    const metars = (this.currentBriefing && this.currentBriefing.metars) || [];
    const tafs = (this.currentBriefing && this.currentBriefing.tafs) || [];

    const depMetar = metars.find(m => m.icao === depIcao) || metars.find(m => !m.icao) || null;
    const arrMetar = metars.find(m => m.icao === arrIcao) || null;
    const altMetar = metars.find(m => m.icao === altIcao) || null;

    const depTaf = tafs.find(t => t.icao === depIcao) || tafs.find(t => !t.icao) || null;
    const arrTaf = tafs.find(t => t.icao === arrIcao) || null;
    const altTaf = tafs.find(t => t.icao === altIcao) || null;

    this.renderCompactWxBox(this.elements.briefDepWx, depIcao, depMetar, depTaf);
    this.renderCompactWxBox(this.elements.briefArrWx, arrIcao, arrMetar, arrTaf);
    if (this.elements.briefAltWx) {
      this.renderCompactWxBox(this.elements.briefAltWx, altIcao, altMetar, altTaf);
    }

    // 3. Departure, Destination & Alternate Runway Status Strips + Decoded Operational Watchlists
    const depNotams = [
      ...this.evaluatedNotams.filter(n => n.stage === 'DEP' || n.parsed.icao === depIcao),
      ...this.evaluatedNotams.filter(n => n.stage === 'FIR' && n.parsed.nearestAirport === depIcao && n.parsed.distanceFromNearestNm <= 30)
    ];

    const arrTerminalFirNotams = this.evaluatedNotams.filter(n =>
      this.isDestinationTerminalFirNotam(n, arrIcao)
    );
    const arrCombinedNotams = [
      ...this.evaluatedNotams.filter(n => n.stage === 'ARR' || n.parsed.icao === arrIcao),
      ...arrTerminalFirNotams
    ];

    const altNotams = this.evaluatedNotams.filter(n =>
      n.stage === 'ALT' || n.parsed.icao === altIcao
    );

    this.renderCompactRunwayStrip(this.elements.briefDepRwy, depIcao, depNotams, 'ETD');
    this.renderCompactRunwayStrip(this.elements.briefArrRwy, arrIcao, arrCombinedNotams, 'ETA');
    if (this.elements.briefAltRwy) {
      this.renderCompactRunwayStrip(this.elements.briefAltRwy, altIcao, altNotams, 'DIV');
    }

    this.renderStationSummaryBullets(
      this.elements.summaryDepBullets,
      this.elements.summaryDepAlertBadge,
      depNotams,
      `No active operational NOTAM restrictions at ${depIcao} during scheduled ETD.`
    );

    this.renderStationSummaryBullets(
      this.elements.summaryArrBullets,
      this.elements.summaryArrAlertBadge,
      arrCombinedNotams,
      `No active operational NOTAMs reported for ${arrIcao}.`
    );

    if (this.elements.summaryAltBullets && this.elements.summaryAltAlertBadge) {
      this.renderStationSummaryBullets(
        this.elements.summaryAltBullets,
        this.elements.summaryAltAlertBadge,
        altNotams,
        `No active operational NOTAM restrictions at Alternate (${altIcao}).`
      );
    }

    // 4. En-Route & FIR Overview Grid
    this.renderEnrouteOverviewGrid();
  }

  renderCompactWxBox(container, icao, metar, taf) {
    if (!container) return;
    if (!metar) {
      container.innerHTML = `
        <div class="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>${icao} WEATHER</span>
          <span class="text-[11px] text-slate-500">Click "Live Web WX" to fetch</span>
        </div>
      `;
      return;
    }

    const liveTag = metar.isLiveWeb
      ? `<span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono">LIVE WEB</span>`
      : '';

    container.innerHTML = `
      <div class="space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${metar.badgeClass}">${metar.category}</span>
            ${liveTag}
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

    // Strict Clutter Filtering: remove low-impact noise (birds, grass mowing, telephone changes, commercial jetway)
    const operationalNotams = stationNotams.filter(n => !this.isClutterNotam(n));
    const activeItems = operationalNotams.filter(n => n.isActiveInWindow);
    const inactiveImportant = operationalNotams.filter(n => !n.isActiveInWindow && n.evaluation.severity === 'CRITICAL');

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

    const displayItems = [...activeItems, ...inactiveImportant].slice(0, 5);

    displayItems.forEach(item => {
      const globalIdx = this.evaluatedNotams.indexOf(item);
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

      const distBtn = item.parsed.distanceBadge
        ? `<button type="button" data-map-idx="${globalIdx}" class="btn-locate-map text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition">
             📍 ${item.parsed.distanceBadge}
           </button>`
        : '';

      const categoryPill = item.evaluation.tags && item.evaluation.tags.length > 0
        ? `<span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[9px] font-bold">${item.evaluation.tags[0]}</span>`
        : '';

      li.className = 'p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/90 space-y-1.5';
      li.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <div class="font-bold ${color} flex items-center gap-1.5 text-xs">
            <i data-lucide="${icon}" class="w-3.5 h-3.5 shrink-0"></i>
            ${categoryPill}
            <span>${this.escapeHtml(item.evaluation.impactTitle)}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${distBtn}
            ${isInactive ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Outside Window</span>` : ''}
          </div>
        </div>
        <p class="text-[11px] text-slate-200 leading-snug pl-5 font-sans">
          ${item.evaluation.pilotAction ? `<strong class="text-cyan-300 font-mono">▸ Crew Action:</strong> ${this.escapeHtml(item.evaluation.pilotAction)}` : this.escapeHtml(item.evaluation.executiveSummary || item.parsed.bodyText)}
        </p>
      `;

      const mapBtn = li.querySelector('.btn-locate-map');
      if (mapBtn) {
        mapBtn.addEventListener('click', () => this.flyToNotamOnMap(globalIdx));
      }

      listEl.appendChild(li);
    });
  }

  renderEnrouteOverviewGrid() {
    const grid = this.elements.enrouteOverviewGrid;
    if (!grid) return;
    grid.innerHTML = '';

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
          name: item.parsed.stationName || (AIRPORT_COORDS_DB[code] ? AIRPORT_COORDS_DB[code].name : 'Airspace'),
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
            <span class="text-[11px] text-slate-400 truncate max-w-[140px]">${group.name}</span>
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
    const metar = metars.find(m => m.icao === targetIcao) || (viewName === 'DEP' ? metars.find(m => !m.icao) : null);
    const taf = tafs.find(t => t.icao === targetIcao) || (viewName === 'DEP' ? tafs.find(t => !t.icao) : null);

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

    const depIcao = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : 'SBJH').toUpperCase().trim();
    const arrIcao = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();
    const altIcao = (this.elements.inputAltIcao ? this.elements.inputAltIcao.value : 'SBFI').toUpperCase().trim();

    this.updateClutterFilterUI();

    const filtered = this.evaluatedNotams.filter(item => {
      if (this.currentView === 'DEP') {
        if (item.stage !== 'DEP' && item.parsed.icao !== depIcao) return false;
      }
      if (this.currentView === 'ARR') {
        const isDestTerminalFir = this.isDestinationTerminalFirNotam(item, arrIcao);
        if (item.stage !== 'ARR' && item.parsed.icao !== arrIcao && !isDestTerminalFir) return false;
      }
      if (this.currentView === 'ALT') {
        if (item.stage !== 'ALT' && item.parsed.icao !== altIcao) return false;
      }
      if (this.currentView === 'ENROUTE') {
        if (item.stage === 'DEP' || item.stage === 'ARR' || item.stage === 'ALT') return false;
        if (item.parsed.icao === depIcao || item.parsed.icao === arrIcao || item.parsed.icao === altIcao) return false;
        if (this.selectedEnrouteStation && item.parsed.icao !== this.selectedEnrouteStation) return false;
      }

      // Clutter filter: suppress low-impact / noise notices
      if (this.filterClutter && this.isClutterNotam(item)) return false;

      if (!this.showInactive && !item.isActiveInWindow) return false;

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
      const roleText = this.currentView === 'DEP' ? `Departure (${depIcao})` : (this.currentView === 'ARR' ? `Destination (${arrIcao})` : (this.currentView === 'ALT' ? `Alternate (${altIcao})` : 'current view'));
      emptyBox.innerHTML = `
        <i data-lucide="check-circle-2" class="w-7 h-7 mx-auto text-emerald-400"></i>
        <p class="text-sm font-semibold text-slate-200">No operational NOTAMs match ${roleText}.</p>
        <p class="text-xs text-slate-500">All facilities are clear of matching operational restrictions ${this.filterClutter ? '(Clutter filter active)' : ''}.</p>
      `;
      container.appendChild(emptyBox);
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    filtered.forEach(item => {
      const globalIdx = this.evaluatedNotams.indexOf(item);
      const row = this.createCompactNotamAccordionRow(item, globalIdx);
      container.appendChild(row);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  createCompactNotamAccordionRow(item, globalIndex) {
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
      ? `<span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold" title="Merged ${item.parsed.mergedCount} duplicate/regional NOTAMs">
           ${item.parsed.mergedCount} grouped
         </span>`
      : '';

    const distPill = item.parsed.distanceBadge
      ? `<span role="button" class="btn-row-map text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-cyan-500/20 text-cyan-300 border border-slate-700 hover:border-cyan-500/40 transition" title="Locate on Tactical Map">
           📍 ${item.parsed.distanceBadge}
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

    const tagPill = item.evaluation.tags && item.evaluation.tags.length > 0
      ? `<span class="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 text-[10px] font-mono font-bold shrink-0">${item.evaluation.tags[0]}</span>`
      : '';

    wrapper.innerHTML = `
      <!-- Scannable Decoded Summary Header -->
      <div class="notam-row-header w-full text-left px-4 py-3 flex flex-wrap sm:flex-nowrap items-start justify-between gap-3 cursor-pointer">
        <div class="flex flex-col min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="${badgeClass} text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase shrink-0">
              ${sev}
            </span>
            <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 shrink-0">
              ${item.parsed.icao || 'STN'}
            </span>
            ${tagPill}
            <span class="text-xs sm:text-sm font-bold text-white">
              ${this.escapeHtml(item.evaluation.impactTitle)}
            </span>
          </div>

          <!-- Decoded Plain-English Action Strip (Immediately Scannable) -->
          <div class="text-[11px] text-slate-300 font-sans pl-1 flex items-start gap-1.5 leading-snug">
            ${item.evaluation.pilotAction ? `
              <span class="text-cyan-400 font-mono font-bold shrink-0">▸ ACTION:</span>
              <span class="text-slate-200">${this.escapeHtml(item.evaluation.pilotAction)}</span>
            ` : `
              <span class="text-slate-400 shrink-0">▸ SUMMARY:</span>
              <span class="text-slate-300">${this.escapeHtml(item.evaluation.executiveSummary || item.parsed.bodyText)}</span>
            `}
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 pt-0.5">
          ${distPill}
          ${mergedPill}
          ${item.parsed.scheduleRaw ? `<span class="hidden lg:inline text-[11px] font-mono text-amber-300/90 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800">${this.escapeHtml(item.parsed.scheduleRaw)}</span>` : ''}
          ${statusPill}
          <i data-lucide="chevron-down" class="row-chevron w-4 h-4 text-slate-400 transition-transform duration-150"></i>
        </div>
      </div>

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
          <div class="flex items-center gap-3">
            ${item.parsed.geometry ? `<button type="button" class="btn-zoom-map text-emerald-400 hover:underline flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i> Show on Map</button>` : ''}
            <button type="button" class="btn-toggle-raw text-cyan-400 hover:underline flex items-center gap-1">
              <i data-lucide="code" class="w-3.5 h-3.5"></i> Raw ICAO Text
            </button>
          </div>
        </div>

        <div class="raw-notam-box hidden">
          <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed select-all">${this.escapeHtml(item.parsed.raw)}</pre>
        </div>
      </div>
    `;

    const headerBtn = wrapper.querySelector('.notam-row-header');
    const detailsBox = wrapper.querySelector('.notam-row-details');
    const rawBtn = wrapper.querySelector('.btn-toggle-raw');
    const rawBox = wrapper.querySelector('.raw-notam-box');
    const rowMapBtn = wrapper.querySelector('.btn-row-map');
    const zoomMapBtn = wrapper.querySelector('.btn-zoom-map');

    headerBtn.addEventListener('click', (e) => {
      if (e.target.closest('.btn-row-map')) return;
      const isHidden = detailsBox.classList.contains('hidden');
      detailsBox.classList.toggle('hidden', !isHidden);
      wrapper.classList.toggle('expanded', isHidden);
    });

    if (rowMapBtn) {
      rowMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.flyToNotamOnMap(globalIndex);
      });
    }

    if (zoomMapBtn) {
      zoomMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.flyToNotamOnMap(globalIndex);
      });
    }

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
          text += `• ⚠️ SIGMET (${s.fir} #${s.number}): ${s.phenomenon} ${s.flRange || ''}\n`;
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

    text += `\n🟡 CAUTION & TERMINAL NOTES:\n`;
    if (cautions.length === 0) {
      text += `• Normal G650ER operations\n`;
    } else {
      cautions.forEach(c => {
        const dist = c.parsed.distanceBadge ? ` (${c.parsed.distanceBadge})` : '';
        text += `• [${c.parsed.icao}] ${c.evaluation.impactTitle}${dist}\n`;
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
    this.elements.btnExecuteFetch.disabled = true;
    try {
      this.elements.fetchModal.classList.add('hidden');
      this.elements.setupDrawer.classList.add('hidden');
      await this.fetchLiveWebWeather();
    } finally {
      this.elements.btnExecuteFetch.disabled = false;
    }
  }

  // ===========================================================================
  // JEPPESEN AIRWAY MANUAL COMPLIANCE & BRIEFING MODULE (5 SUB-MODULES)
  // ===========================================================================
  async initJeppesenModule() {
    // Render Active Flight Brief button + Global Compliance Scenario buttons
    if (this.elements.jeppScenarioButtons) {
      this.renderJeppesenScenarioButtons();

      this.elements.jeppScenarioButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('.jepp-scenario-btn');
        if (!btn) return;
        const scId = btn.getAttribute('data-jepp-scenario');

        if (scId === 'active-brief') {
          this.isCustomScenarioOverride = false;
          const dep = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : 'SBJH').toUpperCase().trim();
          const arr = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();
          const alt = (this.elements.inputAltIcao ? this.elements.inputAltIcao.value : '').toUpperCase().trim();
          const inferredFirs = this.jeppesenEngine.inferDefaultFirsForBriefing(dep, arr, alt, this.currentBriefing);
          const firStr = inferredFirs.join(' ');
          if (this.elements.inputRouteFirs) this.elements.inputRouteFirs.value = firStr;
          if (this.elements.jeppInlineFirs) this.elements.jeppInlineFirs.value = firStr;
          this.activeScenarioExtraIcaos = [
            dep,
            arr,
            ...(alt ? [alt] : []),
            ...((this.currentBriefing && this.currentBriefing.enrouteIcaos) || [])
          ].filter((v, i, a) => v && a.indexOf(v) === i);
          if (this.elements.jeppShowGlobalNcn) this.elements.jeppShowGlobalNcn.checked = false;
          this.renderJeppesenComplianceDeck();
          this.showToast(`Synced Jeppesen Compliance to Active Flight Brief (${dep} ➔ ${arr})`);
          return;
        }

        const sc = GLOBAL_COMPLIANCE_SCENARIOS.find(s => s.id === scId);
        if (!sc) return;

        this.isCustomScenarioOverride = true;
        if (this.elements.inputRouteFirs) this.elements.inputRouteFirs.value = sc.firs;
        if (this.elements.jeppInlineFirs) this.elements.jeppInlineFirs.value = sc.firs;
        this.activeScenarioExtraIcaos = sc.extraIcaos || [];
        this.renderJeppesenComplianceDeck();
        this.showToast(`Loaded Jeppesen Reference Corridor: ${sc.label}`);
      });
    }

    // Sync Route FIR inputs between Setup Drawer & Jeppesen Deck
    if (this.elements.inputRouteFirs) {
      this.elements.inputRouteFirs.addEventListener('change', () => {
        if (this.elements.jeppInlineFirs) {
          this.elements.jeppInlineFirs.value = this.elements.inputRouteFirs.value.toUpperCase();
        }
        this.renderJeppesenComplianceDeck();
      });
    }

    if (this.elements.btnJeppApplyFirs && this.elements.jeppInlineFirs) {
      const applyInlineFirs = () => {
        const val = this.elements.jeppInlineFirs.value.toUpperCase().trim();
        if (this.elements.inputRouteFirs) this.elements.inputRouteFirs.value = val;
        this.renderJeppesenComplianceDeck();
      };
      this.elements.btnJeppApplyFirs.addEventListener('click', applyInlineFirs);
      this.elements.jeppInlineFirs.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyInlineFirs();
      });
    }

    // Sync Avionics Capabilities checkboxes between Setup Drawer & Inline Bar
    const capMap = [
      { drawerEl: this.elements.capFans1a, key: 'fans1a' },
      { drawerEl: this.elements.capAtnb1, key: 'atnB1' },
      { drawerEl: this.elements.capAdsb, key: 'adsbOut' },
      { drawerEl: this.elements.capRnp, key: 'rnp4_10' },
      { drawerEl: this.elements.capHudEfvs, key: 'hudEfvs' }
    ];

    capMap.forEach(({ drawerEl, key }) => {
      const inlineEl = document.querySelector(`[data-jepp-cap="${key}"]`);
      if (drawerEl) {
        drawerEl.addEventListener('change', () => {
          if (inlineEl) inlineEl.checked = drawerEl.checked;
          if (key === 'hudEfvs' && this.elements.aomLvtoHud) {
            this.elements.aomLvtoHud.checked = drawerEl.checked;
          }
          this.renderJeppesenComplianceDeck();
        });
      }
      if (inlineEl) {
        inlineEl.addEventListener('change', () => {
          if (drawerEl) drawerEl.checked = inlineEl.checked;
          if (key === 'hudEfvs' && this.elements.aomLvtoHud) {
            this.elements.aomLvtoHud.checked = inlineEl.checked;
          }
          this.renderJeppesenComplianceDeck();
        });
      }
    });

    // ADIZ Delay Slider & Show All ADIZ Toggle
    if (this.elements.jeppAdizDelaySlider) {
      this.elements.jeppAdizDelaySlider.addEventListener('input', (e) => {
        const mins = Number(e.target.value) || 0;
        if (this.elements.jeppAdizDelayLabel) {
          this.elements.jeppAdizDelayLabel.textContent = `+${mins} min`;
        }
        this.renderJeppesenComplianceDeck();
      });
    }
    if (this.elements.jeppShowAllAdiz) {
      this.elements.jeppShowAllAdiz.addEventListener('change', () => this.renderJeppesenComplianceDeck());
    }

    // Dynamic AOM Calculator Toggles & Inputs
    const aomControls = [
      this.elements.aomLvtoRegime,
      this.elements.aomLvpActive,
      this.elements.aomLvtoHirl,
      this.elements.aomLvtoCl,
      this.elements.aomLvtoRclm,
      this.elements.aomLvtoHud,
      this.elements.aomAppType,
      this.elements.aomAppDh,
      this.elements.aomDegAlsOut,
      this.elements.aomDegTdzOut,
      this.elements.aomDegNofd,
      this.elements.aomDegObstacles,
      this.elements.aomDegEfvs
    ];

    aomControls.forEach(ctrl => {
      if (!ctrl) return;
      ctrl.addEventListener('change', () => {
        if (ctrl === this.elements.aomAppType && this.elements.aomAppDh) {
          const defaultDhs = {
            ILS_CAT_II: 100,
            ILS_CAT_I: 200,
            RNP_LPV: 250,
            RNP_LNAV_VNAV: 300,
            NPA_2D_CDFA: 350,
            NPA_2D_STEPDOWN: 400
          };
          this.elements.aomAppDh.value = defaultDhs[this.elements.aomAppType.value] || 200;
        }
        this.renderAomCalculator();
      });
    });

    if (this.elements.btnJeppSyncDestNotams) {
      this.elements.btnJeppSyncDestNotams.addEventListener('click', () => {
        this.syncDestinationNotamDowngrades(true);
      });
    }

    // CCN / NCN Global Watchlist Toggle
    if (this.elements.jeppShowGlobalNcn) {
      this.elements.jeppShowGlobalNcn.addEventListener('change', () => this.renderJeppesenComplianceDeck());
    }

    // Load the 4 structured JSON files from ./data/*.json
    await this.jeppesenEngine.loadData();

    // Re-sync FIRs for the active flight briefing now that fir_rules.json & aerodrome_notices.json are loaded
    if (!this.isCustomScenarioOverride) {
      const dep = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : 'SBJH').toUpperCase().trim();
      const arr = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();
      const alt = (this.elements.inputAltIcao ? this.elements.inputAltIcao.value : '').toUpperCase().trim();
      const inferredFirs = this.jeppesenEngine.inferDefaultFirsForBriefing(dep, arr, alt, this.currentBriefing);
      const firStr = inferredFirs.join(' ');
      if (this.elements.inputRouteFirs) this.elements.inputRouteFirs.value = firStr;
      if (this.elements.jeppInlineFirs) this.elements.jeppInlineFirs.value = firStr;
    }

    this.renderJeppesenComplianceDeck();
  }

  renderJeppesenScenarioButtons() {
    if (!this.elements.jeppScenarioButtons) return;
    const dep = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : 'SBJH').toUpperCase().trim();
    const arr = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();
    const activeBriefBtn = `
      <button type="button" data-jepp-scenario="active-brief" title="Sync all 5 Jeppesen modules to the active Flight Brief PDF (${dep} ➔ ${arr})"
              class="jepp-scenario-btn text-[11px] px-2.5 py-1 rounded-lg font-mono transition border ${
                !this.isCustomScenarioOverride
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60 font-bold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }">
        ✈ Active Flight Brief (${dep} ➔ ${arr})
      </button>
    `;

    const refButtons = GLOBAL_COMPLIANCE_SCENARIOS.map((sc) => `
      <button type="button" data-jepp-scenario="${sc.id}" data-firs="${sc.firs}" title="${sc.description}"
              class="jepp-scenario-btn text-[11px] px-2.5 py-1 rounded-lg font-mono transition border bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700">
        ${sc.label}
      </button>
    `).join('');

    this.elements.jeppScenarioButtons.innerHTML = activeBriefBtn + refButtons;
  }

  getCapabilitiesState() {
    return {
      fans1a: this.elements.capFans1a ? this.elements.capFans1a.checked : true,
      atnB1: this.elements.capAtnb1 ? this.elements.capAtnb1.checked : true,
      adsbOut: this.elements.capAdsb ? this.elements.capAdsb.checked : true,
      rnp4_10: this.elements.capRnp ? this.elements.capRnp.checked : true,
      hudEfvs: this.elements.capHudEfvs ? this.elements.capHudEfvs.checked : true
    };
  }

  syncJeppesenScenarioHighlight(firStr) {
    const clean = (firStr || '').toUpperCase().trim().replace(/\s+/g, ' ');
    document.querySelectorAll('.jepp-scenario-btn').forEach(btn => {
      const btnFirs = (btn.getAttribute('data-firs') || '').toUpperCase().trim().replace(/\s+/g, ' ');
      if (btnFirs && btnFirs === clean) {
        btn.classList.add('border-cyan-500/60', 'bg-cyan-500/15', 'text-cyan-200');
      } else {
        btn.classList.remove('border-cyan-500/60', 'bg-cyan-500/15', 'text-cyan-200');
      }
    });
  }

  syncDestinationNotamDowngrades(showFeedback = false) {
    const arrIcao = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();
    const rawNotams = (this.evaluatedNotams || []).map(it => ({
      ...it.parsed,
      isActiveInWindow: it.isActiveInWindow
    }));

    const deg = this.jeppesenEngine.detectNotamApproachDegradations(arrIcao, rawNotams);
    if (this.elements.aomDegAlsOut) this.elements.aomDegAlsOut.checked = deg.alsOut;
    if (this.elements.aomDegTdzOut) this.elements.aomDegTdzOut.checked = deg.tdzClOut;
    if (this.elements.aomDegObstacles) this.elements.aomDegObstacles.checked = deg.visualObstacles;
    if (deg.gsOut && this.elements.aomAppType) {
      this.elements.aomAppType.value = 'NPA_2D_CDFA';
      if (this.elements.aomAppDh) this.elements.aomAppDh.value = 380;
    } else if (!deg.gsOut && this.elements.aomAppType) {
      this.elements.aomAppType.value = 'ILS_CAT_I';
      if (this.elements.aomAppDh) this.elements.aomAppDh.value = 200;
    }

    this.renderAomCalculator();
    if (showFeedback) {
      if (deg.summaryNotes.length > 0) {
        this.showToast(`Synced ${deg.summaryNotes.length} active NOTAM downgrade(s) for ${arrIcao}`);
      } else {
        this.showToast(`No ALS/GS/TDZ NOTAM downgrades active at ${arrIcao} — Standard CAT I minimums set`);
      }
    }
  }

  renderJeppesenComplianceDeck() {
    if (!this.jeppesenEngine) return;

    this.renderJeppesenScenarioButtons();

    const depIcao = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : 'SBJH').toUpperCase().trim();
    const arrIcao = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();
    const altIcao = (this.elements.inputAltIcao ? this.elements.inputAltIcao.value : 'SBFI').toUpperCase().trim();

    let rawFirs = (this.elements.inputRouteFirs ? this.elements.inputRouteFirs.value : '').toUpperCase().trim();
    if (!this.isCustomScenarioOverride) {
      const inferredFirs = this.jeppesenEngine.inferDefaultFirsForBriefing(
        depIcao,
        arrIcao,
        altIcao,
        this.currentBriefing
      );
      if (inferredFirs && (!rawFirs || (rawFirs === 'SBCW SGFA' && (depIcao !== 'SBJH' || arrIcao !== 'SGAS')))) {
        rawFirs = inferredFirs;
        if (this.elements.inputRouteFirs) this.elements.inputRouteFirs.value = inferredFirs;
        if (this.elements.jeppInlineFirs) this.elements.jeppInlineFirs.value = inferredFirs;
      }
      this.activeScenarioExtraIcaos = this.currentBriefing ? [
        depIcao,
        arrIcao,
        altIcao,
        ...(this.currentBriefing.altIcaos || []),
        ...(this.currentBriefing.enrouteIcaos || [])
      ].filter(Boolean) : [depIcao, arrIcao, altIcao].filter(Boolean);
    }

    const eobtUtc = this.getUtcFromInput(this.elements.inputDepTime);
    const etaUtc = this.getUtcFromInput(this.elements.inputArrTime);
    const caps = this.getCapabilitiesState();

    const routeFirs = this.jeppesenEngine.resolveRouteFirs(depIcao, arrIcao, altIcao, rawFirs, this.currentBriefing);

    // -------------------------------------------------------------------------
    // 0. Render Active Flight Brief Context Banner (#jepp-active-flight-banner)
    // -------------------------------------------------------------------------
    if (this.elements.jeppActiveFlightBanner) {
      const depMeta = AIRPORT_COORDS_DB[depIcao];
      const arrMeta = AIRPORT_COORDS_DB[arrIcao];
      const altMeta = AIRPORT_COORDS_DB[altIcao];
      const enrouteList = (this.currentBriefing?.enrouteIcaos || []).filter(c => ![depIcao, arrIcao, altIcao].includes(c));
      const totalNotams = (this.evaluatedNotams || []).length;
      const totalMetars = (this.currentBriefing?.metars || []).length;
      const totalSigmets = (this.currentBriefing?.sigmets || []).length;
      const eobtStr = eobtUtc && !isNaN(eobtUtc.getTime()) ? `${String(eobtUtc.getUTCHours()).padStart(2, '0')}:${String(eobtUtc.getUTCMinutes()).padStart(2, '0')}Z` : '--:--Z';
      const etaStr = etaUtc && !isNaN(etaUtc.getTime()) ? `${String(etaUtc.getUTCHours()).padStart(2, '0')}:${String(etaUtc.getUTCMinutes()).padStart(2, '0')}Z` : '--:--Z';

      this.elements.jeppActiveFlightBanner.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono text-xs font-extrabold">
              ACTIVE FLIGHT BRIEF: ${depIcao} ➔ ${arrIcao}${altIcao ? ` (ALT ${altIcao})` : ''}
            </span>
            <span class="text-xs text-slate-300 font-medium">
              ${depMeta ? depMeta.name : depIcao} ➔ ${arrMeta ? arrMeta.name : arrIcao}${altIcao ? ` • Alternate: ${altMeta ? altMeta.name : altIcao}` : ''}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span class="px-2 py-0.5 rounded bg-slate-900 text-amber-300 border border-slate-700">FIRs: ${routeFirs.join(' ➔ ')}</span>
            <span class="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">EOBT ${eobtStr} • ETA ${etaStr}</span>
            <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">${totalNotams} NOTAMs • ${totalMetars} METARs • ${totalSigmets} SIGMETs</span>
            ${enrouteList.length > 0 ? `<span class="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-700">En-Route: ${enrouteList.slice(0, 6).join(', ')}</span>` : ''}
          </div>
        </div>
      `;
    }

    // -------------------------------------------------------------------------
    // 1. Evaluate Enroute & CNS Compliance Engine
    // -------------------------------------------------------------------------
    const cns = this.jeppesenEngine.evaluateEnrouteCns(
      routeFirs,
      caps,
      eobtUtc,
      rawFirs,
      this.evaluatedNotams,
      this.currentBriefing
    );

    const hasCnsDeficit =
      cns.cpdlcTimeline.some(c => c.equipmentStatus === 'DEFICIT') ||
      cns.pbnValidators.some(p => p.status !== 'COMPLIANT');

    if (this.elements.jeppCnsStatusBadge) {
      if (hasCnsDeficit) {
        this.elements.jeppCnsStatusBadge.textContent = 'ACTION REQUIRED: CNS / PBN / NOTAM ALERT';
        this.elements.jeppCnsStatusBadge.className = 'px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
      } else {
        this.elements.jeppCnsStatusBadge.textContent = `G650ER CNS & PBN VERIFIED (${routeFirs.join(' ➔ ')})`;
        this.elements.jeppCnsStatusBadge.className = 'px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      }
    }

    if (this.elements.jeppCpdlcTimelineContainer) {
      this.elements.jeppCpdlcTimelineContainer.innerHTML = `
        <table class="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr class="border-b border-slate-800 text-[10px] text-slate-400 uppercase bg-slate-950/60">
              <th class="py-2 px-3">FIR</th>
              <th class="py-2 px-3">Logon ID</th>
              <th class="py-2 px-3">System Type</th>
              <th class="py-2 px-3">ADS-C</th>
              <th class="py-2 px-3">Logon Timing Trigger</th>
              <th class="py-2 px-3">Computed UTC Window</th>
              <th class="py-2 px-3">G650ER Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/70">
            ${cns.cpdlcTimeline.map(row => {
              const badgeCls = row.equipmentStatus === 'DEFICIT'
                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
              return `
                <tr class="hover:bg-slate-900/50 transition">
                  <td class="py-2.5 px-3">
                    <span class="font-bold text-white">${row.firCode}</span>
                    <span class="block text-[10px] text-slate-400 font-sans">${row.firName}</span>
                  </td>
                  <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">${row.logonId}</span>
                  </td>
                  <td class="py-2.5 px-3 text-slate-200">${row.systemType} <span class="text-[10px] text-slate-400 block">${row.minFlightLevel || ''}</span></td>
                  <td class="py-2.5 px-3">
                    ${row.adsC
                      ? '<span class="text-emerald-400 font-bold">ACTIVE</span>'
                      : '<span class="text-slate-500">N/A</span>'}
                  </td>
                  <td class="py-2.5 px-3 text-slate-300 font-sans text-[11px] max-w-xs">
                    ${row.logonTiming}
                    ${row.notes ? `<span class="block text-[10px] text-slate-400 mt-0.5">${row.notes}</span>` : ''}
                  </td>
                  <td class="py-2.5 px-3 text-amber-300 font-bold whitespace-nowrap">${row.computedWindowUtc}</td>
                  <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded border text-[10px] font-bold ${badgeCls}">${row.equipmentStatus}</span>
                    <span class="block text-[10px] text-slate-400 font-sans mt-0.5">${row.equipmentNote}</span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    if (this.elements.jeppPbnValidatorContainer) {
      this.elements.jeppPbnValidatorContainer.innerHTML = cns.pbnValidators.map(p => {
        const borderCls = p.status === 'CRITICAL'
          ? 'border-red-500/50 bg-red-500/10'
          : (p.status === 'WARNING' ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-800 bg-slate-950/60');
        const pillCls = p.status === 'CRITICAL'
          ? 'bg-red-500/20 text-red-300 border-red-500/40'
          : (p.status === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30');
        return `
          <div class="p-3 rounded-xl border ${borderCls} space-y-1.5 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="font-mono font-bold text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700">${p.firCode}</span>
                <span class="font-semibold text-slate-200">${p.rnpRequired}</span>
              </div>
              <span class="px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${pillCls}">${p.status}</span>
            </div>
            <p class="text-[11px] text-slate-400">${p.adsBNote}</p>
            <div class="text-[11px] font-mono text-cyan-300">Separation: ${p.lateralSeparation}</div>
            <ul class="space-y-1 pt-1 border-t border-slate-800/80 text-[11px] text-slate-200">
              ${p.actionItems.map(act => `<li class="flex items-start gap-1.5"><span class="text-amber-400">▸</span><span>${act}</span></li>`).join('')}
            </ul>
          </div>
        `;
      }).join('');
    }

    if (this.elements.jeppSpecialAlertsContainer) {
      if (cns.specialAlerts.length === 0) {
        this.elements.jeppSpecialAlertsContainer.innerHTML = `
          <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 font-mono">
            No special IFBP 126.9, Nicosia relay, or oceanic SLOP mandates active for these FIRs.
          </div>
        `;
      } else {
        const colorMap = {
          amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
          red: 'border-red-500/40 bg-red-500/10 text-red-300',
          cyan: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
          purple: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
          emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
        };
        this.elements.jeppSpecialAlertsContainer.innerHTML = cns.specialAlerts.map(al => {
          const cls = colorMap[al.badgeColor] || colorMap.cyan;
          return `
            <div class="p-3 rounded-xl border ${cls} space-y-1.5 text-xs">
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-950/80 border border-current">${al.category}</span>
                <span class="font-mono text-[11px] font-bold">${al.firCode} FIR</span>
              </div>
              <div class="font-bold text-white text-xs">${al.title}</div>
              <p class="text-[11px] text-slate-300 leading-relaxed">${al.detail}</p>
              <ul class="space-y-1 pt-1 text-[11px] text-slate-200 font-mono">
                ${(al.triggers || []).map(t => `<li class="flex items-start gap-1.5"><span class="text-amber-400">•</span><span>${t}</span></li>`).join('')}
              </ul>
            </div>
          `;
        }).join('');
      }
    }

    // -------------------------------------------------------------------------
    // 2. Evaluate ADIZ & Defense Clearance Tracker
    // -------------------------------------------------------------------------
    const delayMin = this.elements.jeppAdizDelaySlider ? Number(this.elements.jeppAdizDelaySlider.value) || 0 : 0;
    const showAllAdiz = this.elements.jeppShowAllAdiz ? this.elements.jeppShowAllAdiz.checked : false;
    const extraAdiz = showAllAdiz
      ? ['INDIA', 'PAKISTAN', 'IRAN', 'BANGLADESH', 'SRI_LANKA', 'CANADA', 'US_ALASKA', 'BRAZIL_BORDER']
      : [];

    const adizCards = this.jeppesenEngine.evaluateAdizTracker(
      routeFirs,
      depIcao,
      arrIcao,
      eobtUtc,
      delayMin,
      extraAdiz,
      this.evaluatedNotams,
      this.currentBriefing
    );

    if (this.elements.jeppAdizCardsContainer) {
      if (adizCards.length === 0) {
        this.elements.jeppAdizCardsContainer.innerHTML = `
          <div class="md:col-span-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
            <span class="text-slate-300">No sovereign ADIZ penetration or Restricted Airspace NOTAMs detected along ${depIcao} ➔ ${arrIcao} (${routeFirs.join(' ➔ ')}).</span>
            <span class="text-[11px] font-mono text-amber-400">Toggle "Show All Global ADIZ Rules" above to inspect India/Pakistan/Iran/Bangladesh/Canada windows</span>
          </div>
        `;
      } else {
        this.elements.jeppAdizCardsContainer.innerHTML = adizCards.map(card => {
          const isExpired = card.status === 'EXPIRED_REAPPLY';
          const borderCls = isExpired
            ? 'border-red-500/60 bg-red-500/10'
            : 'border-slate-800 bg-slate-950/70';
          const statusCls = isExpired
            ? 'bg-red-500/25 text-red-200 border-red-500/50'
            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
          const chk = card.inFlightCheckIn || {};
          return `
            <div class="p-4 rounded-xl border ${borderCls} space-y-2.5 text-xs">
              <div class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div>
                  <span class="text-[10px] font-mono font-bold uppercase text-amber-400">${card.regionKey} ADIZ</span>
                  <h4 class="font-bold text-white text-sm">${card.name}</h4>
                </div>
                <span class="px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${statusCls}">
                  ${card.statusBadgeText}
                </span>
              </div>

              <div class="grid grid-cols-3 gap-2 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                <div>
                  <span class="text-slate-400 block text-[10px]">FILED EOBT</span>
                  <strong class="text-white">${card.eobtUtcStr}</strong>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px]">ADC VALID WINDOW</span>
                  <strong class="text-amber-300">${card.windowStartUtcStr} – ${card.windowEndUtcStr}</strong>
                  <span class="block text-[9px] text-slate-400">(${card.windowLabel})</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px]">SIMULATED ETD (+${card.simulatedDelayMin}m)</span>
                  <strong class="${isExpired ? 'text-red-400' : 'text-emerald-400'}">${card.actualDepUtcStr}</strong>
                </div>
              </div>

              <p class="text-[11px] text-slate-300 leading-relaxed">${card.ruleText}</p>

              <div class="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 space-y-1">
                <div class="flex items-center justify-between text-[11px] font-mono font-bold text-cyan-300">
                  <span>IN-FLIGHT RADIO CHECK-IN TRIGGER</span>
                  <span>${chk.leadDistanceNm ? `${chk.leadDistanceNm} NM PRIOR` : `${chk.leadTimeMinutes || 10} MIN PRIOR`}</span>
                </div>
                <div class="text-[11px] text-slate-200">
                  <strong>Station:</strong> ${chk.station || 'FIC / ACC'} • <strong>Freq:</strong> <span class="font-mono text-amber-300">${(chk.frequencies || []).join(' / ')}</span>
                </div>
                <div class="text-[11px] text-slate-300">${chk.tolerance || ''}</div>
              </div>

              <div class="text-[10px] font-mono text-red-300/90 flex items-start gap-1.5">
                <span class="text-red-400 font-bold">⚠️</span>
                <span>${card.interceptionWarning}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // -------------------------------------------------------------------------
    // 3. Render Dynamic Aerodrome Operating Minimums (AOM) Calculator
    // -------------------------------------------------------------------------
    this.renderAomCalculator();

    // -------------------------------------------------------------------------
    // 4. Evaluate Chart & NavData Change Notice (CCN/NCN) Scanner
    // -------------------------------------------------------------------------
    const includeGlobalNcn = this.elements.jeppShowGlobalNcn ? this.elements.jeppShowGlobalNcn.checked : false;
    const scanIcaos = [
      depIcao,
      arrIcao,
      altIcao,
      ...(this.activeScenarioExtraIcaos || [])
    ];
    const aeroNotices = this.jeppesenEngine.scanAerodromeNotices(
      scanIcaos,
      includeGlobalNcn,
      this.evaluatedNotams,
      this.currentBriefing,
      AIRPORT_COORDS_DB
    );

    if (this.elements.jeppCcnNcnContainer) {
      this.elements.jeppCcnNcnContainer.innerHTML = aeroNotices.map(station => {
        const isPrimary = [depIcao, arrIcao, altIcao].includes(station.icao);
        const roleBadge = station.icao === depIcao
          ? '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold">DEPARTURE</span>'
          : (station.icao === arrIcao
            ? '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">DESTINATION</span>'
            : (station.icao === altIcao
              ? '<span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold">ALTERNATE</span>'
              : '<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono">EN-ROUTE / WATCHLIST</span>'));

        const fmsBadge = station.hasFmsDiscrepancy
          ? '<span class="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-mono font-bold">FMS NAVDATA DISCREPANCY</span>'
          : '';

        const allItems = [...(station.ncnNotices || []), ...(station.ccnNotices || [])];

        return `
          <div class="p-4 rounded-xl border ${isPrimary ? 'border-cyan-500/40 bg-slate-950/90' : 'border-slate-800 bg-slate-950/60'} space-y-2.5 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-mono font-extrabold text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700">${station.icao}</span>
                <div>
                  <div class="font-bold text-slate-200">${station.name}</div>
                  <div class="text-[10px] font-mono text-slate-400">${station.country} • FIR ${station.fir}</div>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                ${roleBadge}
                ${fmsBadge}
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <div>
                <span class="text-slate-400 block text-[10px]">DCL / CLEARANCE AFTN LOGON</span>
                <span class="text-cyan-300 font-bold">${station.dclAftn || 'VHF Voice Delivery'}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">G650ER WINGSPAN (30.36m / 99\'7")</span>
                <span class="${station.wingspanLimitM < 30.36 ? 'text-red-400 font-bold' : 'text-emerald-300'}">${station.g650erWingspanStatus}</span>
              </div>
            </div>

            <div class="space-y-2">
              ${allItems.map(item => {
                const isCrit = item.severity === 'CRITICAL';
                const itemCls = isCrit
                  ? 'border-red-500/40 bg-red-500/10'
                  : (item.severity === 'WARNING' ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-800 bg-slate-900/60');
                return `
                  <div class="p-2.5 rounded-lg border ${itemCls} space-y-1">
                    <div class="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <span class="font-bold ${isCrit ? 'text-red-300' : 'text-amber-300'}">[${item.type}${item.cycle ? ' ' + item.cycle : ''}] ${item.title}</span>
                      ${item.fmsDiscrepancy ? '<span class="px-1.5 py-0.2 rounded bg-red-500/30 text-red-200 font-bold">DO NOT USE IN FMS</span>' : ''}
                    </div>
                    <p class="text-[11px] text-slate-300 leading-relaxed">${item.detail}</p>
                  </div>
                `;
              }).join('')}
            </div>

            ${station.taxiRestrictions ? `
              <div class="text-[11px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                <strong class="text-slate-300 font-mono">Ground / Taxi:</strong> ${station.taxiRestrictions}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    // -------------------------------------------------------------------------
    // 5. Render SSR Transponder & Contingency Quick-Card
    // -------------------------------------------------------------------------
    const ssrData = this.jeppesenEngine.getSsrContingencyCards(
      routeFirs,
      this.evaluatedNotams,
      this.currentBriefing
    );

    if (this.elements.jeppSsrRouteCards) {
      this.elements.jeppSsrRouteCards.innerHTML = ssrData.firCards.map(card => `
        <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <span class="font-mono font-extrabold text-white text-sm">${card.firCode}</span>
              <span class="text-[11px] text-slate-400 block">${card.firName}</span>
            </div>
            <div class="text-right font-mono">
              <span class="text-[10px] text-slate-400 block">UNCONTROLLED / VFR</span>
              <span class="text-sm font-extrabold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">${card.uncontrolledVfrSquawk}</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-300 leading-relaxed">
            <strong class="text-cyan-400 font-mono">Transponder Failure Rule:</strong> ${card.transponderFailureRule}
          </div>
        </div>
      `).join('');
    }

    if (this.elements.jeppSsrGlobalTable) {
      this.elements.jeppSsrGlobalTable.innerHTML = `
        <table class="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr class="border-b border-slate-800 text-[10px] text-slate-400 uppercase bg-slate-950/60">
              <th class="py-2 px-3">Squawk Code</th>
              <th class="py-2 px-3">Applicable FIRs / States (Jeppesen SSR Tables)</th>
              <th class="py-2 px-3">Operational Rule</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/70">
            ${ssrData.globalQuickTable.map(r => `
              <tr class="hover:bg-slate-900/40">
                <td class="py-2 px-3">
                  <span class="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">${r.code}</span>
                </td>
                <td class="py-2 px-3 text-slate-200 font-sans text-[11px]">${r.regions}</td>
                <td class="py-2 px-3 text-slate-400 font-sans text-[11px]">${r.usage}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // -------------------------------------------------------------------------
    // 6. Update Flight Brief Summary Strip (#brief-jeppesen-summary-grid)
    // -------------------------------------------------------------------------
    if (this.elements.briefJeppesenSummaryGrid) {
      const primaryCpdlc = cns.cpdlcTimeline.find(c => c.available) || cns.cpdlcTimeline[0];
      const primaryAdiz = adizCards[0];
      const fmsDiscrepancyCount = aeroNotices.filter(a => a.hasFmsDiscrepancy).length;
      const aomSnap = this.getCurrentAomResult();

      const topNoticeItem = aeroNotices
        .flatMap(st => [...(st.ncnNotices || []), ...(st.ccnNotices || [])].map(n => `${st.icao}: ${n.title}`))
        .find(Boolean) || `${depIcao} ➔ ${arrIcao} Charts & NavData Verified`;

      this.elements.briefJeppesenSummaryGrid.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div class="flex items-center justify-between text-[10px] font-mono text-cyan-400 font-bold">
            <span>1. CPDLC / CNS LOGON</span>
            <span>${routeFirs.join(' ➔ ')}</span>
          </div>
          <div class="text-xs font-bold text-white font-mono">
            ${primaryCpdlc ? `${primaryCpdlc.logonId} (${primaryCpdlc.systemType})` : 'VHF Voice'}
          </div>
          <div class="text-[11px] text-slate-400 truncate">${primaryCpdlc ? primaryCpdlc.logonTiming : ''}</div>
        </div>

        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div class="flex items-center justify-between text-[10px] font-mono text-amber-400 font-bold">
            <span>2. ADIZ / DEFENSE TRACKER</span>
            <span>${primaryAdiz ? primaryAdiz.regionKey : 'CLEAR'}</span>
          </div>
          <div class="text-xs font-bold text-white font-mono">
            ${primaryAdiz ? `Window ${primaryAdiz.windowStartUtcStr}–${primaryAdiz.windowEndUtcStr}` : 'No Sovereign ADC Required'}
          </div>
          <div class="text-[11px] text-slate-400 truncate">
            ${primaryAdiz ? `Check-in ${primaryAdiz.inFlightCheckIn.leadDistanceNm ? primaryAdiz.inFlightCheckIn.leadDistanceNm + ' NM' : (primaryAdiz.inFlightCheckIn.leadTimeMinutes || 10) + 'm'} prior` : 'Standard FIR boundary check-in'}
          </div>
        </div>

        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div class="flex items-center justify-between text-[10px] font-mono text-emerald-400 font-bold">
            <span>3. DYNAMIC AOM (${depIcao}➔${arrIcao})</span>
            <span>${aomSnap.lvto.lvpInForce ? 'LVP ON' : 'NON-LVP FLOOR'}</span>
          </div>
          <div class="text-xs font-bold text-white font-mono">
            TO (${depIcao}): ${aomSnap.lvto.rvrM}m • APCH (${arrIcao}): ${aomSnap.approach.adjustedRvrM}m
          </div>
          <div class="text-[11px] text-slate-400 truncate">${aomSnap.approach.label} (${aomSnap.approach.dhFt} ft)</div>
        </div>

        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div class="flex items-center justify-between text-[10px] font-mono text-purple-400 font-bold">
            <span>4. CCN / NCN &amp; SSR (${depIcao}➔${arrIcao})</span>
            <span>${fmsDiscrepancyCount} FMS ALERTS</span>
          </div>
          <div class="text-xs font-bold text-white font-mono">
            ${aeroNotices.length} Stations Scanned • Squawk ${ssrData.firCards[0] ? ssrData.firCards[0].uncontrolledVfrSquawk : '2000'}
          </div>
          <div class="text-[11px] text-slate-400 truncate">${topNoticeItem}</div>
        </div>
      `;
    }

    if (window.lucide) window.lucide.createIcons();
  }

  getCurrentAomResult() {
    const config = {
      aomRegime: this.elements.aomLvtoRegime ? this.elements.aomLvtoRegime.value : 'SAM_AIC',
      lvpInForce: this.elements.aomLvpActive ? this.elements.aomLvpActive.checked : false,
      hasHirl: this.elements.aomLvtoHirl ? this.elements.aomLvtoHirl.checked : true,
      hasCl: this.elements.aomLvtoCl ? this.elements.aomLvtoCl.checked : true,
      hasRclm: this.elements.aomLvtoRclm ? this.elements.aomLvtoRclm.checked : true,
      hasHudEfvs: this.elements.aomLvtoHud ? this.elements.aomLvtoHud.checked : true,
      approachType: this.elements.aomAppType ? this.elements.aomAppType.value : 'ILS_CAT_I',
      customDhFt: this.elements.aomAppDh ? Number(this.elements.aomAppDh.value) || 200 : 200,
      alsOut: this.elements.aomDegAlsOut ? this.elements.aomDegAlsOut.checked : false,
      tdzClOut: this.elements.aomDegTdzOut ? this.elements.aomDegTdzOut.checked : false,
      noFdApToDa: this.elements.aomDegNofd ? this.elements.aomDegNofd.checked : false,
      visualSegmentObstacles: this.elements.aomDegObstacles ? this.elements.aomDegObstacles.checked : false,
      applyEfvsCredit: this.elements.aomDegEfvs ? this.elements.aomDegEfvs.checked : false
    };
    return this.jeppesenEngine.calculateDynamicAom(config);
  }

  renderAomCalculator() {
    if (!this.jeppesenEngine) return;
    const res = this.getCurrentAomResult();
    const depIcao = (this.elements.inputDepIcao ? this.elements.inputDepIcao.value : 'SBJH').toUpperCase().trim();
    const arrIcao = (this.elements.inputArrIcao ? this.elements.inputArrIcao.value : 'SGAS').toUpperCase().trim();

    const depMetar = (this.currentBriefing?.metars || []).find(m => m.station === depIcao);
    const arrMetar = (this.currentBriefing?.metars || []).find(m => m.station === arrIcao);

    const depRwyNotams = (this.evaluatedNotams || []).filter(n =>
      n.location === depIcao && (n.category === 'RUNWAY' || n.category === 'APPROACH_LIGHTING')
    );
    const arrAppNotams = (this.evaluatedNotams || []).filter(n =>
      n.location === arrIcao && (n.category === 'APPROACH_LIGHTING' || n.category === 'NAVAIDS_COMMS' || n.category === 'RUNWAY')
    );

    if (this.elements.aomLvtoResultBox) {
      const lv = res.lvto;
      this.elements.aomLvtoResultBox.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-[10px] font-mono uppercase text-slate-400 block">${depIcao} Computed Minimum Takeoff RVR</span>
            <div class="text-xl font-mono font-extrabold text-amber-400">
              RVR ${lv.rvrM} m <span class="text-sm text-slate-400 font-normal">(${lv.rvrFt} ft)</span>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold ${
            lv.floorEnforced
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
          }">
            ${lv.floorEnforced ? 'NON-LVP >=400m/550m FLOOR ENFORCED' : 'LVP CREDIT ACTIVE'}
          </span>
        </div>
        <div class="text-[11px] text-slate-200 mt-2 font-mono">${lv.ruleApplied}</div>
        ${depMetar ? `
          <div class="mt-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-cyan-300">
            <strong>${depIcao} Brief METAR (${depMetar.flightCategory || 'OBS'}):</strong> ${depMetar.raw}
          </div>
        ` : ''}
        ${depRwyNotams.length > 0 ? `
          <ul class="mt-1.5 text-[11px] font-mono text-amber-300 space-y-0.5">
            ${depRwyNotams.slice(0, 3).map(n => `<li>▸ [${depIcao} ${n.id}] ${n.summary}</li>`).join('')}
          </ul>
        ` : ''}
        ${lv.notes.length > 0 ? `
          <ul class="mt-2 pt-2 border-t border-slate-800 text-[11px] text-amber-300/90 space-y-1">
            ${lv.notes.map(n => `<li>• ${n}</li>`).join('')}
          </ul>
        ` : ''}
      `;
    }

    if (this.elements.aomAppResultBox) {
      const ap = res.approach;
      const isDegraded = ap.adjustedRvrM > ap.baseRvrM || ap.warnings.length > 0;
      this.elements.aomAppResultBox.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-[10px] font-mono uppercase text-slate-400 block">${arrIcao} ${ap.dimension} Approach Minimums • ${ap.dhOrMdaLabel}: ${ap.dhFt} ft</span>
            <div class="text-xl font-mono font-extrabold ${isDegraded ? 'text-amber-400' : 'text-emerald-400'}">
              RVR ${ap.adjustedRvrM} m <span class="text-sm text-slate-400 font-normal">(${ap.adjustedRvrFt} ft)</span>
              ${ap.adjustedRvrM !== ap.baseRvrM ? `<span class="text-xs text-slate-500 line-through ml-1">${ap.baseRvrM}m</span>` : ''}
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold ${
            isDegraded
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
          }">
            ${ap.label}
          </span>
        </div>

        ${arrMetar ? `
          <div class="mt-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-cyan-300">
            <strong>${arrIcao} Brief METAR (${arrMetar.flightCategory || 'OBS'}):</strong> ${arrMetar.raw}
          </div>
        ` : ''}

        ${arrAppNotams.length > 0 ? `
          <ul class="mt-1.5 text-[11px] font-mono text-amber-300 space-y-0.5">
            ${arrAppNotams.slice(0, 4).map(n => `<li>▸ [${arrIcao} ${n.id}] ${n.summary}</li>`).join('')}
          </ul>
        ` : ''}

        ${ap.penaltiesApplied.length > 0 ? `
          <ul class="mt-2 pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-200 space-y-1">
            ${ap.penaltiesApplied.map(p => `<li class="flex items-start gap-1.5"><span class="text-amber-400">▸</span><span>${p}</span></li>`).join('')}
          </ul>
        ` : `<div class="text-[11px] text-slate-400 mt-1.5 font-mono">Full visual &amp; non-visual aids operational at ${arrIcao} — standard chart baseline RVR (${ap.baseRvrM}m).</div>`}

        ${ap.warnings.length > 0 ? `
          <div class="mt-2.5 p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-[11px] text-red-200 space-y-1">
            ${ap.warnings.map(w => `<div><strong>⚠️</strong> ${w}</div>`).join('')}
          </div>
        ` : ''}
      `;
    }
  }
}

const bootstrapAeroBrief = () => {
  if (!window.aeroBrief) {
    window.aeroBrief = new AeroBriefApp();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapAeroBrief);
} else {
  bootstrapAeroBrief();
}
