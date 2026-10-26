/**
 * AeroBrief G650ER - Persistent Briefing Storage
 * 
 * Provides robust offline persistence for uploaded ForeFlight briefings using IndexedDB
 * with automatic fallback to localStorage and in-memory cache.
 * 
 * Solves the pilot workflow: "I normally return to the app and don't want to upload again until next flight."
 */

const DB_NAME = 'AeroBriefDB_v1';
const DB_VERSION = 1;
const STORE_NAME = 'briefings';
const KEY_LAST_BRIEFING = 'last_uploaded_briefing';
const LS_META_KEY = 'aerobrief_last_briefing_meta';
const LS_FALLBACK_KEY = 'aerobrief_last_briefing_fallback';

export class BriefingStorage {
  static _memoryCache = null;

  static isIndexedDBSupported() {
    try {
      return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  static isLocalStorageSupported() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  static openDB() {
    return new Promise((resolve, reject) => {
      if (!this.isIndexedDBSupported()) {
        return reject(new Error('IndexedDB not supported in this environment'));
      }
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error || new Error('IndexedDB open error'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Save the details from the active uploaded flight briefing
   * @param {Object} briefingData
   */
  static async saveLastBriefing(briefingData) {
    if (!briefingData || !briefingData.rawText) return false;

    const payload = {
      id: KEY_LAST_BRIEFING,
      rawText: briefingData.rawText,
      fileName: briefingData.fileName || 'Uploaded Flight Briefing',
      savedAt: briefingData.savedAt || new Date().toISOString(),
      depIcao: (briefingData.depIcao || '').toUpperCase().trim(),
      arrIcao: (briefingData.arrIcao || '').toUpperCase().trim(),
      altIcao: (briefingData.altIcao || '').toUpperCase().trim(),
      depTime: briefingData.depTime || '',
      arrTime: briefingData.arrTime || '',
      routeFirs: briefingData.routeFirs || '',
      timeBuffer: briefingData.timeBuffer || '1.5',
      aircraftCaps: briefingData.aircraftCaps || {},
      chartImages: Array.isArray(briefingData.chartImages) ? briefingData.chartImages : []
    };

    this._memoryCache = payload;

    // Save lightweight metadata in localStorage for instantaneous synchronous access
    if (this.isLocalStorageSupported()) {
      try {
        const meta = {
          fileName: payload.fileName,
          savedAt: payload.savedAt,
          depIcao: payload.depIcao,
          arrIcao: payload.arrIcao,
          altIcao: payload.altIcao,
          chartCount: payload.chartImages.length
        };
        window.localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
      } catch (e) {
        console.warn('[BriefingStorage] LocalStorage meta save note:', e);
      }
    }

    // Save full payload to IndexedDB (virtually unlimited quota for large PDFs & chart images)
    let idbSuccess = false;
    if (this.isIndexedDBSupported()) {
      try {
        const db = await this.openDB();
        idbSuccess = await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(payload);
          req.onsuccess = () => resolve(true);
          req.onerror = (err) => {
            console.warn('[BriefingStorage] IDB put failed:', err);
            resolve(false);
          };
          tx.oncomplete = () => db.close();
        });
      } catch (err) {
        console.warn('[BriefingStorage] IDB save error, falling back:', err);
      }
    }

    // Fallback: If IndexedDB didn't succeed, save to localStorage without heavy chart images
    if (!idbSuccess && this.isLocalStorageSupported()) {
      try {
        const fallback = { ...payload };
        delete fallback.chartImages; // Strip base64 images to stay well within 5MB quota
        window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(fallback));
      } catch (e) {
        console.warn('[BriefingStorage] LocalStorage fallback note:', e);
      }
    }

    return true;
  }

  /**
   * Load the details from the last uploaded flight briefing
   * @returns {Promise<Object|null>}
   */
  static async loadLastBriefing() {
    // 1. Try loading from IndexedDB first (contains complete text & rendered chart images)
    if (this.isIndexedDBSupported()) {
      try {
        const db = await this.openDB();
        const item = await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(KEY_LAST_BRIEFING);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
          tx.oncomplete = () => db.close();
        });

        if (item && item.rawText) {
          this._memoryCache = item;
          return item;
        }
      } catch (err) {
        console.warn('[BriefingStorage] IDB load note:', err);
      }
    }

    // 2. Try loading from LocalStorage fallback
    if (this.isLocalStorageSupported()) {
      try {
        const str = window.localStorage.getItem(LS_FALLBACK_KEY);
        if (str) {
          const item = JSON.parse(str);
          if (item && item.rawText) {
            this._memoryCache = item;
            return item;
          }
        }
      } catch (e) {
        console.warn('[BriefingStorage] LocalStorage load note:', e);
      }
    }

    // 3. In-memory cache fallback (e.g. for testing environments)
    if (this._memoryCache && this._memoryCache.rawText) {
      return this._memoryCache;
    }

    return null;
  }

  /**
   * Check if a saved briefing exists
   * @returns {boolean}
   */
  static hasSavedBriefing() {
    if (this._memoryCache && this._memoryCache.rawText) return true;
    if (this.isLocalStorageSupported()) {
      return !!window.localStorage.getItem(LS_META_KEY) || !!window.localStorage.getItem(LS_FALLBACK_KEY);
    }
    return false;
  }

  /**
   * Get metadata summary of the saved briefing without loading full text
   * @returns {Object|null}
   */
  static getSavedBriefingSummary() {
    if (this._memoryCache) {
      return {
        fileName: this._memoryCache.fileName,
        savedAt: this._memoryCache.savedAt,
        depIcao: this._memoryCache.depIcao,
        arrIcao: this._memoryCache.arrIcao,
        altIcao: this._memoryCache.altIcao,
        chartCount: (this._memoryCache.chartImages || []).length
      };
    }
    if (this.isLocalStorageSupported()) {
      try {
        const metaStr = window.localStorage.getItem(LS_META_KEY);
        if (metaStr) return JSON.parse(metaStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Clear the saved flight briefing from all storage layers
   */
  static async clearLastBriefing() {
    this._memoryCache = null;

    if (this.isLocalStorageSupported()) {
      try {
        window.localStorage.removeItem(LS_META_KEY);
        window.localStorage.removeItem(LS_FALLBACK_KEY);
      } catch (e) {}
    }

    if (this.isIndexedDBSupported()) {
      try {
        const db = await this.openDB();
        await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.delete(KEY_LAST_BRIEFING);
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => resolve(false);
        });
      } catch (e) {}
    }

    return true;
  }
}
