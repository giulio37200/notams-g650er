/**
 * AeroBrief G650ER - ICAO & FAA NOTAM Parser
 * Parses raw NOTAM messages (ICAO Doc 8126 & FAA Order 7930.2)
 * Handles ForeFlight briefings, Jeppesen notices, and multi-lingual notices (Portuguese, Spanish, English).
 * Handles UTC time parsing, validity windows, schedule patterns (Field D).
 */

export class NotamParser {
  /**
   * Parse a complete flight briefing document (ForeFlight, Jeppesen, or standard text).
   * Extracts flight route, times, METARs, TAFs, SIGMETs, and grouped NOTAMs.
   */
  static parseFullBriefing(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const briefing = {
      isForeflight: false,
      route: '',
      depIcao: '',
      arrIcao: '',
      depName: '',
      arrName: '',
      tailNumber: '',
      aircraftType: '',
      flightDateStr: '',
      depTimeUtcStr: '',
      arrTimeUtcStr: '',
      depTimeUtc: null,
      arrTimeUtc: null,
      metars: [],
      tafs: [],
      sigmets: [],
      sections: [],
      allNotams: []
    };

    // 1. Detect ForeFlight Header: e.g. "SBJH — SGAS (Oct 02, 2026) in N650MV (GLF6) IFR Created Oct 02 2026 1217Z"
    const headerMatch = cleaned.match(/([A-Z0-9]{4})\s*[—–-]\s*([A-Z0-9]{4})\s*\(([A-Za-z0-9\s,]+)\)\s*in\s*([A-Za-z0-9]+)\s*\(([A-Za-z0-9]+)\)/i);
    if (headerMatch) {
      briefing.isForeflight = true;
      briefing.depIcao = headerMatch[1].toUpperCase();
      briefing.arrIcao = headerMatch[2].toUpperCase();
      briefing.flightDateStr = headerMatch[3].trim();
      briefing.tailNumber = headerMatch[4].toUpperCase();
      briefing.aircraftType = headerMatch[5].toUpperCase();
      briefing.route = `${briefing.depIcao} — ${briefing.arrIcao}`;
    }

    // 2. Extract Departure & Destination times & station names
    const depMatch = cleaned.match(/Departure\s*(?:\(([0-9]{4})Z\))?:\s*([A-Z0-9]{4})\s*(?:-\s*([^\n\r]+))?/i);
    if (depMatch) {
      if (depMatch[1]) briefing.depTimeUtcStr = depMatch[1] + 'Z';
      if (!briefing.depIcao) briefing.depIcao = depMatch[2].toUpperCase();
      briefing.depName = depMatch[3] ? depMatch[3].trim() : '';
    }

    const arrMatch = cleaned.match(/Destination\s*(?:\(([0-9]{4})Z\))?:\s*([A-Z0-9]{4})\s*(?:-\s*([^\n\r]+))?/i);
    if (arrMatch) {
      if (arrMatch[1]) briefing.arrTimeUtcStr = arrMatch[1] + 'Z';
      if (!briefing.arrIcao) briefing.arrIcao = arrMatch[2].toUpperCase();
      briefing.arrName = arrMatch[3] ? arrMatch[3].trim() : '';
    }

    // Parse estimated UTC Date objects if flight date and times are present
    if (briefing.flightDateStr && briefing.depTimeUtcStr) {
      briefing.depTimeUtc = this.parseDateWithTime(briefing.flightDateStr, briefing.depTimeUtcStr);
    }
    if (briefing.flightDateStr && briefing.arrTimeUtcStr) {
      briefing.arrTimeUtc = this.parseDateWithTime(briefing.flightDateStr, briefing.arrTimeUtcStr);
    }

    // 3. Extract METARs
    // Example: "METAR SBJH 021200Z 13009KT 090V160 9999 BKN010 BKN100 18/15 Q1019"
    const metarMatches = cleaned.matchAll(/METAR\s*●?\s*(METAR\s+([A-Z0-9]{4})\s+([0-9]{6}Z)\s+[^\n\r]+)/gi);
    for (const m of metarMatches) {
      const fullMetar = m[1].trim();
      const station = m[2].toUpperCase();
      briefing.metars.push(this.decodeMetar(fullMetar, station));
    }

    // 4. Extract TAFs
    const tafMatches = cleaned.matchAll(/TAF\s*●?\s*([0-9]{6}Z\s+[0-9]{4}\/[0-9]{4}\s+[^\n\r]+(?:\n\s*●[^\n\r]+)*)/gi);
    for (const m of tafMatches) {
      briefing.tafs.push(m[1].replace(/●/g, ' ').trim());
    }

    // 5. Extract SIGMETs / AIRMETs
    // Example: "SBCW SIGMET 13 VALID 021130/021530 SBCW - SBCW CURITIBA FIR SEV ICE FCST WI ... FL140/210"
    const sigmetMatches = cleaned.matchAll(/([A-Z0-9]{4})\s+SIGMET\s+([0-9]+)\s+VALID\s+([0-9]{6}\/[0-9]{6})\s+([A-Z0-9]{4})\s*-\s*([^\n\r=]+(?:=\n|MOV[^\n\r=]+)?)/gi);
    for (const m of sigmetMatches) {
      const fir = m[1].toUpperCase();
      const num = m[2];
      const valid = m[3];
      const details = m[5].trim();

      // Extract phenomenon
      let phenomenon = 'SIGMET';
      if (/SEV\s+ICE/i.test(details)) phenomenon = 'SEVERE ICING';
      else if (/SEV\s+TURB/i.test(details)) phenomenon = 'SEVERE TURBULENCE';
      else if (/TS|THUNDERSTORM/i.test(details)) phenomenon = 'THUNDERSTORMS';
      else if (/VA|VOLCANIC\s+ASH/i.test(details)) phenomenon = 'VOLCANIC ASH';

      // Extract flight level
      const flMatch = details.match(/FL([0-9]{3})\/([0-9]{3})/i);
      const flRange = flMatch ? `FL${flMatch[1]}-${flMatch[2]}` : '';

      briefing.sigmets.push({
        fir,
        number: num,
        validity: valid,
        phenomenon,
        flRange,
        raw: `${fir} SIGMET ${num} VALID ${valid} - ${details}`
      });
    }

    // 6. Split and Group NOTAMs by ForeFlight Sections if present
    const sectionPattern = /(?:\n|^)(Departure|Destination|Enroute airport|FIR)\s+([A-Z0-9]{4})\s*(?:-\s*([^\n\r]+))?/g;
    const sectionMatches = [...cleaned.matchAll(sectionPattern)];

    if (sectionMatches.length > 0) {
      briefing.isForeflight = true;
      for (let i = 0; i < sectionMatches.length; i++) {
        const cur = sectionMatches[i];
        const next = sectionMatches[i + 1];
        const sectionType = cur[1].toUpperCase().includes('DEP') ? 'DEP'
                          : cur[1].toUpperCase().includes('DEST') ? 'ARR'
                          : cur[1].toUpperCase().includes('ENROUTE') ? 'ENROUTE' : 'FIR';
        const icao = cur[2].toUpperCase();
        const name = cur[3] ? cur[3].trim() : '';

        const startIdx = cur.index + cur[0].length;
        const endIdx = next ? next.index : cleaned.length;
        const sectionBody = cleaned.substring(startIdx, endIdx).trim();

        if (sectionBody.includes('No relevant Notams found') || sectionBody.length < 10) {
          briefing.sections.push({
            type: sectionType,
            icao,
            name,
            notams: []
          });
          continue;
        }

        const rawNotamBlocks = this.splitNotams(sectionBody);
        const parsedNotams = rawNotamBlocks.map(block => {
          const parsed = this.parseNotam(block, icao);
          parsed.sectionType = sectionType;
          parsed.sectionName = name;
          return parsed;
        });

        briefing.sections.push({
          type: sectionType,
          icao,
          name,
          notams: parsedNotams
        });

        briefing.allNotams.push(...parsedNotams);
      }
    } else {
      // Standard split
      const rawNotamBlocks = this.splitNotams(cleaned);
      briefing.allNotams = rawNotamBlocks.map(block => this.parseNotam(block, briefing.depIcao || ''));
    }

    return briefing;
  }

