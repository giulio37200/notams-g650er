/**
 * AeroBrief G650ER - ICAO, FAA & ForeFlight Briefing Parser
 * Features:
 * - Accurate ForeFlight multi-section & 2-column PDF text reconstruction
 * - Smart bilingual & cluster deduplication (merges English/Portuguese pairs & repeated RPA/Balloon notices)
 * - UTC flight window math & Field D schedule evaluation
 * - METAR, TAF & SIGMET decoding
 */

export class NotamParser {
  /**
   * Parse a complete flight briefing document (ForeFlight, Jeppesen, or standard text).
   */
  static parseFullBriefing(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    // Normalize line endings and clean page footers/headers from PDF extraction
    const cleaned = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/NOTAMs\s+\d+\s+of\s+\d+/gi, '')
      .replace(/WX:\s+Page\s+\d+\s+of\s+\d+/gi, '');

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
      allNotams: [],
      rawNotamCount: 0
    };

    // 1. Detect ForeFlight Header: e.g. "SBJH — SGAS (Oct 02, 2026) in N650MV (GLF6)"
    const headerMatch = cleaned.match(/([A-Z0-9]{4})\s*[—–-]\s*([A-Z0-9]{4})\s*\(([A-Za-z0-9\s,]+)\)\s*in\s*([A-Za-z0-9-]+)\s*\(([A-Za-z0-9]+)\)/i);
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
    const depMatch = cleaned.match(/Departure\s*\(([0-9]{4})Z\):\s*([A-Z0-9]{4})\s*(?:-\s*([^\n\r]+))?/i) ||
                     cleaned.match(/Departure\s+([A-Z0-9]{4})\s*-\s*([^\n\r]+)/i);
    if (depMatch) {
      if (depMatch[3] !== undefined) {
        briefing.depTimeUtcStr = depMatch[1] + 'Z';
        if (!briefing.depIcao) briefing.depIcao = depMatch[2].toUpperCase();
        briefing.depName = depMatch[3].trim();
      } else if (depMatch[2]) {
        if (!briefing.depIcao) briefing.depIcao = depMatch[1].toUpperCase();
        briefing.depName = depMatch[2].trim();
      }
    }

    const arrMatch = cleaned.match(/Destination\s*\(([0-9]{4})Z\):\s*([A-Z0-9]{4})\s*(?:-\s*([^\n\r]+))?/i) ||
                     cleaned.match(/Destination\s+([A-Z0-9]{4})\s*-\s*([^\n\r]+)/i);
    if (arrMatch) {
      if (arrMatch[3] !== undefined) {
        briefing.arrTimeUtcStr = arrMatch[1] + 'Z';
        if (!briefing.arrIcao) briefing.arrIcao = arrMatch[2].toUpperCase();
        briefing.arrName = arrMatch[3].trim();
      } else if (arrMatch[2]) {
        if (!briefing.arrIcao) briefing.arrIcao = arrMatch[1].toUpperCase();
        briefing.arrName = arrMatch[2].trim();
      }
    }

    if (briefing.flightDateStr && briefing.depTimeUtcStr) {
      briefing.depTimeUtc = this.parseDateWithTime(briefing.flightDateStr, briefing.depTimeUtcStr);
    }
    if (briefing.flightDateStr && briefing.arrTimeUtcStr) {
      briefing.arrTimeUtc = this.parseDateWithTime(briefing.flightDateStr, briefing.arrTimeUtcStr);
    }

    // 3. Extract METARs (deduplicated by station)
    const seenMetars = new Set();
    const metarMatches = cleaned.matchAll(/(?:METAR\s*●?\s*)?(METAR\s+([A-Z0-9]{4})\s+([0-9]{6}Z)\s+[^\n\r]+)/gi);
    for (const m of metarMatches) {
      const fullMetar = m[1].trim();
      const station = m[2].toUpperCase();
      if (!seenMetars.has(station)) {
        seenMetars.add(station);
        briefing.metars.push(this.decodeMetar(fullMetar, station));
      }
    }

    // 4. Extract TAFs
    const tafMatches = cleaned.matchAll(/TAF\s*●?\s*([0-9]{6}Z\s+[0-9]{4}\/[0-9]{4}\s+[^\n\r]+(?:\n\s*●[^\n\r]+)*)/gi);
    for (const m of tafMatches) {
      briefing.tafs.push(m[1].replace(/●/g, ' ').trim());
    }

    // 5. Extract SIGMETs / AIRMETs (deduplicated by FIR + phenomenon + FL)
    const seenSigmets = new Set();
    const sigmetMatches = cleaned.matchAll(/([A-Z0-9]{4})\s+SIGMET\s+([0-9]+)\s+VALID\s+([0-9]{6}\/[0-9]{6})\s+([A-Z0-9]{4})\s*-\s*([\s\S]*?)(?=(?:\n\s*SIGMET|\n\s*No\s+SIGMET|\n\s*NOTAMs|$))/gi);
    for (const m of sigmetMatches) {
      const fir = m[1].toUpperCase();
      const num = m[2];
      const valid = m[3];
      const details = m[5].replace(/\s+/g, ' ').trim();

      let phenomenon = 'SIGMET';
      if (/SEV\s+ICE/i.test(details)) phenomenon = 'SEVERE ICING';
      else if (/SEV\s+TURB/i.test(details)) phenomenon = 'SEVERE TURBULENCE';
      else if (/TS|THUNDERSTORM/i.test(details)) phenomenon = 'THUNDERSTORMS';
      else if (/VA|VOLCANIC\s+ASH/i.test(details)) phenomenon = 'VOLCANIC ASH';

      const flMatch = details.match(/FL\s*([0-9]{3})\/([0-9]{3})/i);
      const flRange = flMatch ? `FL${flMatch[1]}–${flMatch[2]}` : '';

      const sigKey = `${fir}_${phenomenon}_${flRange}`;
      if (!seenSigmets.has(sigKey)) {
        seenSigmets.add(sigKey);
        briefing.sigmets.push({
          fir,
          number: num,
          validity: valid,
          phenomenon,
          flRange,
          raw: `${fir} SIGMET ${num} VALID ${valid} - ${details}`
        });
      }
    }

    // 6. Split and Group NOTAMs by ForeFlight Sections if present
    // Exclude "Departure (1400Z):" from Weather page by requiring no "(1400Z):" colon
    const sectionPattern = /(?:\n|^)\s*(Departure|Destination|Enroute airport|FIR)\s+([A-Z0-9]{4})(?:\s*-\s*([^\n\r]+))?(?=\s*\n)/g;
    const sectionMatches = [...cleaned.matchAll(sectionPattern)];

    if (sectionMatches.length > 0) {
      briefing.isForeflight = true;
      for (let i = 0; i < sectionMatches.length; i++) {
        const cur = sectionMatches[i];
        const next = sectionMatches[i + 1];
        const label = cur[1].toUpperCase();
        const sectionType = label.includes('DEP') ? 'DEP'
                          : label.includes('DEST') ? 'ARR'
                          : label.includes('ENROUTE') ? 'ENROUTE' : 'FIR';
        const icao = cur[2].toUpperCase();
        const name = cur[3] ? cur[3].trim() : '';

        const startIdx = cur.index + cur[0].length;
        const endIdx = next ? next.index : cleaned.length;
        const sectionBody = cleaned.substring(startIdx, endIdx).trim();

        if (/No\s+relevant\s+Notams\s+found/i.test(sectionBody) || sectionBody.length < 10) {
          briefing.sections.push({
            type: sectionType,
            icao,
            name,
            notams: []
          });
          continue;
        }

        const rawNotamBlocks = this.splitNotams(sectionBody);
        briefing.rawNotamCount += rawNotamBlocks.length;

        const parsedNotams = rawNotamBlocks.map(block => {
          const parsed = this.parseNotam(block, icao);
          parsed.sectionType = sectionType;
          parsed.sectionIcao = icao;
          parsed.sectionName = name;
          // For FIR sections, keep the section FIR as the primary station badge if A) is a local helipad
          if (sectionType === 'FIR') {
            parsed.subLocation = parsed.icao !== icao ? parsed.icao : '';
            parsed.icao = icao;
          }
          return parsed;
        });

        const deduplicated = this.deduplicateNotams(parsedNotams);

        briefing.sections.push({
          type: sectionType,
          icao,
          name,
          notams: deduplicated
        });

        briefing.allNotams.push(...deduplicated);
      }
    } else {
      const rawNotamBlocks = this.splitNotams(cleaned);
      briefing.rawNotamCount = rawNotamBlocks.length;
      const parsedNotams = rawNotamBlocks.map(block => this.parseNotam(block, briefing.depIcao || ''));
      briefing.allNotams = this.deduplicateNotams(parsedNotams);
    }

    return briefing;
  }

  /**
   * Split a raw flight briefing text block into individual NOTAM items while keeping
   * preceding ForeFlight subject headers & [Inactive at ETD/ETA] tags attached to their NOTAM.
   */
  static splitNotams(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    const cleaned = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/#####+/g, '\n');

    // Find all NOTAM start positions (ICAO ID like K1197/26 NOTAMN, Z2382/26 NOTAMN 1, or FAA !TEB 10/012)
    const idRegex = /(?:^|\n)\s*(\(?[A-Z][0-9]{4}\/[0-9]{2}\s+NOTAM[NRC](?:\s+[A-Z][0-9]{4}\/[0-9]{2}|\s+[0-9]+)?|![A-Z0-9]{3,4}\s+[0-9]{1,2}\/[0-9]+|![A-Z]{3,4}\s+[A-Z0-9]+\s+[0-9]{1,2}\/[0-9]+)/gi;
    const matches = [...cleaned.matchAll(idRegex)];

    if (matches.length === 0) {
      return cleaned.trim().length >= 15 ? [cleaned.trim()] : [];
    }

    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
      const curMatch = matches[i];
      const nextMatch = matches[i + 1];

      // Look backwards up to 160 chars before curMatch.index to capture [Inactive at ETD] and Headline
      const prevEnd = i === 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length;
      const preText = cleaned.substring(prevEnd, curMatch.index);
      const preLines = preText.split('\n').map(l => l.trim()).filter(Boolean);

      // Check last 1-2 lines of preLines for "[Inactive...]" or ALL-CAPS subject header
      const attachedHeaderLines = [];
      for (let j = Math.max(0, preLines.length - 2); j < preLines.length; j++) {
        const line = preLines[j];
        if (
          /^\[Inactive/i.test(line) ||
          /\(NEW TODAY\)$/i.test(line) ||
          (/^[A-Z\s\/,.-]{4,65}$/.test(line) && !line.startsWith('E)') && !line.startsWith('F)') && !line.startsWith('G)') && !line.startsWith('RMK:') && !line.startsWith('REF:'))
        ) {
          attachedHeaderLines.push(line);
        }
      }

      // Determine where the current NOTAM ends (just before next NOTAM's attached headers)
      let blockEnd = nextMatch ? nextMatch.index : cleaned.length;
      if (nextMatch) {
        const betweenText = cleaned.substring(curMatch.index, nextMatch.index);
        const betweenLines = betweenText.split('\n');
        // Trim trailing 1-2 lines if they are the next NOTAM's headline or [Inactive...] tag
        while (betweenLines.length > 2) {
          const lastLine = betweenLines[betweenLines.length - 1].trim();
          if (!lastLine) {
            betweenLines.pop();
            continue;
          }
          if (
            /^\[Inactive/i.test(lastLine) ||
            /\(NEW TODAY\)$/i.test(lastLine) ||
            (/^[A-Z\s\/,.-]{5,65}$/.test(lastLine) && !/^(?:E\)|F\)|G\)|RMK|REF|PERM|DAILY|ACT\b|WI\s+COORD)/.test(lastLine))
          ) {
            betweenLines.pop();
          } else {
            break;
          }
        }
        const bodySlice = betweenLines.join('\n').trim();
        const fullBlock = [...attachedHeaderLines, bodySlice].join('\n').trim();
        if (fullBlock.length >= 15) blocks.push(fullBlock);
      } else {
        const bodySlice = cleaned.substring(curMatch.index, blockEnd).trim();
        const fullBlock = [...attachedHeaderLines, bodySlice].join('\n').trim();
        if (fullBlock.length >= 15) blocks.push(fullBlock);
      }
    }

    return blocks;
  }

  /**
   * Deduplicate and group redundant/bilingual NOTAMs (e.g. Brazil K/E series pairs,
   * repeated Barueri RPA NOTAMs, repeated Sorocaba Balloon NOTAMs).
   */
  static deduplicateNotams(notams) {
    if (!notams || notams.length <= 1) return notams;

    const groups = new Map();

    for (const n of notams) {
      const signature = this.getNotamDedupeSignature(n);
      if (!groups.has(signature)) {
        n.groupedIds = [n.id].filter(Boolean);
        n.groupedRaw = [n.raw];
        n.groupedCount = 1;
        groups.set(signature, n);
      } else {
        const existing = groups.get(signature);
        if (n.id && !existing.groupedIds.includes(n.id)) {
          existing.groupedIds.push(n.id);
        }
        existing.groupedRaw.push(n.raw);
        existing.groupedCount = existing.groupedIds.length || (existing.groupedCount + 1);

        // Prefer English version if existing is Portuguese ("DEVIDO", "OBRAS", "SEM FLASH", "AREA RESTRITA")
        const existingIsPt = /DEVIDO|OBRAS|SEM\s+FLASH|PRORROGADA|MODIFICACOES|BALONISMO/i.test(existing.bodyText);
        const newIsEn = /DUE\s+TO|WITHOUT\s+FLASH|EXTENDED\s+BY|MODIFICATIONS|BALLOONING/i.test(n.bodyText);
        if (existingIsPt && newIsEn) {
          existing.bodyText = n.bodyText;
        }
        if (!existing.foreflightTag && n.foreflightTag) {
          existing.foreflightTag = n.foreflightTag;
        }
      }
    }

    return Array.from(groups.values());
  }

  /**
   * Compute a normalized semantic signature for grouping identical/bilingual NOTAMs.
   */
  static getNotamDedupeSignature(notam) {
    const icao = notam.sectionIcao || notam.icao || '';
    const body = (notam.bodyText || '').toUpperCase();

    // 1. Barueri RPA cluster
    if (body.includes('BARUERI-SP') && (body.includes('FLT RPA') || body.includes('AREA RESTRITA'))) {
      return `${icao}_CLUSTER_BARUERI_RPA_${notam.upperLimit || '2700FT'}`;
    }

    // 2. Sorocaba Free Balloon cluster
    if (body.includes('SOROCABA') && (body.includes('BALLOON') || body.includes('BALAO') || body.includes('BALONISMO'))) {
      return `${icao}_CLUSTER_SOROCABA_BALLOON`;
    }

    // 3. Luque / World Skate Games Drone cluster
    if (body.includes('COMITE OLIMPICO PARAGUAYO') || body.includes('WORLD SKATE GAMES')) {
      const isInact = notam.foreflightTag ? 'INACT' : 'ACT';
      return `${icao}_CLUSTER_LUQUE_UA_${isInact}`;
    }

    // 4. SUP AIP cancellation pair (e.g. SUP AIP 110/25 CNL)
    const supMatch = body.match(/SUP\s+AIP\s*\(E-AIP\)\s*([0-9]+\/[0-9]+)\s*CNL/i);
    if (supMatch) {
      return `${icao}_SUP_AIP_CNL_${supMatch[1]}`;
    }

    // 5. AIRAC Trigger NOTAM pair
    if (body.includes('TRIGGER NOTAM') || body.includes('NOTAM INICIADOR')) {
      const airacMatch = body.match(/([0-9]{2}\/[0-9]{2}|2610A1|02\/2026)/i);
      return `${icao}_TRIGGER_${airacMatch ? airacMatch[1] : 'GEN'}`;
    }

    // 6. Bilingual Runway Closure (same station, same runway, same schedule)
    const rwyClsdMatch = body.match(/(?:RWY|RUNWAY|PISTA)\s*([0-9]{2}[LRC]?(?:\/[0-9]{2}[LRC]?)?)\s*(?:CLSD|CLOSED)/i);
    if (rwyClsdMatch) {
      return `${icao}_RWY_CLSD_${rwyClsdMatch[1]}_${notam.scheduleRaw || notam.validFromRaw}`;
    }

    // 7. Bilingual ALS without flash (same station & runway)
    if (body.includes('ALSF') && (body.includes('WITHOUT FLASH') || body.includes('SEM FLASH'))) {
      return `${icao}_ALS_NO_FLASH`;
    }

    // 8. Bilingual VOR/DME FOZ U/S
    if (body.includes('112.100MHZ') || (body.includes('VOR/DME') && body.includes('FOZ'))) {
      return `${icao}_VORDME_FOZ_US`;
    }

    // 9. Bilingual Tower frequency installed
    const twrFreqMatch = body.match(/TWR\s+[A-Z]+\s+FREQ\s+([0-9.]+MHZ)\s+INSTL/i);
    if (twrFreqMatch) {
      return `${icao}_TWR_FREQ_${twrFreqMatch[1]}`;
    }

    // 10. Bilingual FIS Curitiba frequency notice
    if (body.includes('132.4') && body.includes('135.7') && body.includes('126.7')) {
      return `${icao}_FIS_CURITIBA_SECT`;
    }

    return `${icao}_${notam.id || Math.random()}`;
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
      type: 'UNKNOWN',
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
      isNewToday: false,
      pcrData: null,
      sectionType: 'OTHER',
      sectionIcao: defaultIcao.toUpperCase(),
      sectionName: '',
      subLocation: '',
      groupedIds: [],
      groupedRaw: [raw],
      groupedCount: 1,
      rawFields: {}
    };

    // ForeFlight Pre-calculated active tag (e.g. "[Inactive at ETD]", "[Inactive during flight]")
    const tagMatch = raw.match(/\[(Inactive\s+at\s+ETD|Inactive\s+at\s+ETA|Inactive\s+during\s+flight)\]/i);
    if (tagMatch) {
      result.foreflightTag = tagMatch[1];
    }
    if (/\(NEW TODAY\)/i.test(raw)) {
      result.isNewToday = true;
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
    const qLineMatch = raw.match(/Q\)\s*([A-Z]{4})\/([A-Z]{5})\/([A-Z\/]*)\/([A-Z\s]*)\/([A-Z\s]*)\/([0-9]{3})?\/([0-9]{3})?\/([^\n\r]+)?/i);
    if (qLineMatch) {
      result.fir = qLineMatch[1].toUpperCase();
      result.qCode = qLineMatch[2].toUpperCase();
      result.lowerLimit = qLineMatch[6] ? `FL${qLineMatch[6]}` : '';
      result.upperLimit = qLineMatch[7] ? `FL${qLineMatch[7]}` : '';
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
    const fieldDMatch = raw.match(/(?:^|\s)D\)\s*([^\n\rE\)]+)/i);
    if (fieldDMatch && fieldDMatch[1].trim()) {
      result.scheduleRaw = fieldDMatch[1].trim();
    } else {
      const jeppDailyMatch = raw.match(/(?:DAYS\s+AND\s+HOURS|DAILY)\s*[:=]?\s*([0-9]{4}\s*-\s*[0-9]{4}Z?)/i);
      if (jeppDailyMatch) {
        result.scheduleRaw = `DAILY ${jeppDailyMatch[1].replace('Z', '')}`;
      }
    }

    // 8. Parse Field E) Body Text
    const fieldEMatch = raw.match(/(?:^|\s)E\)\s*([\s\S]*?)(?=(?:\s+[FG]\)\s+|\s+Q\)\s*|$))/i);
    if (fieldEMatch) {
      result.bodyText = fieldEMatch[1].replace(/\s+/g, ' ').trim();
    } else {
      result.bodyText = raw;
    }

    // 9. Parse Field F) and G) Lower/Upper Limits (explicitly requiring whitespace/line start before F) and G))
    const fieldFMatch = raw.match(/(?:^|\s)F\)\s*([\s\S]*?)(?=(?:\s+G\)\s+|\r|\n|$))/i);
    if (fieldFMatch) result.lowerLimit = fieldFMatch[1].trim();
    const fieldGMatch = raw.match(/(?:^|\s)G\)\s*([^\n\r]+)/i);
    if (fieldGMatch) result.upperLimit = fieldGMatch[1].trim();

    // 10. Check for ICAO Pavement Classification Rating (PCR/PCN)
    const pcrMatch = raw.match(/(?:PCR|PCN|RESISTENCIA\s+PISO[^\n\r]*?PCR)\s*[:=]?\s*([0-9]{2,4})\s*\/\s*([FR])\s*\/\s*([A-D])\s*\/\s*([WXYZ])\s*\/\s*([TU])/i);
    if (pcrMatch) {
      result.pcrData = {
        rating: parseInt(pcrMatch[1], 10),
        pavementType: pcrMatch[2].toUpperCase(),
        subgrade: pcrMatch[3].toUpperCase(),
        tirePressure: pcrMatch[4].toUpperCase(),
        method: pcrMatch[5].toUpperCase()
      };
    }

    // Fallback date parsing for FAA domestic format
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
    result.groupedIds = [result.id].filter(Boolean);

    return result;
  }

  /**
   * Parse ICAO timestamp (YYMMDDhhmm or YYYYMMDDhhmm) into Date (UTC).
   */
  static parseUtcTimestamp(str) {
    if (!str) return null;
    const s = str.trim();
    if (s.length === 12) {
      const y = parseInt(s.substring(0, 4), 10);
      const m = parseInt(s.substring(4, 6), 10) - 1;
      const d = parseInt(s.substring(6, 8), 10);
      const h = parseInt(s.substring(8, 10), 10);
      const min = parseInt(s.substring(10, 12), 10);
      return new Date(Date.UTC(y, m, d, h, min, 0));
    }
    if (s.length >= 10) {
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
   * Format UTC Date for pilot presentation (e.g., "02 OCT 14:00Z")
   */
  static formatUtc(date, includeYear = false) {
    if (!date) return 'PERM';
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const d = new Date(date);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const mins = String(d.getUTCMinutes()).padStart(2, '0');
    return includeYear ? `${day} ${month} ${year} ${hours}:${mins}Z` : `${day} ${month} ${hours}:${mins}Z`;
  }

  /**
   * Check if a NOTAM is active during a given flight UTC window.
   */
  static isFlightActive(notam, flightUtc, bufferHours = 2) {
    if (notam.foreflightTag && /^Inactive/i.test(notam.foreflightTag)) {
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
      category: 'VFR',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      wind: 'Calm',
      visibility: '10+ km',
      ceiling: 'Clear',
      temp: '',
      qnh: ''
    };

    const windMatch = text.match(/([0-9]{3}|VRB)([0-9]{2,3})(?:G([0-9]{2,3}))?KT/);
    if (windMatch) {
      result.wind = `${windMatch[1]}° / ${parseInt(windMatch[2], 10)} kt` + (windMatch[3] ? ` G${windMatch[3]}` : '');
    }

    if (text.includes('CAVOK')) {
      result.visibility = 'CAVOK';
      result.ceiling = 'CAVOK';
    } else {
      const smMatch = text.match(/\b([0-9\/\s]+)SM\b/);
      if (smMatch) result.visibility = `${smMatch[1].trim()} SM`;
      else if (text.includes('9999')) result.visibility = '10+ km';
    }

    let lowestCeilingFt = 99999;
    const cloudMatches = text.matchAll(/(BKN|OVC|VV)([0-9]{3})/g);
    for (const cm of cloudMatches) {
      const ft = parseInt(cm[2], 10) * 100;
      if (ft < lowestCeilingFt) lowestCeilingFt = ft;
    }

    if (lowestCeilingFt < 99999) {
      result.ceiling = `${lowestCeilingFt.toLocaleString()} ft`;
    }

    if (lowestCeilingFt < 500 || text.includes(' 1/2SM') || text.includes(' 1/4SM')) {
      result.category = 'LIFR';
      result.badgeClass = 'bg-red-500/15 text-red-400 border-red-500/30';
    } else if (lowestCeilingFt < 1000 || text.includes(' 1SM') || text.includes(' 2SM')) {
      result.category = 'IFR';
      result.badgeClass = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    } else if (lowestCeilingFt <= 3000 || text.includes(' 3SM') || text.includes(' 4SM') || text.includes(' 5SM')) {
      result.category = 'MVFR';
      result.badgeClass = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    }

    const qnhMatch = text.match(/Q([0-9]{4})/);
    const altMatch = text.match(/A([0-9]{4})/);
    if (qnhMatch) result.qnh = `Q${qnhMatch[1]}`;
    else if (altMatch) result.qnh = `A${altMatch[1].substring(0, 2)}.${altMatch[1].substring(2, 4)}`;

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
      'MB': 'Pavement Bearing Strength (PCR)',
      'FA': 'Aerodrome',
      'IC': 'ILS',
      'ID': 'DME',
      'IG': 'Glide Path (GP)',
      'IL': 'Localizer (LOC)',
      'NV': 'VOR',
      'NM': 'VOR/DME',
      'ND': 'NDB',
      'OB': 'Obstacle',
      'LP': 'PAPI',
      'LA': 'Approach Lighting (ALS)',
      'LC': 'Runway Centre Line Lights',
      'LT': 'Threshold Lights',
      'FF': 'Fire & Rescue (ARFF)',
      'FU': 'Fuel Facilities',
      'CP': 'Customs / Immigration',
      'PI': 'Instrument Approach',
      'PD': 'SID',
      'PA': 'STAR',
      'SP': 'Slot / PPR',
      'ST': 'Control Tower / Security',
      'SE': 'Flight Information Service (FIS)',
      'WL': 'Free Balloon Ascent',
      'WU': 'Unmanned Aircraft (Drone/RPA)',
      'WP': 'Parachute Jumping (PJE)',
      'WM': 'Model / Fireworks Display',
      'RT': 'Temporary Restricted Area',
      'RR': 'Restricted Area',
      'OA': 'AIP / Trigger Notice',
      'AF': 'Flight Check / Airspace'
    };

    const statusMap = {
      'LC': 'Closed',
      'AS': 'Unserviceable',
      'AU': 'Not Available',
      'AH': 'Hours Changed',
      'CF': 'Frequency Changed',
      'CS': 'Installed',
      'HW': 'Work in Progress',
      'CH': 'Modified',
      'CA': 'Activated',
      'LW': 'Will Take Place',
      'TT': 'Trigger Notice',
      'XX': 'Operating Notice'
    };

    return {
      entityCode: entity,
      entityDesc: entityMap[entity] || 'Facility',
      statusCode: status,
      statusDesc: statusMap[status] || 'Notice',
      summary: `${entityMap[entity] || entity} • ${statusMap[status] || status}`
    };
  }

  /**
   * Determine general operational category (multilingual aware)
   */
  static determineCategory(notam) {
    const text = (notam.bodyText + ' ' + notam.qCode).toUpperCase();

    if (text.includes('SUP AIP') || text.includes('TRIGGER NOTAM') || text.includes('NOTAM INICIADOR') || text.includes('QAFTT') || text.includes('QOAXX')) {
      return 'ADMIN_AIP';
    }
    if (text.includes('RWY') || text.includes('RUNWAY') || text.includes('PISTA') || text.includes('QMR') || text.includes('TORA') || text.includes('LDA') || text.includes('RESISTENCIA PISO')) {
      return 'RUNWAY';
    }
    if (text.includes('TWY') || text.includes('TAXIWAY') || text.includes('TAXILANE') || text.includes('QMX') || text.includes('APRON') || text.includes('RAMP') || text.includes('JETWAY')) {
      return 'TAXIWAY_APRON';
    }
    if (text.includes('ILS') || text.includes('LOC') || text.includes('GLIDEPATH') || text.includes('QIC') || text.includes('VOR') || text.includes('DME') || text.includes('RNAV') || text.includes('RNP') || text.includes('GPS') || text.includes('RAIM') || text.includes('JAMMING') || text.includes('SPOOFING')) {
      return 'NAVAID_APPROACH';
    }
    if (text.includes('FUEL') || text.includes('JET A') || text.includes('JET-A') || text.includes('QFU') || text.includes('REFUEL') || text.includes('COMBUSTIVEL')) {
      return 'FUEL';
    }
    if (text.includes('CUSTOMS') || text.includes('IMMIGRATION') || text.includes('AOE') || text.includes('UKBF') || text.includes('BORDER') || text.includes('PORT OF ENTRY')) {
      return 'CUSTOMS_AOE';
    }
    if (text.includes('CURFEW') || text.includes('HOURS OF OPS') || text.includes('HR SER') || text.includes('TWR CLSD') || text.includes('AD CLSD') || text.includes('PPR') || text.includes('SLOT') || text.includes('COHOR') || text.includes('APU')) {
      return 'AIRPORT_HOURS_PPR';
    }
    if (text.includes('RFFS') || text.includes('ARFF') || text.includes('FIRE') || text.includes('RESCUE') || text.includes('BOMBEIROS')) {
      return 'FIRE_RESCUE';
    }
    if (text.includes('LIGHT') || text.includes('PAPI') || text.includes('ALS') || text.includes('QLA') || text.includes('QLP') || text.includes('SEM FLASH')) {
      return 'LIGHTING';
    }
    if (text.includes('DRONE') || text.includes('RPA') || text.includes('UA WILL TAKE PLACE') || text.includes('BALAO') || text.includes('BALLOON') || text.includes('AREA RESTRITA') || text.includes('OBST') || text.includes('CRANE') || text.includes('PARACHUTE') || text.includes('PJE') || text.includes('SGR-')) {
      return 'AIRSPACE_OBSTACLE';
    }

    return 'GENERAL';
  }
}
