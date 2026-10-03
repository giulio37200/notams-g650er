/**
 * AeroBrief G650ER - ICAO & FAA NOTAM Parser
 * Parses raw NOTAM messages (ICAO Doc 8126 & FAA Order 7930.2)
 * Handles UTC time parsing, validity windows, schedule patterns (Field D)
 */

export class NotamParser {
  /**
   * Split a raw flight briefing text block into individual NOTAM items.
   * Handles ICAO format, FAA domestic format, and Jeppesen/ForeFlight text.
   */
  static splitNotams(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    // Normalize line endings
    const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split patterns:
    // 1. Double newlines
    // 2. ICAO NOTAM headers (e.g., "(A1234/24" or "A1234/24 NOTAMN")
    // 3. FAA NOTAM headers (e.g., "!TEB 10/012", "!FDC 4/1234")
    const splitPattern = /(?:\n\s*\n+)|(?=\n\s*(?:\([A-Z][0-9]{4}\/[0-9]{2}|[A-Z][0-9]{4}\/[0-9]{2}\s+NOTAM|![A-Z0-9]{3,4}\s+[0-9]{1,2}\/[0-9]+|![A-Z]{3,4}\s+[A-Z0-9]+\s+[0-9]{1,2}\/[0-9]+))/;
    const rawChunks = cleaned.split(splitPattern);
    const notamBlocks = [];

    for (let chunk of rawChunks) {
      if (!chunk) continue;
      chunk = chunk.trim();
      if (!chunk) continue;

      // Filter out pure section headers (e.g., "NOTAMS BRIEFING FOR...")
      if (chunk.length < 15 && !chunk.includes('RWY') && !chunk.includes('CLSD')) {
        continue;
      }
      notamBlocks.push(chunk);
    }

    return notamBlocks.length > 0 ? notamBlocks : [cleaned.trim()];
  }

  /**
   * Parse a single NOTAM text block into a structured object.
   */
  static parseNotam(text, defaultIcao = '') {
    const raw = text.trim();
    const result = {
      raw,
      id: '',
      icao: defaultIcao.toUpperCase(),
      type: 'UNKNOWN', // NOTAMN, NOTAMR, NOTAMC, FAA
      qCode: '',
      qCodeDecoded: null,
      fir: '',
      validFrom: null,
      validFromRaw: '',
      validTo: null,
      validToRaw: '',
      isPerm: false,
      isEst: false,
      scheduleRaw: '',
      bodyText: '',
      lowerLimit: '',
      upperLimit: '',
      category: 'GENERAL',
      rawFields: {}
    };

    // 1. Check for ICAO NOTAM ID (e.g. A0123/24, (A0123/24)
    const icaoIdMatch = raw.match(/(?:\(?\s*)([A-Z][0-9]{4}\/[0-9]{2})\s+(NOTAM[NRC])?/i);
    if (icaoIdMatch) {
      result.id = icaoIdMatch[1].toUpperCase();
      result.type = icaoIdMatch[2] ? icaoIdMatch[2].toUpperCase() : 'NOTAMN';
    }

    // 2. Check for FAA Domestic NOTAM ID (e.g. !TEB 10/045 or !FDC 4/1234)
    const faaIdMatch = raw.match(/!([A-Z0-9]{3,4})\s+([0-9]{1,2}\/[0-9]+|[A-Z0-9]+)/i);
    if (faaIdMatch && !result.id) {
      result.id = `!${faaIdMatch[1].toUpperCase()} ${faaIdMatch[2]}`;
      result.type = 'FAA_DOMESTIC';
      if (!result.icao) {
        result.icao = faaIdMatch[1].length === 3 ? 'K' + faaIdMatch[1].toUpperCase() : faaIdMatch[1].toUpperCase();
      }
    }

    // 3. Parse Q) line if available (ICAO format)
    const qLineMatch = raw.match(/Q\)\s*([A-Z]{4})\/([A-Z]{5})\/([A-Z\/]+)?\/([A-Z]+)?\/([A-Z]+)?\/([0-9]{3})?\/([0-9]{3})?\/([^\n\r]+)?/i);
    if (qLineMatch) {
      result.fir = qLineMatch[1].toUpperCase();
      result.qCode = qLineMatch[2].toUpperCase();
      result.lowerLimit = qLineMatch[6] || '';
      result.upperLimit = qLineMatch[7] || '';
      result.qCodeDecoded = this.decodeQCode(result.qCode);
    }

    // 4. Parse Field A) Location
    const fieldAMatch = raw.match(/A\)\s*([A-Z]{4})/i);
    if (fieldAMatch) {
      result.icao = fieldAMatch[1].toUpperCase();
    }

    // 5. Parse Field B) Valid From
    const fieldBMatch = raw.match(/B\)\s*([0-9]{10})/i);
    if (fieldBMatch) {
      result.validFromRaw = fieldBMatch[1];
      result.validFrom = this.parseUtcTimestamp(fieldBMatch[1]);
    }