  /**
   * Split a raw flight briefing text block into individual NOTAM items.
   * Handles ICAO format, FAA domestic format, and Jeppesen/ForeFlight text.
   */
  static splitNotams(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split patterns:
    // 1. Double newlines where next chunk has a NOTAM ID, tag, or header
    // 2. ICAO NOTAM headers (e.g. "A1234/24", "K1197/26", "E6742/26", "Z2382/26 NOTAMN 1", "!TEB 10/012")
    const splitPattern = /(?:\n\s*\n+)|(?=\n\s*(?:\[Inactive[^\]]+\]\n)?(?:\([A-Z0-9]{1,2}[0-9]{4}\/[0-9]{2}|[A-Z0-9]{1,2}[0-9]{4}\/[0-9]{2}(?:\s+NOTAM[NRC]?(?:\s+[0-9]+)?)?|![A-Z0-9]{3,4}\s+[0-9]{1,2}\/[0-9]+|![A-Z]{3,4}\s+[A-Z0-9]+\s+[0-9]{1,2}\/[0-9]+))/;
    const rawChunks = cleaned.split(splitPattern);
    const notamBlocks = [];

    for (let chunk of rawChunks) {
      if (!chunk) continue;
      chunk = chunk.trim();
      if (!chunk) continue;

      // Filter out pure section headers
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
      foreflightTag: null,
      pcrData: null,
      sectionType: 'OTHER',
      sectionName: '',
      rawFields: {}
    };

    // ForeFlight Pre-calculated active tag (e.g. "[Inactive at ETD]", "[Inactive during flight]")
    const tagMatch = raw.match(/\[(Inactive\s+at\s+ETD|Inactive\s+at\s+ETA|Inactive\s+during\s+flight)\]/i);
    if (tagMatch) {
      result.foreflightTag = tagMatch[1];
    }

    // 1. Check for ICAO NOTAM ID (e.g. A0123/24, K1197/26, E6742/26, Z2382/26 NOTAMN 1)
    const icaoIdMatch = raw.match(/(?:\(?\s*)([A-Z0-9]{1,2}[0-9]{4}\/[0-9]{2})\s*(NOTAM[NRC])?(?:\s+([0-9]+))?/i);
    if (icaoIdMatch) {
      result.id = icaoIdMatch[1].toUpperCase() + (icaoIdMatch[3] ? ` #${icaoIdMatch[3]}` : '');
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
    const fieldAMatch = raw.match(/A\)\s*([A-Z0-9]{4})/i);
    if (fieldAMatch) {
      result.icao = fieldAMatch[1].toUpperCase();
    }

    // 5. Parse Field B) Valid From
    const fieldBMatch = raw.match(/B\)\s*([0-9]{10,12})/i);
    if (fieldBMatch) {
      result.validFromRaw = fieldBMatch[1];
      result.validFrom = this.parseUtcTimestamp(fieldBMatch[1]);
    }

    // 6. Parse Field C) Valid To
    const fieldCMatch = raw.match(/C\)\s*([0-9]{10,12}|PERM|EST)/i);
    if (fieldCMatch) {
      result.validToRaw = fieldCMatch[1].toUpperCase();
      if (result.validToRaw === 'PERM') {
        result.isPerm = true;
      } else if (result.validToRaw.includes('EST')) {
        result.isEst = true;
        const datePart = fieldCMatch[1].replace('EST', '').trim();
        if (datePart.length >= 10) {
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
    } else {
      // Check for DAYS AND HOURS: or DAILY: inside Jeppesen or ForeFlight text
      const jeppDailyMatch = raw.match(/(?:DAYS\s+AND\s+HOURS|DAILY)\s*[:=]?\s*([0-9]{4}\s*-\s*[0-9]{4}Z?)/i);
      if (jeppDailyMatch) {
        result.scheduleRaw = `DAILY ${jeppDailyMatch[1].replace('Z', '')}`;
      }
    }

    // 8. Parse Field E) Body Text
    const fieldEMatch = raw.match(/E\)\s*([\s\S]*?)(?=(?:\s*[FG]\)|$))/i);
    if (fieldEMatch) {
      result.bodyText = fieldEMatch[1].trim();
    } else {
      result.bodyText = raw;
    }

    // 9. Parse Field F) and G) Lower/Upper Limits
    const fieldFMatch = raw.match(/F\)\s*([^\n\r]+)/i);
    if (fieldFMatch) result.lowerLimit = fieldFMatch[1].trim();
    const fieldGMatch = raw.match(/G\)\s*([^\n\r]+)/i);
    if (fieldGMatch) result.upperLimit = fieldGMatch[1].trim();

    // 10. Check for ICAO Pavement Classification Rating (PCR/PCN)
    const pcrMatch = raw.match(/(?:PCR|PCN|RESISTENCIA\s+PISO)\s*[:=]?\s*([0-9]{2,4})\s*\/\s*([FR])\s*\/\s*([A-D])\s*\/\s*([WXYZ])\s*\/\s*([TU])/i);
    if (pcrMatch) {
      result.pcrData = {
        rating: parseInt(pcrMatch[1], 10),
        pavementType: pcrMatch[2].toUpperCase(), // F = Flexible, R = Rigid
        subgrade: pcrMatch[3].toUpperCase(),     // A = High, B = Medium, C = Low, D = Ultra low
        tirePressure: pcrMatch[4].toUpperCase(), // W = High (no limit), X = Up to 1.75 MPa, Y = Up to 1.25 MPa, Z = Up to 0.5 MPa
        method: pcrMatch[5].toUpperCase()        // T = Technical, U = Using aircraft
      };
    }

    // Fallback date parsing for FAA or Jeppesen formats
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

    result.category = this.determineCategory(result);

    return result;
  }

  /**
   * Parse ICAO timestamp (YYMMDDhhmm or YYYYMMDDhhmm) into Date (UTC).
   */
  static parseUtcTimestamp(str) {
    if (!str) return null;
    let s = str.trim();
    if (s.length === 12) {
      // 12-digit format YYYYMMDDhhmm
      const y = parseInt(s.substring(0, 4), 10);
      const m = parseInt(s.substring(4, 6), 10) - 1;
      const d = parseInt(s.substring(6, 8), 10);
      const h = parseInt(s.substring(8, 10), 10);
      const min = parseInt(s.substring(10, 12), 10);
      return new Date(Date.UTC(y, m, d, h, min, 0));
    }
    if (s.length >= 10) {
      // 10-digit format YYMMDDhhmm
      const yearPrefix = parseInt(s.substring(0, 2), 10) >= 70 ? '19' : '20';
      const year = parseInt(yearPrefix + s.substring(0, 2), 10);
      const month = parseInt(s.substring(2, 4), 10) - 1;
      const day = parseInt(s.substring(4, 6), 10);
      const hours = parseInt(s.substring(6, 8), 10);
      const minutes = parseInt(s.substring(8, 10), 10);
      return new Date(Date.UTC(year, month, day, hours, minutes, 0));
    }
    return null;
  }

  /**
   * Helper to parse date string with time e.g. "Oct 02, 2026" and "1400Z"
   */
  static parseDateWithTime(dateStr, timeStr) {
    try {
      const timeClean = timeStr.replace(/[^0-9]/g, '');
      const h = parseInt(timeClean.substring(0, 2), 10) || 0;
      const min = parseInt(timeClean.substring(2, 4), 10) || 0;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h, min, 0));
      }
    } catch (e) {}
    return null;
  }

  /**
   * Format UTC Date for pilot presentation (e.g., "02 OCT 2026 14:00Z")
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
   */
  static isFlightActive(notam, flightUtc, bufferHours = 2) {
    // If ForeFlight already tagged this NOTAM as inactive at ETD/ETA, respect it
    if (notam.foreflightTag && notam.foreflightTag.startsWith('Inactive')) {
      return false;
    }

    if (!flightUtc) return true;

    const windowStart = new Date(flightUtc.getTime() - bufferHours * 3600000);
    const windowEnd = new Date(flightUtc.getTime() + bufferHours * 3600000);

    if (notam.isPerm) {
      if (!notam.validFrom) return true;
      return notam.validFrom <= windowEnd;
    }

    const notamStart = notam.validFrom || new Date(0);
    const notamEnd = notam.validTo || new Date(8640000000000000);

    const overlapsDateRange = notamStart <= windowEnd && notamEnd >= windowStart;
    if (!overlapsDateRange) {
      return false;
    }

    if (notam.scheduleRaw) {
      return this.checkScheduleOverlap(notam.scheduleRaw, windowStart, windowEnd);
    }

    return true;
  }

  /**
   * Parse Field D schedule string (e.g., "DAILY 0200-0900", "MON-FRI 0800-1600")
   */
  static checkScheduleOverlap(scheduleStr, windowStart, windowEnd) {
    const s = scheduleStr.toUpperCase().trim();
    const hoursMatch = s.match(/([0-9]{4})\s*-\s*([0-9]{4})/);
    if (!hoursMatch) return true;

    const startH = parseInt(hoursMatch[1].substring(0, 2), 10);
    const startM = parseInt(hoursMatch[1].substring(2, 4), 10);
    const endH = parseInt(hoursMatch[2].substring(0, 2), 10);
    const endM = parseInt(hoursMatch[2].substring(2, 4), 10);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const winStartMin = windowStart.getUTCHours() * 60 + windowStart.getUTCMinutes();
    const winEndMin = windowEnd.getUTCHours() * 60 + windowEnd.getUTCMinutes();

    if (endMinutes < startMinutes) {
      const activeStart = winStartMin >= startMinutes || winStartMin <= endMinutes;
      const activeEnd = winEndMin >= startMinutes || winEndMin <= endMinutes;
      return activeStart || activeEnd;
    } else {
      return !(winEndMin < startMinutes || winStartMin > endMinutes);
    }
  }

  /**
   * Decode METAR text into structured category and flight conditions.
   */
  static decodeMetar(rawMetar, station = '') {
    const text = rawMetar.toUpperCase();
    const result = {
      icao: station || 'STN',
      raw: rawMetar.trim(),
      category: 'VFR', // VFR, MVFR, IFR, LIFR
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      wind: '',
      visibility: '',
      ceiling: '',
      temp: '',
      qnh: ''
    };

    // Wind: e.g. 13009KT or 16005KT
    const windMatch = text.match(/([0-9]{3}|VRB)([0-9]{2,3})(?:G([0-9]{2,3}))?KT/);
    if (windMatch) {
      result.wind = `${windMatch[1]}° at ${windMatch[2]} kt` + (windMatch[3] ? ` gusting ${windMatch[3]} kt` : '');
    }

    // Visibility: CAVOK or 9999 or 10SM or 1/2SM
    if (text.includes('CAVOK')) {
      result.visibility = 'CAVOK (>10km, no cloud below 5000ft)';
    } else {
      const smMatch = text.match(/([0-9\/\s]+)SM/);
      if (smMatch) result.visibility = `${smMatch[1]} SM`;
      else if (text.includes('9999')) result.visibility = '≥ 10 km (6+ SM)';
    }

    // Ceiling: BKN010, OVC005, VV002
    let lowestCeilingFt = 99999;
    const cloudMatches = text.matchAll(/(BKN|OVC|VV)([0-9]{3})/g);
    for (const cm of cloudMatches) {
      const ft = parseInt(cm[2], 10) * 100;
      if (ft < lowestCeilingFt) lowestCeilingFt = ft;
    }

    if (lowestCeilingFt < 99999) {
      result.ceiling = `${lowestCeilingFt} FT AGL`;
    } else {
      result.ceiling = text.includes('CAVOK') ? 'Clear / CAVOK' : 'No ceiling below 5000ft';
    }

    // Flight category calculation
    if (lowestCeilingFt < 500 || text.includes('1/2SM') || text.includes('1/4SM')) {
      result.category = 'LIFR';
      result.badgeClass = 'bg-red-500/20 text-red-300 border-red-500/40';
    } else if (lowestCeilingFt < 1000 || text.includes('1SM') || text.includes('2SM')) {
      result.category = 'IFR';
      result.badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    } else if (lowestCeilingFt <= 3000 || text.includes('3SM') || text.includes('4SM') || text.includes('5SM')) {
      result.category = 'MVFR';
      result.badgeClass = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    } else {
      result.category = 'VFR';
      result.badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }

    // QNH / Altimeter: Q1019 or A2992
    const qnhMatch = text.match(/Q([0-9]{4})/);
    const altMatch = text.match(/A([0-9]{4})/);
    if (qnhMatch) result.qnh = `QNH ${qnhMatch[1]} hPa`;
    else if (altMatch) result.qnh = `A${altMatch[1].substring(0, 2)}.${altMatch[1].substring(2, 4)} inHg`;

    return result;
  }

  /**
   * Decode ICAO 5-letter Q-Code
   */
  static decodeQCode(qCode) {
    if (!qCode || qCode.length < 5) return null;
    const entity = qCode.substring(1, 3);
    const status = qCode.substring(3, 5);

    const entityMap = {
      'MR': 'Runway',
      'MX': 'Taxiway',
      'MP': 'Aircraft Stands / Apron',
      'MB': 'Runway Bearing Strength / PCR',
      'FA': 'Aerodrome',
      'IC': 'Instrument Landing System (ILS)',
      'ID': 'DME (Distance Measuring Equipment)',
      'IG': 'Glide Path (GP)',
      'IL': 'Localizer (LOC)',
      'NV': 'VOR',
      'NM': 'VOR/DME',
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
      'ST': 'Security',
      'SE': 'Flight Information Service (FIS)',
      'WL': 'Warning / Free Balloon Ascent',
      'RT': 'Temporary Restricted Area (TRA / RPA)',
      'OA': 'Aeronautical Information Publication (AIP)',
      'AF': 'Air Traffic Control / Flight Check'
    };

    const statusMap = {
      'LC': 'Closed',
      'AS': 'Unserviceable / Out of Service',
      'AU': 'Not Available',
      'AH': 'Hours of service changed',
      'CF': 'Operating frequency changed',
      'CS': 'Installed / In Service',
      'HW': 'Work in progress (WIP)',
      'CH': 'Changed / Modified',
      'CA': 'Activated / Active',
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
   * Determine general operational category (multilingual aware)
   */
  static determineCategory(notam) {
    const text = (notam.bodyText + ' ' + notam.qCode + ' ' + notam.raw).toUpperCase();

    if (text.includes('RWY') || text.includes('RUNWAY') || text.includes('PISTA') || text.includes('QMR') || text.includes('TORA') || text.includes('LDA') || text.includes('RESISTENCIA PISO')) {
      return 'RUNWAY';
    }
    if (text.includes('TWY') || text.includes('TAXIWAY') || text.includes('TAXILANE') || text.includes('QMX') || text.includes('APRON') || text.includes('RAMP') || text.includes('PATIO')) {
      return 'TAXIWAY_APRON';
    }
    if (text.includes('ILS') || text.includes('LOC') || text.includes('GLIDEPATH') || text.includes('QIC') || text.includes('VOR') || text.includes('DME') || text.includes('RNAV') || text.includes('RNP') || text.includes('GPS') || text.includes('RAIM') || text.includes('JAMMING') || text.includes('SPOOFING')) {
      return 'NAVAID_APPROACH';
    }
    if (text.includes('FUEL') || text.includes('JET A') || text.includes('QFU') || text.includes('REFUEL') || text.includes('COMBUSTIVEL')) {
      return 'FUEL';
    }
    if (text.includes('CUSTOMS') || text.includes('IMMIGRATION') || text.includes('AOE') || text.includes('ALFANDEGA') || text.includes('PORT OF ENTRY') || text.includes('POLICIA FEDERAL')) {
      return 'CUSTOMS_AOE';
    }
    if (text.includes('CURFEW') || text.includes('HOURS OF OPS') || text.includes('HR SER') || text.includes('TWR CLSD') || text.includes('AD CLSD') || text.includes('PPR') || text.includes('SLOT') || text.includes('COHOR')) {
      return 'AIRPORT_HOURS_PPR';
    }
    if (text.includes('RFFS') || text.includes('ARFF') || text.includes('FIRE') || text.includes('RESCUE') || text.includes('BOMBEIROS')) {
      return 'FIRE_RESCUE';
    }
    if (text.includes('LIGHT') || text.includes('PAPI') || text.includes('ALS') || text.includes('QLA') || text.includes('QLP') || text.includes('SEM FLASH')) {
      return 'LIGHTING';
    }
    if (text.includes('DRONE') || text.includes('RPA') || text.includes('BALAO') || text.includes('BALLOON') || text.includes('AREA RESTRITA') || text.includes('OBST') || text.includes('CRANE')) {
      return 'AIRSPACE_OBSTACLE';
    }

    return 'GENERAL';
  }
}