    // 6. Parse Field C) Valid To
    const fieldCMatch = raw.match(/C\)\s*([0-9]{10}|PERM|EST)/i);
    if (fieldCMatch) {
      result.validToRaw = fieldCMatch[1].toUpperCase();
      if (result.validToRaw === 'PERM') {
        result.isPerm = true;
      } else if (result.validToRaw.includes('EST')) {
        result.isEst = true;
        // Parse date portion if exists
        const datePart = fieldCMatch[1].replace('EST', '').trim();
        if (datePart.length === 10) {
          result.validTo = this.parseUtcTimestamp(datePart);
        }
      } else {
        result.validTo = this.parseUtcTimestamp(fieldCMatch[1]);
      }
    }

    // 7. Parse Field D) Schedule
    const fieldDMatch = raw.match(/D\)\s*([^\n\rE\)]+)/i);
    if (fieldDMatch) {
      result.scheduleRaw = fieldDMatch[1].trim();
    }

    // 8. Parse Field E) Body Text
    const fieldEMatch = raw.match(/E\)\s*([\s\S]*?)(?=(?:\s*[FG]\)|$))/i);
    if (fieldEMatch) {
      result.bodyText = fieldEMatch[1].trim();
    } else {
      // Fallback: entire text or cleaned text
      result.bodyText = raw;
    }

    // If FAA format, parse FAA date format: YYMMDDhhmm-YYMMDDhhmm or MM/DD/YY
    if (!result.validFrom && !result.validTo) {
      const faaDates = raw.match(/([0-9]{10})\s*-\s*([0-9]{10}|PERM)/i);
      if (faaDates) {
        result.validFromRaw = faaDates[1];
        result.validFrom = this.parseUtcTimestamp(faaDates[1]);
        result.validToRaw = faaDates[2];
        if (result.validToRaw.toUpperCase() === 'PERM') {
          result.isPerm = true;
        } else {
          result.validTo = this.parseUtcTimestamp(faaDates[2]);
        }
      }
    }

    // Determine category from Q-code or content
    result.category = this.determineCategory(result);

    return result;
  }

  /**
   * Parse ICAO/FAA timestamp YYMMDDhhmm into JavaScript Date (UTC).
   */
  static parseUtcTimestamp(str) {
    if (!str || str.length < 10) return null;
    const yearPrefix = parseInt(str.substring(0, 2), 10) >= 70 ? '19' : '20';
    const year = parseInt(yearPrefix + str.substring(0, 2), 10);
    const month = parseInt(str.substring(2, 4), 10) - 1; // 0-based
    const day = parseInt(str.substring(4, 6), 10);
    const hours = parseInt(str.substring(6, 8), 10);
    const minutes = parseInt(str.substring(8, 10), 10);

    return new Date(Date.UTC(year, month, day, hours, minutes, 0));
  }

  /**
   * Format UTC Date for pilot presentation (e.g., "05 OCT 2026 14:00Z")
   */
  static formatUtc(date) {
    if (!date) return 'PERM';
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const d = new Date(date);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const mins = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${mins}Z`;
  }

  /**
   * Check if a NOTAM is active during a given flight UTC window.
   * flightUtc: Target Date (ETD or ETA in UTC)
   * bufferHours: window buffer before and after (e.g., ±2h)
   */
  static isFlightActive(notam, flightUtc, bufferHours = 2) {
    if (!flightUtc) return true; // If no time specified, assume active

    const windowStart = new Date(flightUtc.getTime() - bufferHours * 3600000);
    const windowEnd = new Date(flightUtc.getTime() + bufferHours * 3600000);

    // If permanent, it's always in effect if validFrom is in past or before window
    if (notam.isPerm) {
      if (!notam.validFrom) return true;
      return notam.validFrom <= windowEnd;
    }

    // Check basic date window overlap
    const notamStart = notam.validFrom || new Date(0);
    const notamEnd = notam.validTo || new Date(8640000000000000); // Far future if missing

    const overlapsDateRange = notamStart <= windowEnd && notamEnd >= windowStart;
    if (!overlapsDateRange) {
      return false;
    }

    // If Field D (Schedule) is present, check specific daily hours
    if (notam.scheduleRaw) {
      return this.checkScheduleOverlap(notam.scheduleRaw, windowStart, windowEnd);
    }

    return true;
  }

  /**
   * Parse Field D schedule string (e.g., "DAILY 2200-0600", "MON-FRI 0800-1600")
   */
  static checkScheduleOverlap(scheduleStr, windowStart, windowEnd) {
    const s = scheduleStr.toUpperCase().trim();

    // Match daily hours pattern (e.g. 2200-0600 or 0800-1600)
    const hoursMatch = s.match(/([0-9]{4})\s*-\s*([0-9]{4})/);
    if (!hoursMatch) return true; // Cannot parse specifics, assume active for safety

    const startH = parseInt(hoursMatch[1].substring(0, 2), 10);
    const startM = parseInt(hoursMatch[1].substring(2, 4), 10);
    const endH = parseInt(hoursMatch[2].substring(0, 2), 10);
    const endM = parseInt(hoursMatch[2].substring(2, 4), 10);

    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    // Check window start/end hours in UTC minutes of day
    const winStartMin = windowStart.getUTCHours() * 60 + windowStart.getUTCMinutes();
    const winEndMin = windowEnd.getUTCHours() * 60 + windowEnd.getUTCMinutes();

    // Over-night window (e.g., 2200 to 0600)
    if (endMinutes < startMinutes) {
      // Active if either >= 2200 OR <= 0600
      const activeStart = winStartMin >= startMinutes || winStartMin <= endMinutes;
      const activeEnd = winEndMin >= startMinutes || winEndMin <= endMinutes;
      return activeStart || activeEnd;
    } else {
      // Normal daytime window (e.g., 0800 to 1600)
      return !(winEndMin < startMinutes || winStartMin > endMinutes);
    }
  }

  /**
   * Decode ICAO 5-letter Q-Code (e.g., QMRLC -> Q + MR (Runway) + LC (Closed))
   */
  static decodeQCode(qCode) {
    if (!qCode || qCode.length < 5) return null;
    const entity = qCode.substring(1, 3);
    const status = qCode.substring(3, 5);

    const entityMap = {
      'MR': 'Runway',
      'MX': 'Taxiway',
      'MP': 'Aircraft Stands / Apron',
      'FA': 'Aerodrome',
      'IC': 'Instrument Landing System (ILS)',
      'ID': 'DME (Distance Measuring Equipment)',
      'IG': 'Glide Path (GP)',
      'IL': 'Localizer (LOC)',
      'NV': 'VOR',
      'ND': 'NDB',
      'OB': 'Obstacle',
      'LP': 'PAPI (Precision Approach Path Indicator)',
      'LA': 'Approach Lighting System (ALS)',
      'LC': 'Runway Centre Line Lights',
      'LT': 'Threshold Lights',
      'FF': 'Fire and Rescue Services (ARFF/RFFS)',
      'FU': 'Fuel / Refueling Facilities',
      'CP': 'Customs and Immigration',
      'PI': 'Instrument Approach Procedure (IAP)',
      'PD': 'Standard Instrument Departure (SID)',
      'PA': 'Standard Terminal Arrival (STAR)',
      'RT': 'Radar',
      'SP': 'Slot Allocation / PPR',
      'ST': 'Security'
    };

    const statusMap = {
      'LC': 'Closed',
      'AS': 'Unserviceable / Out of Service',
      'AU': 'Not Available',
      'AH': 'Hours of service changed',
      'CF': 'Operating frequency changed',
      'CS': 'Installed / In Service',
      'HW': 'Work in progress (WIP)',
      'XX': 'Specific condition / operating impact'
    };

    return {
      entityCode: entity,
      entityDesc: entityMap[entity] || 'Aeronautical Facility',
      statusCode: status,
      statusDesc: statusMap[status] || 'Modified Condition',
      summary: `${entityMap[entity] || entity}: ${statusMap[status] || status}`
    };
  }

  /**
   * Determine general operational category
   */
  static determineCategory(notam) {
    const text = (notam.bodyText + ' ' + notam.qCode).toUpperCase();

    if (text.includes('RWY') || text.includes('RUNWAY') || text.includes('QMR') || text.includes('TORA') || text.includes('LDA')) {
      return 'RUNWAY';
    }
    if (text.includes('TWY') || text.includes('TAXIWAY') || text.includes('TAXILANE') || text.includes('QMX') || text.includes('APRON') || text.includes('RAMP')) {
      return 'TAXIWAY_APRON';
    }
    if (text.includes('ILS') || text.includes('LOC') || text.includes('GLIDEPATH') || text.includes('QIC') || text.includes('VOR') || text.includes('DME') || text.includes('RNAV') || text.includes('RNP') || text.includes('GPS') || text.includes('RAIM')) {
      return 'NAVAID_APPROACH';
    }
    if (text.includes('FUEL') || text.includes('JET A') || text.includes('QFU') || text.includes('REFUEL')) {
      return 'FUEL';
    }
    if (text.includes('CUSTOMS') || text.includes('IMMIGRATION') || text.includes('AOE') || text.includes('PORT OF ENTRY') || text.includes('PASSPORT')) {
      return 'CUSTOMS_AOE';
    }
    if (text.includes('CURFEW') || text.includes('HOURS OF OPS') || text.includes('HR SER') || text.includes('TWR CLSD') || text.includes('AD CLSD') || text.includes('AERODROME CLSD') || text.includes('PPR') || text.includes('SLOT')) {
      return 'AIRPORT_HOURS_PPR';
    }
    if (text.includes('RFFS') || text.includes('ARFF') || text.includes('FIRE') || text.includes('RESCUE')) {
      return 'FIRE_RESCUE';
    }
    if (text.includes('LIGHT') || text.includes('PAPI') || text.includes('ALS') || text.includes('QLA') || text.includes('QLP')) {
      return 'LIGHTING';
    }
    if (text.includes('OBST') || text.includes('CRANE') || text.includes('MAST') || text.includes('TOWER')) {
      return 'OBSTACLE';
    }

    return 'GENERAL';
  }
}
