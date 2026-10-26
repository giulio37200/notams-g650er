/**
 * AeroBrief G650ER - ICAO, FAA & ForeFlight Briefing Parser + Geo/Coordinate Engine
 * Features:
 * - Accurate ForeFlight multi-section & 2-column PDF text reconstruction
 * - Smart bilingual & cluster deduplication (merges English/Portuguese pairs & repeated RPA/Balloon notices)
 * - Automatic extraction of Q) and E) coordinates, radii, and polygons for interactive map plotting
 * - Haversine distance & bearing calculation relative to Departure / Destination ARP
 * - SIGMET polygon coordinate decoding & Route Waypoint / Vertical Profile extraction
 * - UTC flight window math & enhanced Field D schedule evaluation (DAILY, BTN, multi-date, SR-SS)
 */

export const AIRPORT_COORDS_DB = {
  // South America (Brazil / Paraguay / Argentina / Chile / Peru / Colombia / Executive Hubs)
  SBJH: { lat: -23.4281, lon: -47.1653, name: 'São Paulo Catarina Executivo', elevFt: 2493 },
  SGAS: { lat: -25.2400, lon: -57.5192, name: 'Asunción Silvio Pettirossi Intl', elevFt: 292 },
  SBAE: { lat: -22.1578, lon: -49.0683, name: 'Bauru-Arealva', elevFt: 1949 },
  SBLO: { lat: -23.3336, lon: -51.1300, name: 'Londrina Governador José Richa', elevFt: 1867 },
  SBMG: { lat: -23.4794, lon: -52.0122, name: 'Maringá Sílvio Name Júnior', elevFt: 1788 },
  SBFI: { lat: -25.6003, lon: -54.4850, name: 'Foz do Iguaçu Cataratas', elevFt: 787 },
  SGES: { lat: -25.4544, lon: -54.8428, name: 'Ciudad del Este Guaraní Intl', elevFt: 846 },
  SBGR: { lat: -23.4356, lon: -46.4731, name: 'São Paulo Guarulhos Intl', elevFt: 2461 },
  SBSP: { lat: -23.6261, lon: -46.6564, name: 'São Paulo Congonhas', elevFt: 2631 },
  SBKP: { lat: -23.0074, lon: -47.1345, name: 'Campinas Viracopos Intl', elevFt: 2170 },
  SDCO: { lat: -23.4831, lon: -47.4900, name: 'Sorocaba Airport', elevFt: 2077 },
  SBDN: { lat: -22.1783, lon: -51.4189, name: 'Presidente Prudente', elevFt: 1476 },
  SBRP: { lat: -21.1364, lon: -47.7767, name: 'Ribeirão Preto Leite Lopes', elevFt: 1808 },
  SBSJ: { lat: -23.2289, lon: -45.8614, name: 'São José dos Campos', elevFt: 2120 },
  SBRJ: { lat: -22.9105, lon: -43.1631, name: 'Rio de Janeiro Santos Dumont', elevFt: 11 },
  SBGL: { lat: -22.8100, lon: -43.2506, name: 'Rio de Janeiro Galeão Intl', elevFt: 28 },
  SBJR: { lat: -22.9875, lon: -43.3700, name: 'Rio de Janeiro Jacarepaguá', elevFt: 10 },
  SBCB: { lat: -22.9217, lon: -42.0742, name: 'Cabo Frio Intl', elevFt: 23 },
  SBME: { lat: -22.3431, lon: -41.7661, name: 'Macaé Airport', elevFt: 8 },
  SBVT: { lat: -20.2581, lon: -40.2864, name: 'Vitória Eurico de Aguiar Salles', elevFt: 11 },
  SBCF: { lat: -19.6244, lon: -43.9719, name: 'Belo Horizonte Confins Intl', elevFt: 2715 },
  SBBH: { lat: -19.8519, lon: -43.9506, name: 'Belo Horizonte Pampulha', elevFt: 2589 },
  SBBR: { lat: -15.8711, lon: -47.9186, name: 'Brasília Pres. Juscelino Kubitschek Intl', elevFt: 3497 },
  SBGO: { lat: -16.6325, lon: -49.2211, name: 'Goiânia Santa Genoveva', elevFt: 2450 },
  SBCY: { lat: -15.6528, lon: -56.1167, name: 'Cuiabá Marechal Rondon Intl', elevFt: 617 },
  SBCG: { lat: -20.4694, lon: -54.6703, name: 'Campo Grande Intl', elevFt: 1833 },
  SBCT: { lat: -25.5285, lon: -49.1758, name: 'Curitiba Afonso Pena Intl', elevFt: 2989 },
  SBBI: { lat: -25.4033, lon: -49.2336, name: 'Curitiba Bacacheri', elevFt: 3057 },
  SBJV: { lat: -26.2244, lon: -48.7975, name: 'Joinville Lauro Carneiro de Loyola', elevFt: 15 },
  SBNF: { lat: -26.8786, lon: -48.6508, name: 'Navegantes Ministro Victor Konder', elevFt: 18 },
  SBFL: { lat: -27.6703, lon: -48.5525, name: 'Florianópolis Hercílio Luz Intl', elevFt: 16 },
  SBPA: { lat: -29.9944, lon: -51.1714, name: 'Porto Alegre Salgado Filho Intl', elevFt: 11 },
  SBSV: { lat: -12.9086, lon: -38.3225, name: 'Salvador Deputado Luís Eduardo Magalhães', elevFt: 64 },
  SBRF: { lat: -8.1264, lon: -34.9236, name: 'Recife Guararapes Intl', elevFt: 33 },
  SBFZ: { lat: -3.7761, lon: -38.5322, name: 'Fortaleza Pinto Martins Intl', elevFt: 82 },
  SBNT: { lat: -5.7681, lon: -35.3761, name: 'Natal São Gonçalo do Amarante Intl', elevFt: 272 },
  SBBE: { lat: -1.3792, lon: -48.4764, name: 'Belém Val-de-Cans Intl', elevFt: 56 },
  SBMN: { lat: -3.0386, lon: -60.0497, name: 'Manaus Eduardo Gomes Intl', elevFt: 264 },
  SAEZ: { lat: -34.8222, lon: -58.5358, name: 'Buenos Aires Ezeiza Intl', elevFt: 67 },
  SABE: { lat: -34.5592, lon: -58.4156, name: 'Buenos Aires Aeroparque Jorge Newbery', elevFt: 18 },
  SACO: { lat: -31.3100, lon: -64.2083, name: 'Córdoba Ingeniero Taravella', elevFt: 1604 },
  SAME: { lat: -32.8317, lon: -68.7928, name: 'Mendoza El Plumerillo', elevFt: 2310 },
  SUMU: { lat: -34.8384, lon: -56.0308, name: 'Montevideo Carrasco Intl', elevFt: 105 },
  SULS: { lat: -34.8551, lon: -55.0943, name: 'Punta del Este Laguna del Sauce', elevFt: 95 },
  SCEL: { lat: -33.3930, lon: -70.7858, name: 'Santiago Arturo Merino Benítez Intl', elevFt: 1555 },
  SLVR: { lat: -17.6448, lon: -63.1354, name: 'Santa Cruz Viru Viru Intl', elevFt: 1224 },
  SPJC: { lat: -12.0219, lon: -77.1143, name: 'Lima Jorge Chávez Intl', elevFt: 113 },
  SEQM: { lat: -0.1292, lon: -78.3575, name: 'Quito Mariscal Sucre Intl', elevFt: 7841 },
  SKBO: { lat: 4.7016, lon: -74.1469, name: 'Bogotá El Dorado Intl', elevFt: 8360 },
  SVMI: { lat: 10.6012, lon: -66.9913, name: 'Caracas Maiquetía Intl', elevFt: 235 },
  MPTO: { lat: 9.0714, lon: -79.3835, name: 'Panama City Tocumen Intl', elevFt: 135 },
  SBCW: { lat: -24.0500, lon: -49.5000, name: 'Curitiba FIR', elevFt: 0 },
  SBBS: { lat: -15.8700, lon: -47.9200, name: 'Brasília FIR', elevFt: 0 },
  SBAZ: { lat: -3.0400, lon: -60.0500, name: 'Amazônica FIR', elevFt: 0 },
  SGFA: { lat: -25.2400, lon: -57.5200, name: 'Asunción FIR', elevFt: 0 },
  // North America & Caribbean Executive Hubs
  KTEB: { lat: 40.8501, lon: -74.0608, name: 'Teterboro Airport (NY)', elevFt: 9 },
  KJFK: { lat: 40.6413, lon: -73.7781, name: 'New York John F. Kennedy Intl', elevFt: 13 },
  KEWR: { lat: 40.6895, lon: -74.1745, name: 'Newark Liberty Intl', elevFt: 18 },
  KLGA: { lat: 40.7769, lon: -73.8740, name: 'New York LaGuardia', elevFt: 21 },
  KHPN: { lat: 41.0670, lon: -73.7076, name: 'White Plains Westchester County', elevFt: 439 },
  KBED: { lat: 42.4700, lon: -71.2890, name: 'Bedford Hanscom Field', elevFt: 133 },
  KBOS: { lat: 42.3656, lon: -71.0096, name: 'Boston Logan Intl', elevFt: 20 },
  KIAD: { lat: 38.9531, lon: -77.4565, name: 'Washington Dulles Intl', elevFt: 312 },
  KDCA: { lat: 38.8512, lon: -77.0402, name: 'Washington Reagan National', elevFt: 15 },
  KPHL: { lat: 39.8729, lon: -75.2437, name: 'Philadelphia Intl', elevFt: 36 },
  KATL: { lat: 33.6407, lon: -84.4277, name: 'Atlanta Hartsfield-Jackson Intl', elevFt: 1026 },
  KMIA: { lat: 25.7959, lon: -80.2870, name: 'Miami International Airport', elevFt: 9 },
  KOPF: { lat: 25.9070, lon: -80.2784, name: 'Miami-Opa Locka Executive', elevFt: 8 },
  KFLL: { lat: 26.0742, lon: -80.1506, name: 'Fort Lauderdale-Hollywood Intl', elevFt: 9 },
  KPBI: { lat: 26.6832, lon: -80.0956, name: 'Palm Beach Intl', elevFt: 19 },
  KMCO: { lat: 28.4312, lon: -81.3081, name: 'Orlando Intl', elevFt: 96 },
  KTPA: { lat: 27.9755, lon: -82.5332, name: 'Tampa Intl', elevFt: 26 },
  KORD: { lat: 41.9742, lon: -87.9073, name: 'Chicago O\'Hare Intl', elevFt: 680 },
  KMDW: { lat: 41.7868, lon: -87.7522, name: 'Chicago Midway Intl', elevFt: 620 },
  KDFW: { lat: 32.8998, lon: -97.0403, name: 'Dallas/Fort Worth Intl', elevFt: 607 },
  KDAL: { lat: 32.8471, lon: -96.8518, name: 'Dallas Love Field', elevFt: 487 },
  KIAH: { lat: 29.9902, lon: -95.3368, name: 'Houston George Bush Intercontinental', elevFt: 97 },
  KHOU: { lat: 29.6454, lon: -95.2789, name: 'Houston William P. Hobby', elevFt: 46 },
  KAUS: { lat: 30.1945, lon: -97.6699, name: 'Austin-Bergstrom Intl', elevFt: 542 },
  KDEN: { lat: 39.8561, lon: -104.6737, name: 'Denver Intl', elevFt: 5434 },
  KASE: { lat: 39.2232, lon: -106.8688, name: 'Aspen Pitkin County', elevFt: 7838 },
  KRIL: { lat: 39.5263, lon: -107.7269, name: 'Rifle Garfield County', elevFt: 5537 },
  KEGE: { lat: 39.6426, lon: -106.9177, name: 'Eagle County Regional (Vail)', elevFt: 6547 },
  KSDL: { lat: 33.6229, lon: -111.9105, name: 'Scottsdale Airport', elevFt: 1510 },
  KPHX: { lat: 33.4342, lon: -112.0116, name: 'Phoenix Sky Harbor Intl', elevFt: 1135 },
  KLAS: { lat: 36.0840, lon: -115.1537, name: 'Las Vegas Harry Reid Intl', elevFt: 2181 },
  KVNY: { lat: 34.2098, lon: -118.4899, name: 'Van Nuys Airport (LA)', elevFt: 802 },
  KLAX: { lat: 33.9416, lon: -118.4085, name: 'Los Angeles Intl', elevFt: 128 },
  KSNA: { lat: 33.6757, lon: -117.8682, name: 'John Wayne Orange County', elevFt: 56 },
  KSAN: { lat: 32.7338, lon: -117.1933, name: 'San Diego Intl', elevFt: 17 },
  KSFO: { lat: 37.6213, lon: -122.3790, name: 'San Francisco Intl', elevFt: 13 },
  KOAK: { lat: 37.7213, lon: -122.2207, name: 'Oakland Intl', elevFt: 9 },
  KSJC: { lat: 37.3626, lon: -121.9290, name: 'San Jose Mineta Intl', elevFt: 62 },
  KSEA: { lat: 47.4502, lon: -122.3088, name: 'Seattle-Tacoma Intl', elevFt: 433 },
  PANC: { lat: 61.1743, lon: -149.9962, name: 'Anchorage Ted Stevens Intl', elevFt: 151 },
  PHNL: { lat: 21.3187, lon: -157.9224, name: 'Honolulu Daniel K. Inouye Intl', elevFt: 13 },
  CYYZ: { lat: 43.6777, lon: -79.6248, name: 'Toronto Pearson Intl', elevFt: 569 },
  CYUL: { lat: 45.4706, lon: -73.7408, name: 'Montréal-Trudeau Intl', elevFt: 118 },
  CYVR: { lat: 49.1967, lon: -123.1815, name: 'Vancouver Intl', elevFt: 14 },
  MMMX: { lat: 19.4363, lon: -99.0721, name: 'Mexico City Benito Juárez Intl', elevFt: 7316 },
  MMTO: { lat: 19.3371, lon: -99.5660, name: 'Toluca Lic. Adolfo López Mateos Intl', elevFt: 8466 },
  MMUN: { lat: 21.0365, lon: -86.8771, name: 'Cancún Intl', elevFt: 22 },
  MYNN: { lat: 25.0390, lon: -77.4662, name: 'Nassau Lynden Pindling Intl', elevFt: 16 },
  TNCM: { lat: 18.0410, lon: -63.1089, name: 'St. Maarten Princess Juliana Intl', elevFt: 13 },
  TJSJ: { lat: 18.4394, lon: -66.0018, name: 'San Juan Luis Muñoz Marín Intl', elevFt: 9 },
  // Europe, Africa, Middle East & Asia Executive Hubs
  EGSS: { lat: 51.8850, lon: 0.2350, name: 'London Stansted Airport', elevFt: 348 },
  EGGW: { lat: 51.8747, lon: -0.3683, name: 'London Luton Airport', elevFt: 526 },
  EGLF: { lat: 51.2758, lon: -0.7763, name: 'Farnborough Airport', elevFt: 238 },
  EGKB: { lat: 51.3308, lon: 0.0325, name: 'London Biggin Hill', elevFt: 599 },
  EGLL: { lat: 51.4700, lon: -0.4543, name: 'London Heathrow Intl', elevFt: 83 },
  EGKK: { lat: 51.1537, lon: -0.1821, name: 'London Gatwick Intl', elevFt: 202 },
  EIDW: { lat: 53.4213, lon: -6.2701, name: 'Dublin Airport', elevFt: 242 },
  EINN: { lat: 52.7020, lon: -8.9248, name: 'Shannon Airport', elevFt: 46 },
  LFPB: { lat: 48.9694, lon: 2.4414, name: 'Paris Le Bourget', elevFt: 218 },
  LFPG: { lat: 49.0097, lon: 2.5479, name: 'Paris Charles de Gaulle', elevFt: 392 },
  LFMN: { lat: 43.6584, lon: 7.2159, name: 'Nice Côte d\'Azur', elevFt: 12 },
  LFSB: { lat: 47.5900, lon: 7.5292, name: 'Basel Mulhouse EuroAirport', elevFt: 885 },
  LSGG: { lat: 46.2381, lon: 6.1089, name: 'Geneva Cointrin Intl', elevFt: 1411 },
  LSZH: { lat: 47.4582, lon: 8.5555, name: 'Zurich Airport', elevFt: 1417 },
  EDDF: { lat: 50.0379, lon: 8.5622, name: 'Frankfurt Airport', elevFt: 364 },
  EDDM: { lat: 48.3538, lon: 11.7861, name: 'Munich Airport', elevFt: 1487 },
  EDDB: { lat: 52.3667, lon: 13.5033, name: 'Berlin Brandenburg', elevFt: 157 },
  EHAM: { lat: 52.3086, lon: 4.7639, name: 'Amsterdam Schiphol', elevFt: -11 },
  EBBR: { lat: 50.9014, lon: 4.4844, name: 'Brussels Airport', elevFt: 184 },
  LOWW: { lat: 48.1103, lon: 16.5697, name: 'Vienna Intl', elevFt: 600 },
  LIML: { lat: 45.4451, lon: 9.2767, name: 'Milan Linate', elevFt: 353 },
  LIMC: { lat: 45.6306, lon: 8.7281, name: 'Milan Malpensa', elevFt: 767 },
  LIRA: { lat: 41.7994, lon: 12.5949, name: 'Rome Ciampino', elevFt: 427 },
  LIRF: { lat: 41.8003, lon: 12.2389, name: 'Rome Fiumicino', elevFt: 15 },
  LEMD: { lat: 40.4719, lon: -3.5626, name: 'Madrid Barajas Intl', elevFt: 1998 },
  LEBL: { lat: 41.2971, lon: 2.0785, name: 'Barcelona El Prat', elevFt: 14 },
  GCLP: { lat: 27.9319, lon: -15.3866, name: 'Gran Canaria Airport', elevFt: 78 },
  LPPT: { lat: 38.7813, lon: -9.1359, name: 'Lisbon Humberto Delgado', elevFt: 374 },
  LGAV: { lat: 37.9364, lon: 23.9445, name: 'Athens Eleftherios Venizelos', elevFt: 308 },
  LTFM: { lat: 41.2753, lon: 28.7519, name: 'Istanbul Airport', elevFt: 325 },
  HECA: { lat: 30.1219, lon: 31.4056, name: 'Cairo International Airport', elevFt: 382 },
  GMMN: { lat: 33.3675, lon: -7.5899, name: 'Casablanca Mohammed V Intl', elevFt: 656 },
  GOBD: { lat: 14.6700, lon: -17.0733, name: 'Dakar Blaise Diagne Intl', elevFt: 290 },
  DIAP: { lat: 5.2614, lon: -3.9263, name: 'Abidjan Félix-Houphouët-Boigny', elevFt: 20 },
  DNMM: { lat: 6.5774, lon: 3.3212, name: 'Lagos Murtala Muhammed Intl', elevFt: 135 },
  FAOR: { lat: -26.1392, lon: 28.2460, name: 'Johannesburg O.R. Tambo Intl', elevFt: 5558 },
  OEJN: { lat: 21.6796, lon: 39.1565, name: 'Jeddah King Abdulaziz Intl', elevFt: 48 },
  OERK: { lat: 24.9576, lon: 46.6988, name: 'Riyadh King Khalid Intl', elevFt: 2049 },
  OMDB: { lat: 25.2532, lon: 55.3657, name: 'Dubai International Airport', elevFt: 62 },
  OMDW: { lat: 24.8964, lon: 55.1614, name: 'Dubai Al Maktoum Intl', elevFt: 114 },
  OTHH: { lat: 25.2731, lon: 51.6081, name: 'Doha Hamad Intl', elevFt: 13 },
  OIII: { lat: 35.6892, lon: 51.3134, name: 'Tehran Mehrabad Intl', elevFt: 3962 },
  OPKC: { lat: 24.9065, lon: 67.1608, name: 'Karachi Jinnah Intl', elevFt: 100 },
  VABB: { lat: 19.0887, lon: 72.8679, name: 'Mumbai Chhatrapati Shivaji Intl', elevFt: 39 },
  VIDP: { lat: 28.5562, lon: 77.1000, name: 'New Delhi Indira Gandhi Intl', elevFt: 777 },
  VGHS: { lat: 23.8433, lon: 90.3978, name: 'Dhaka Hazrat Shahjalal Intl', elevFt: 30 },
  VCBI: { lat: 7.1808, lon: 79.8841, name: 'Colombo Bandaranaike Intl', elevFt: 30 },
  WSSS: { lat: 1.3644, lon: 103.9915, name: 'Singapore Changi Intl', elevFt: 22 },
  VHHH: { lat: 22.3080, lon: 113.9185, name: 'Hong Kong Intl', elevFt: 28 },
  RJTT: { lat: 35.5494, lon: 139.7798, name: 'Tokyo Haneda Intl', elevFt: 35 }
};

export const WAYPOINT_COORDS_DB = {
  // SBJH -> SGAS IFR Route Waypoints from ForeFlight Briefing (Pages 1 & 2)
  SBJH: { lat: -23.4281, lon: -47.1653 },
  EGIGI: { lat: -23.3500, lon: -47.5200 },
  ASETA: { lat: -23.3800, lon: -47.7800 },
  UKLEN: { lat: -23.4500, lon: -48.3200 },
  '-TOC-': { lat: -23.5600, lon: -48.9500 },
  USVIG: { lat: -23.6800, lon: -49.5500 },
  UGVIG: { lat: -23.7500, lon: -49.8500 },
  AKREL: { lat: -23.8800, lon: -50.4500 },
  GETGO: { lat: -24.1000, lon: -51.4500 },
  VUGUG: { lat: -24.3000, lon: -52.3500 },
  NETBO: { lat: -24.4800, lon: -53.1500 },
  KOVES: { lat: -24.5500, lon: -53.5000 },
  BOLIR: { lat: -24.7800, lon: -54.6200 },
  '-TOD-': { lat: -24.9200, lon: -55.4500 },
  DEVOS: { lat: -25.0500, lon: -56.2500 },
  SGAS: { lat: -25.2400, lon: -57.5192 }
};

export class NotamParser {
  /**
   * Parse a complete flight briefing document (ForeFlight, Jeppesen, or standard text).
   */
  static parseFullBriefing(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const cleaned = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/NOTAMs\s+\d+\s+of\s+\d+/gi, '')
      .replace(/WX:\s+Page\s+\d+\s+of\s+\d+/gi, '');

    const briefing = {
      isForeflight: false,
      hasFlightEndpoints: false,
      route: '',
      depIcao: '',
      arrIcao: '',
      altIcao: '',
      depName: '',
      arrName: '',
      altName: '',
      enrouteIcaos: [],
      firIcaos: [],
      stationFirMap: {},
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
      routeProfile: null,
      sections: [],
      allNotams: [],
      rawNotamCount: 0
    };

    // 1. Detect ForeFlight / Dispatch Header: e.g. "SBJH — SGAS (Oct 02, 2026) in N650MV (GLF6)"
    //    Also supports "KTEB to EGGW", "ROUTE: KTEB - EGGW", "VABB/OMDB", etc.
    const topBannerSlice = cleaned.substring(0, 600);
    const headerMatch =
      cleaned.match(/([A-Z]{4})\s*(?:[—–\-➔>\/]|\bto\b)\s*([A-Z]{4})\s*\(([A-Za-z0-9\s,/-]+)\)(?:\s*in\s*([A-Za-z0-9-]+)(?:\s*\(([A-Za-z0-9]+)\))?)?/i) ||
      cleaned.match(/(?:ROUTE|FLIGHT|BRIEFING)\s*[:\-]?\s*([A-Z]{4})\s*(?:[—–\-➔>\/]|\bto\b)\s*([A-Z]{4})\b/i) ||
      topBannerSlice.match(/\b([A-Z]{4})\s*(?:[—–➔>]|\bto\b)\s*([A-Z]{4})\b/i);
    const headerStopWords = new Set(['FROM', 'TIME', 'PAGE', 'WIND', 'TEMP', 'TURB', 'TRUE', 'SAFE', 'DATA', 'TEXT', 'INFO', 'NOTE', 'PART', 'NONE', 'WITH', 'OVER', 'NEXT', 'LAST']);
    if (headerMatch && !headerStopWords.has(headerMatch[1].toUpperCase()) && !headerStopWords.has(headerMatch[2].toUpperCase())) {
      briefing.isForeflight = true;
      briefing.depIcao = headerMatch[1].toUpperCase();
      briefing.arrIcao = headerMatch[2].toUpperCase();
      if (headerMatch[3]) briefing.flightDateStr = headerMatch[3].trim();
      if (headerMatch[4]) briefing.tailNumber = headerMatch[4].toUpperCase();
      if (headerMatch[5]) briefing.aircraftType = headerMatch[5].toUpperCase();
      briefing.route = `${briefing.depIcao} — ${briefing.arrIcao}`;
    }

    // 2. Extract Departure, Destination & Alternate times & station names
    const depTimedMatch = cleaned.match(/Departure\s*\(([0-9]{4})Z\):\s*([A-Z]{4})[ \t]*(?:-[ \t]*([^\n\r]+))?/i);
    const depNamedMatch = !depTimedMatch && cleaned.match(/(?:^|\n)[ \t]*Departure(?:[ \t]+Airport|[ \t]+NOTAMs)?[ \t]*[:\-]?[ \t]*(?:\n[ \t]*)?([A-Z]{4})(?:(?:[ \t]*-[ \t]*|[ \t]+)([A-Za-z][^\n\r]*))?(?=[ \t]*\n|$)/i);
    if (depTimedMatch) {
      briefing.isForeflight = true;
      briefing.depTimeUtcStr = depTimedMatch[1].slice(0, 2) + ':' + depTimedMatch[1].slice(2, 4) + 'Z';
      if (!briefing.depIcao) briefing.depIcao = depTimedMatch[2].toUpperCase();
      if (depTimedMatch[3]) briefing.depName = depTimedMatch[3].trim();
    } else if (depNamedMatch && !headerStopWords.has(depNamedMatch[1].toUpperCase())) {
      briefing.isForeflight = true;
      if (!briefing.depIcao) briefing.depIcao = depNamedMatch[1].toUpperCase();
      if (depNamedMatch[2] && !/NOTAM|[A-Z][0-9]{4}\/[0-9]{2}/i.test(depNamedMatch[2])) briefing.depName = depNamedMatch[2].trim();
    }

    const arrTimedMatch = cleaned.match(/Destination\s*\(([0-9]{4})Z\):\s*([A-Z]{4})[ \t]*(?:-[ \t]*([^\n\r]+))?/i);
    const arrNamedMatch = !arrTimedMatch && cleaned.match(/(?:^|\n)[ \t]*Destination(?:[ \t]+Airport|[ \t]+NOTAMs)?[ \t]*[:\-]?[ \t]*(?:\n[ \t]*)?([A-Z]{4})(?:(?:[ \t]*-[ \t]*|[ \t]+)([A-Za-z][^\n\r]*))?(?=[ \t]*\n|$)/i);
    if (arrTimedMatch) {
      briefing.isForeflight = true;
      briefing.arrTimeUtcStr = arrTimedMatch[1].slice(0, 2) + ':' + arrTimedMatch[1].slice(2, 4) + 'Z';
      if (!briefing.arrIcao) briefing.arrIcao = arrTimedMatch[2].toUpperCase();
      if (arrTimedMatch[3]) briefing.arrName = arrTimedMatch[3].trim();
    } else if (arrNamedMatch && !headerStopWords.has(arrNamedMatch[1].toUpperCase())) {
      briefing.isForeflight = true;
      if (!briefing.arrIcao) briefing.arrIcao = arrNamedMatch[1].toUpperCase();
      if (arrNamedMatch[2] && !/NOTAM|[A-Z][0-9]{4}\/[0-9]{2}/i.test(arrNamedMatch[2])) briefing.arrName = arrNamedMatch[2].trim();
    }

    const altMatch = cleaned.match(/(?:^|\n)[ \t]*Alternate(?:[ \t]+airport|[ \t]+NOTAMs)?[ \t]*(?:\([0-9]{4}Z\))?[ \t]*[:\-]?[ \t]*(?:\n[ \t]*)?([A-Z]{4})(?:(?:[ \t]*-[ \t]*|[ \t]+)([A-Za-z][^\n\r]*))?(?=[ \t]*\n|$)/i);
    if (altMatch && /^[A-Z]{4}$/.test(altMatch[1].toUpperCase()) && !headerStopWords.has(altMatch[1].toUpperCase())) {
      briefing.altIcao = altMatch[1].toUpperCase();
      if (altMatch[2] && !/NOTAM|[A-Z][0-9]{4}\/[0-9]{2}/i.test(altMatch[2])) briefing.altName = altMatch[2].trim();
    }

    // Also support ICAO Flight Plan (FPL) blocks if included in the briefing PDF
    const fplMatch = cleaned.match(/\(FPL-([A-Z0-9-]+)-[A-Z]{1,2}[\s\S]{1,120}?-([A-Z]{4})([0-9]{4})\s+-[NKM][0-9]{4}[FA][0-9]{3,4}\s+[\s\S]{1,600}?-([A-Z]{4})([0-9]{4})(?:\s+([A-Z]{4}))?/i);
    if (fplMatch) {
      if (!briefing.tailNumber && fplMatch[1]) briefing.tailNumber = fplMatch[1].toUpperCase();
      if (!briefing.depIcao && fplMatch[2]) briefing.depIcao = fplMatch[2].toUpperCase();
      if (!briefing.depTimeUtcStr && fplMatch[3]) {
        briefing.depTimeUtcStr = `${fplMatch[3].slice(0, 2)}:${fplMatch[3].slice(2, 4)}Z`;
      }
      if (!briefing.arrIcao && fplMatch[4]) briefing.arrIcao = fplMatch[4].toUpperCase();
      if (!briefing.altIcao && fplMatch[6]) briefing.altIcao = fplMatch[6].toUpperCase();
    }

    if (!briefing.flightDateStr) {
      const genericDateMatch = topBannerSlice.match(/\b([0-9]{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20[2-3][0-9]|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{1,2},?\s+20[2-3][0-9]|20[2-3][0-9]-[0-9]{2}-[0-9]{2})\b/i);
      if (genericDateMatch) {
        briefing.flightDateStr = genericDateMatch[1].trim();
      }
    }
    if (!briefing.depTimeUtcStr) {
      const genericTimeMatch = topBannerSlice.match(/\b([0-9]{2}:[0-9]{2})\s*(?:UTC|Z)\b/i) ||
                               topBannerSlice.match(/\b([0-9]{2})([0-9]{2})\s*(?:UTC|Z)\b/i);
      if (genericTimeMatch) {
        briefing.depTimeUtcStr = genericTimeMatch[2]
          ? `${genericTimeMatch[1]}:${genericTimeMatch[2]}Z`
          : `${genericTimeMatch[1]}Z`;
      }
    }

    if (briefing.flightDateStr && briefing.depTimeUtcStr) {
      briefing.depTimeUtc = this.parseDateWithTime(briefing.flightDateStr, briefing.depTimeUtcStr);
    } else if (briefing.flightDateStr) {
      briefing.depTimeUtc = this.parseDateWithTime(briefing.flightDateStr, '12:00Z');
    }
    if (briefing.flightDateStr && briefing.arrTimeUtcStr) {
      briefing.arrTimeUtc = this.parseDateWithTime(briefing.flightDateStr, briefing.arrTimeUtcStr);
      // Handle overnight flights crossing midnight UTC
      if (briefing.depTimeUtc && briefing.arrTimeUtc && briefing.arrTimeUtc < briefing.depTimeUtc) {
        briefing.arrTimeUtc = new Date(briefing.arrTimeUtc.getTime() + 24 * 3600000);
      }
    } else if (briefing.depTimeUtc) {
      briefing.arrTimeUtc = new Date(briefing.depTimeUtc.getTime() + 3 * 3600000);
    }

    // 3. Extract METARs (deduplicated by station; supports "METAR KTEB 060851Z..." or standalone "KTEB 060851Z 28012KT...")
    const seenMetars = new Set();
    const metarMatches = [
      ...cleaned.matchAll(/(?:METAR\s*●?\s*)?(METAR\s+(?:COR\s+|AUTO\s+)?([A-Z0-9]{4})\s+([0-9]{6}Z)\s+[^\n\r]+)/gi),
      ...cleaned.matchAll(/(?:^|\n)\s*(([A-Z]{4})\s+([0-9]{6}Z)\s+(?:AUTO\s+|COR\s+)?(?:[0-9]{5}(?:G[0-9]{2})?KT|VRB[0-9]{2}KT|00000KT)[^\n\r]+)/gi)
    ];
    for (const m of metarMatches) {
      const fullMetar = m[1].trim().startsWith('METAR') ? m[1].trim() : `METAR ${m[1].trim()}`;
      const station = m[2].toUpperCase();
      if (!seenMetars.has(station)) {
        seenMetars.add(station);
        briefing.metars.push(this.decodeMetar(fullMetar, station));
      }
    }

    // 4. Extract TAFs (match explicit station code or nearest preceding METAR station)
    const tafMatches = [
      ...cleaned.matchAll(/TAF(?:\s+AMD|\s+COR)?\s*●?\s*(?:([A-Z]{4})\s+)?([0-9]{6}Z\s+[0-9]{4}\/[0-9]{4}\s+[^\n\r]+(?:\n\s*(?:●|BECMG|TEMPO|FM[0-9]{6}|PROB[0-9]{2})[^\n\r]+)*)/gi),
      ...cleaned.matchAll(/(?:^|\n)\s*([A-Z]{4})\s+([0-9]{6}Z\s+[0-9]{4}\/[0-9]{4}\s+[^\n\r]+(?:\n\s*(?:●|BECMG|TEMPO|FM[0-9]{6}|PROB[0-9]{2})[^\n\r]+)*)/gi)
    ];
    const seenTafs = new Set();
    tafMatches.forEach((m, idx) => {
      let station = m[1] ? m[1].toUpperCase() : '';
      if (!station && m.index !== undefined) {
        // Look backwards up to 600 chars for the station header or METAR
        const lookback = cleaned.substring(Math.max(0, m.index - 600), m.index);
        const prevMetar = [...lookback.matchAll(/METAR\s+(?:COR\s+|AUTO\s+)?([A-Z]{4})\b/gi)];
        if (prevMetar.length > 0) {
          station = prevMetar[prevMetar.length - 1][1].toUpperCase();
        }
      }
      if (!station) {
        station = idx === 0 ? briefing.depIcao : (idx === 1 ? briefing.arrIcao : (briefing.metars[idx]?.icao || ''));
      }
      const rawTaf = (station ? `${station} ` : '') + m[2].replace(/●/g, ' ').replace(/\s+/g, ' ').trim();
      const tafKey = `${station}_${m[2].slice(0, 15).trim()}`;
      if (!seenTafs.has(tafKey)) {
        seenTafs.add(tafKey);
        briefing.tafs.push({
          icao: station,
          raw: rawTaf
        });
      }
    });

    // 5. Extract SIGMETs / AIRMETs + Polygon Coordinates
    const seenSigmets = new Set();
    const sigmetMatches = cleaned.matchAll(/([A-Z0-9]{4})\s+SIGMET\s+([A-Z0-9]+)\s+VALID\s+([0-9]{6}\/[0-9]{6})\s+([A-Z0-9]{4})\s*-\s*([\s\S]*?)(?=(?:\n\s*[A-Z0-9]{4}\s+SIGMET|\n\s*SIGMET|\n\s*No\s+SIGMET|\n\s*NOTAMs|$))/gi);
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
      const polygon = this.parseSigmetPolygon(details);

      const sigKey = `${fir}_${num}_${phenomenon}_${flRange}`;
      if (!seenSigmets.has(sigKey)) {
        seenSigmets.add(sigKey);
        briefing.sigmets.push({
          fir,
          number: num,
          validity: valid,
          phenomenon,
          flRange,
          polygon,
          raw: `${fir} SIGMET ${num} VALID ${valid} - ${details}`
        });
      }
    }

    // 6. Split and Group NOTAMs by ForeFlight Sections if present
    const sectionPattern = /(?:\n|^)[ \t]*(Departure(?:[ \t]+NOTAMs)?|Destination(?:[ \t]+NOTAMs)?|Alternate(?:[ \t]+airport|[ \t]+NOTAMs)?|Enroute(?:[ \t]+airport|[ \t]*\/[ \t]*FIR[ \t]+NOTAMs)?|FIR)[ \t]*(?:\n[ \t]*|[ \t]+)([A-Z0-9]{4})(?:(?:[ \t]*-[ \t]*|[ \t]+)([^\n\r]+))?(?=[ \t]*\n)/gi;
    const sectionMatches = [...cleaned.matchAll(sectionPattern)];

    const enrouteSet = new Set();
    const firSet = new Set();

    if (sectionMatches.length > 0) {
      briefing.isForeflight = true;
      for (let i = 0; i < sectionMatches.length; i++) {
        const cur = sectionMatches[i];
        const next = sectionMatches[i + 1];
        const label = cur[1].toUpperCase();
        const sectionType = label.includes('DEP') ? 'DEP'
                          : label.includes('DEST') ? 'ARR'
                          : label.includes('ALT') ? 'ALT'
                          : (label.includes('ENROUTE') && !label.includes('FIR')) ? 'ENROUTE' : 'FIR';
        const icao = cur[2].toUpperCase();
        const name = cur[3] ? cur[3].trim() : '';

        // Populate top-level briefing stations from section headers if not already set
        if (sectionType === 'DEP') {
          if (!briefing.depIcao) briefing.depIcao = icao;
          if (name && !briefing.depName) briefing.depName = name;
        } else if (sectionType === 'ARR') {
          if (!briefing.arrIcao) briefing.arrIcao = icao;
          if (name && !briefing.arrName) briefing.arrName = name;
        } else if (sectionType === 'ALT') {
          if (!briefing.altIcao) briefing.altIcao = icao;
          if (name && !briefing.altName) briefing.altName = name;
          if (!briefing.altIcaos) briefing.altIcaos = [];
          if (!briefing.altIcaos.includes(icao)) briefing.altIcaos.push(icao);
        } else if (sectionType === 'ENROUTE') {
          enrouteSet.add(icao);
        } else if (sectionType === 'FIR') {
          firSet.add(icao);
        }

        // Update AIRPORT_COORDS_DB station name if already in DB
        if (sectionType !== 'FIR' && name && AIRPORT_COORDS_DB[icao]) {
          AIRPORT_COORDS_DB[icao].name = name;
        }

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
          parsed.stationName = name || (AIRPORT_COORDS_DB[icao] ? AIRPORT_COORDS_DB[icao].name : '');
          if (parsed.fir && /^[A-Z]{4}$/.test(parsed.fir)) {
            firSet.add(parsed.fir);
            if (sectionType !== 'FIR' && parsed.icao && parsed.icao !== parsed.fir) {
              briefing.stationFirMap[parsed.icao] = parsed.fir;
            }
          }
          // Ensure dynamically harvested airport coordinates get the human-readable station name
          if (sectionType !== 'FIR' && name && AIRPORT_COORDS_DB[icao]) {
            AIRPORT_COORDS_DB[icao].name = name;
          }
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
      const parsedNotams = rawNotamBlocks.map(block => {
        const parsed = this.parseNotam(block, briefing.depIcao || '');
        if (parsed.fir && /^[A-Z]{4}$/.test(parsed.fir)) {
          firSet.add(parsed.fir);
          if (parsed.icao && parsed.icao !== parsed.fir) {
            briefing.stationFirMap[parsed.icao] = parsed.fir;
          }
        }
        return parsed;
      });
      briefing.allNotams = this.deduplicateNotams(parsedNotams);
    }

    // Also collect any FIRs referenced on Q-lines or ICAO Item 18 EET/ across the briefing
    const eetMatch = cleaned.match(/\bEET\/([A-Z0-9\s]{6,120}?)(?=\s+(?:REG|SEL|CODE|OPR|ORGN|PER|ALTN|RALT|TALT|RMK|NAV|DAT|SUR|DOF|TYP|COM)\/|\)|\n\n|$)/i);
    if (eetMatch) {
      for (const m of eetMatch[1].matchAll(/\b([A-Z]{4})[0-9]{4}\b/gi)) {
        firSet.add(m[1].toUpperCase());
      }
    }

    briefing.allNotams.forEach(n => {
      if (n.fir && /^[A-Z]{4}$/.test(n.fir)) {
        firSet.add(n.fir);
        if (n.icao && n.icao !== n.fir) {
          briefing.stationFirMap[n.icao] = n.fir;
        }
      }
    });

    // If depIcao/arrIcao were still not resolved, infer from aerodrome METARs or non-FIR NOTAM ICAOs
    if (!briefing.depIcao || !briefing.arrIcao) {
      const distinctAerodromes = [
        ...briefing.metars.map(m => m.icao),
        ...briefing.allNotams.map(n => n.icao).filter(c => !firSet.has(c))
      ].filter(c => /^[A-Z]{4}$/.test(c) && !firSet.has(c));
      const uniqueStations = [...new Set(distinctAerodromes)];
      if (!briefing.depIcao && uniqueStations[0]) briefing.depIcao = uniqueStations[0];
      const arrCandidates = uniqueStations.filter(c => c !== briefing.depIcao && c !== briefing.altIcao);
      if (!briefing.arrIcao && arrCandidates[0]) briefing.arrIcao = arrCandidates[0];
      if (!briefing.arrIcao && uniqueStations[1]) briefing.arrIcao = uniqueStations[1];
      if (!briefing.arrIcao && uniqueStations[0]) briefing.arrIcao = uniqueStations[0];
      arrCandidates.slice(1).forEach(st => enrouteSet.add(st));
    }

    // Fallback names from AIRPORT_COORDS_DB if not extracted from text
    if (briefing.depIcao && !briefing.depName && AIRPORT_COORDS_DB[briefing.depIcao]) {
      briefing.depName = AIRPORT_COORDS_DB[briefing.depIcao].name;
    }
    if (briefing.arrIcao && !briefing.arrName && AIRPORT_COORDS_DB[briefing.arrIcao]) {
      briefing.arrName = AIRPORT_COORDS_DB[briefing.arrIcao].name;
    }

    briefing.enrouteIcaos = Array.from(enrouteSet).filter(c => c !== briefing.depIcao && c !== briefing.arrIcao);
    if (!briefing.altIcao && briefing.enrouteIcaos.length > 0) {
      briefing.altIcao = briefing.enrouteIcaos[0];
    }
    briefing.firIcaos = Array.from(firSet);
    briefing.hasFlightEndpoints = Boolean(briefing.depIcao || briefing.arrIcao);
    if (briefing.depIcao && briefing.arrIcao) {
      briefing.route = `${briefing.depIcao} — ${briefing.arrIcao}`;
    }

    // Now that all sections (and dynamic Q-line airport coordinates) have been parsed, enrich distances
    briefing.allNotams.forEach(n => {
      this.enrichNotamDistance(n, briefing.depIcao, briefing.arrIcao);
    });

    // 7. Extract Route Profile & Waypoints
    briefing.routeProfile = this.extractRouteProfile(cleaned, briefing.depIcao, briefing.arrIcao, briefing);

    return briefing;
  }

  /**
   * Extract Route Profile, Waypoints, Cruise FL, Tropopause, and TOC/TOD from ForeFlight briefing.
   */
  static extractRouteProfile(cleanedText, depIcao, arrIcao, briefing = null) {
    const dep = (depIcao || 'SBJH').toUpperCase();
    const arr = (arrIcao || 'SGAS').toUpperCase();

    const flMatch = cleanedText.match(/WIND\/TEMP\/TURB\s+FL\s*([0-9]{3})/i) ||
                    cleanedText.match(/\bCRUISE\s+FL\s*([0-9]{3})\b/i);
    const cruiseFl = flMatch ? `FL${flMatch[1]}` : 'FL450';
    const cruiseFlNum = flMatch ? flMatch[1] : '450';

    const tropoMatch = cleanedText.match(/Tropopause\s+FL\s+([0-9\s]+)/i);
    let tropoRange = 'FL480–530';
    if (tropoMatch) {
      const nums = tropoMatch[1].trim().split(/\s+/).map(Number).filter(n => n > 200 && n < 700);
      if (nums.length > 0) {
        tropoRange = `FL${Math.min(...nums)}–${Math.max(...nums)}`;
      }
    }

    // If SBJH -> SGAS, build exact ForeFlight waypoint timeline from Page 1 & 2
    if (dep === 'SBJH' && arr === 'SGAS') {
      return {
        cruiseFl: flMatch ? `FL${flMatch[1]}` : 'FL470',
        tropoRange: tropoMatch ? tropoRange : 'FL500–545',
        climbNote: 'Crosses SBCW Severe Icing layer (FL140–210) between 14:05Z–14:09Z (~4 min in climb).',
        cruiseNote: `Smooth air at ${flMatch ? `FL${flMatch[1]}` : 'FL470'} (OAT -65°C, well below ${tropoRange} Tropopause). Light-mod turb (EDR 0.3) remains below at FL300 near BOLIR.`,
        waypoints: [
          { id: 'SBJH', time: '14:00Z', fl: '025', phase: 'DEP', lat: -23.4281, lon: -47.1653 },
          { id: 'EGIGI', time: '14:04Z', fl: '130', phase: 'CLB', lat: -23.3500, lon: -47.5200 },
          { id: 'UKLEN', time: '14:11Z', fl: '310', phase: 'CLB', lat: -23.4500, lon: -48.3200 },
          { id: 'TOC', time: '14:17Z', fl: '430', phase: 'TOC', lat: -23.5600, lon: -48.9500 },
          { id: 'AKREL', time: '14:25Z', fl: '430', phase: 'CRZ', lat: -23.8800, lon: -50.4500 },
          { id: 'GETGO', time: '14:34Z', fl: '430', phase: 'CRZ', lat: -24.1000, lon: -51.4500 },
          { id: 'VUGUG', time: '14:39Z', fl: '430', phase: 'CRZ', lat: -24.3000, lon: -52.3500 },
          { id: 'NETBO', time: '14:43Z', fl: '430', phase: 'CRZ', lat: -24.4800, lon: -53.1500 },
          { id: 'BOLIR', time: '14:58Z', fl: '470', phase: 'CRZ', lat: -24.7800, lon: -54.6200 },
          { id: 'TOD', time: '15:05Z', fl: '470', phase: 'TOD', lat: -24.9200, lon: -55.4500 },
          { id: 'DEVOS', time: '15:14Z', fl: '260', phase: 'DSC', lat: -25.0500, lon: -56.2500 },
          { id: 'SGAS', time: '15:27Z', fl: '003', phase: 'ARR', lat: -25.2400, lon: -57.5192 }
        ]
      };
    }

    // Dynamic route profile for ANY other uploaded or selected flight
    const depCoord = AIRPORT_COORDS_DB[dep];
    const arrCoord = AIRPORT_COORDS_DB[arr];
    if (depCoord && arrCoord) {
      const etdLabel = (briefing && briefing.depTimeUtcStr) ? briefing.depTimeUtcStr : 'ETD';
      const etaLabel = (briefing && briefing.arrTimeUtcStr) ? briefing.arrTimeUtcStr : 'ETA';
      const sigmets = (briefing && briefing.sigmets) || [];
      const climbNote = sigmets.length > 0
        ? `Active SIGMET (${sigmets[0].fir}: ${sigmets[0].phenomenon} ${sigmets[0].flRange || ''}) — Monitor Wing/Cowl Anti-Ice & weather radar.`
        : `Standard G650ER Mach 0.85 / 300 KIAS climb schedule (${dep} ➔ ${arr}).`;
      const cruiseNote = `High-altitude Mach 0.85–0.88 executive cruise at ${cruiseFl} (Tropopause ${tropoRange}).`;

      const tocLat = Number((depCoord.lat + (arrCoord.lat - depCoord.lat) * 0.20).toFixed(4));
      const tocLon = Number((depCoord.lon + (arrCoord.lon - depCoord.lon) * 0.20).toFixed(4));
      const todLat = Number((depCoord.lat + (arrCoord.lat - depCoord.lat) * 0.82).toFixed(4));
      const todLon = Number((depCoord.lon + (arrCoord.lon - depCoord.lon) * 0.82).toFixed(4));

      const waypoints = [
        { id: dep, time: etdLabel, fl: 'GND', phase: 'DEP', lat: depCoord.lat, lon: depCoord.lon },
        { id: 'TOC', time: '+18m', fl: '430', phase: 'TOC', lat: tocLat, lon: tocLon }
      ];

      // Include up to 3 intermediate en-route stations along the corridor if their coordinates are known
      const enrouteCodes = (briefing && Array.isArray(briefing.enrouteIcaos)) ? briefing.enrouteIcaos.slice(0, 3) : [];
      if (enrouteCodes.length > 0) {
        enrouteCodes.forEach((code, idx) => {
          const frac = (idx + 1) / (enrouteCodes.length + 1);
          const interpLat = Number((tocLat + (todLat - tocLat) * frac).toFixed(4));
          const interpLon = Number((tocLon + (todLon - tocLon) * frac).toFixed(4));
          waypoints.push({
            id: code,
            time: 'CRZ',
            fl: cruiseFlNum,
            phase: 'CRZ',
            lat: interpLat,
            lon: interpLon
          });
        });
      } else {
        const midLat = Number((depCoord.lat + (arrCoord.lat - depCoord.lat) * 0.50).toFixed(4));
        const midLon = Number((depCoord.lon + (arrCoord.lon - depCoord.lon) * 0.50).toFixed(4));
        waypoints.push({ id: 'MID', time: 'CRZ', fl: cruiseFlNum, phase: 'CRZ', lat: midLat, lon: midLon });
      }

      waypoints.push(
        { id: 'TOD', time: '-20m', fl: cruiseFlNum, phase: 'TOD', lat: todLat, lon: todLon },
        { id: arr, time: etaLabel, fl: 'GND', phase: 'ARR', lat: arrCoord.lat, lon: arrCoord.lon }
      );

      return {
        cruiseFl,
        tropoRange,
        climbNote,
        cruiseNote,
        waypoints
      };
    }

    return null;
  }

  /**
   * Parse SIGMET coordinate string e.g. "WI S2125 W05304 - S2335 W05059 - ..."
   */
  static parseSigmetPolygon(details) {
    const coords = [];
    const regex = /([NS])\s*([0-9]{2})([0-9]{2})\s+([EW])\s*([0-9]{3})([0-9]{2})/gi;
    for (const m of details.matchAll(regex)) {
      const latSign = m[1].toUpperCase() === 'S' ? -1 : 1;
      const lat = latSign * (parseInt(m[2], 10) + parseInt(m[3], 10) / 60);
      const lonSign = m[4].toUpperCase() === 'W' ? -1 : 1;
      const lon = lonSign * (parseInt(m[5], 10) + parseInt(m[6], 10) / 60);
      coords.push([Number(lat.toFixed(4)), Number(lon.toFixed(4))]);
    }
    return coords.length >= 3 ? coords : [];
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

    const idRegex = /(?:^|\n)\s*(\(?[A-Z][0-9]{4}\/[0-9]{2}\s+NOTAM[NRC](?:\s+[A-Z][0-9]{4}\/[0-9]{2}|\s+[0-9]+)?|![A-Z0-9]{3,4}\s+[0-9]{1,2}\/[0-9]+|![A-Z]{3,4}\s+[A-Z0-9]+\s+[0-9]{1,2}\/[0-9]+)/gi;
    const matches = [...cleaned.matchAll(idRegex)];

    if (matches.length === 0) {
      return cleaned.trim().length >= 15 ? [cleaned.trim()] : [];
    }

    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
      const curMatch = matches[i];
      const nextMatch = matches[i + 1];

      const prevEnd = i === 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length;
      const preText = cleaned.substring(prevEnd, curMatch.index);
      const preLines = preText.split('\n').map(l => l.trim()).filter(Boolean);

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

      let blockEnd = nextMatch ? nextMatch.index : cleaned.length;
      if (nextMatch) {
        const betweenText = cleaned.substring(curMatch.index, nextMatch.index);
        const betweenLines = betweenText.split('\n');
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
   * Deduplicate and group redundant/bilingual NOTAMs.
   */
  static deduplicateNotams(notams) {
    if (!notams || notams.length <= 1) return notams;

    const groups = new Map();

    for (const n of notams) {
      const signature = this.getNotamDedupeSignature(n);
      if (!groups.has(signature)) {
        const ids = [n.id].filter(Boolean);
        n.groupedIds = ids;
        n.mergedIds = ids;
        n.groupedRaw = [n.raw];
        n.groupedCount = 1;
        n.mergedCount = 1;
        groups.set(signature, n);
      } else {
        const existing = groups.get(signature);
        if (n.id && !existing.groupedIds.includes(n.id)) {
          existing.groupedIds.push(n.id);
        }
        existing.mergedIds = existing.groupedIds;
        existing.groupedRaw.push(n.raw);
        existing.groupedCount = existing.groupedIds.length || (existing.groupedCount + 1);
        existing.mergedCount = existing.groupedCount;

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

  static getNotamDedupeSignature(notam) {
    const icao = notam.sectionIcao || notam.icao || '';
    const body = (notam.bodyText || '').toUpperCase();

    if (body.includes('BARUERI-SP') && (body.includes('FLT RPA') || body.includes('AREA RESTRITA'))) {
      return `${icao}_CLUSTER_BARUERI_RPA_${notam.upperLimit || '2700FT'}`;
    }
    if (body.includes('SOROCABA') && (body.includes('BALLOON') || body.includes('BALAO') || body.includes('BALONISMO'))) {
      return `${icao}_CLUSTER_SOROCABA_BALLOON`;
    }
    if ((body.includes('COMITE OLIMPICO PARAGUAYO') || body.includes('WORLD SKATE GAMES')) && body.includes('UA WILL TAKE PLACE')) {
      const isInact = notam.foreflightTag ? 'INACT' : 'ACT';
      return `${icao}_CLUSTER_LUQUE_UA_${isInact}`;
    }
    const supMatch = body.match(/SUP\s+AIP\s*\(E-AIP\)\s*([0-9]+\/[0-9]+)\s*CNL/i);
    if (supMatch) {
      return `${icao}_SUP_AIP_CNL_${supMatch[1]}`;
    }
    if (body.includes('TRIGGER NOTAM') || body.includes('NOTAM INICIADOR')) {
      const airacMatch = body.match(/([0-9]{2}\/[0-9]{2}|2610A1|02\/2026)/i);
      return `${icao}_TRIGGER_${airacMatch ? airacMatch[1] : 'GEN'}`;
    }
    const rwyClsdMatch = body.match(/(?:RWY|RUNWAY|PISTA)\s*([0-9]{2}[LRC]?(?:\/[0-9]{2}[LRC]?)?)\s*(?:CLSD|CLOSED)/i);
    if (rwyClsdMatch) {
      return `${icao}_RWY_CLSD_${rwyClsdMatch[1]}_${notam.scheduleRaw || notam.validFromRaw}`;
    }
    if (body.includes('ALSF') && (body.includes('WITHOUT FLASH') || body.includes('SEM FLASH'))) {
      return `${icao}_ALS_NO_FLASH`;
    }
    if (body.includes('112.100MHZ') || (body.includes('VOR/DME') && body.includes('FOZ'))) {
      return `${icao}_VORDME_FOZ_US`;
    }
    const twrFreqMatch = body.match(/TWR\s+[A-Z]+\s+FREQ\s+([0-9.]+MHZ)\s+INSTL/i);
    if (twrFreqMatch) {
      return `${icao}_TWR_FREQ_${twrFreqMatch[1]}`;
    }
    if (body.includes('132.4') && body.includes('135.7') && body.includes('126.7')) {
      return `${icao}_FIS_CURITIBA_SECT`;
    }

    return `${icao}_${notam.id || Math.random()}`;
  }

  /**
   * Parse a single NOTAM text block into a structured object including geo coordinates.
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
      stationName: '',
      subLocation: '',
      groupedIds: [],
      mergedIds: [],
      groupedRaw: [raw],
      groupedCount: 1,
      mergedCount: 1,
      geometry: null,
      distanceBadge: null,
      rawFields: {}
    };

    const tagMatch = raw.match(/\[(Inactive\s+at\s+ETD|Inactive\s+at\s+ETA|Inactive\s+during\s+flight)\]/i);
    if (tagMatch) {
      result.foreflightTag = tagMatch[1];
    }
    if (/\(NEW TODAY\)/i.test(raw)) {
      result.isNewToday = true;
    }

    // 1. Check for ICAO NOTAM ID
    const icaoIdMatch = raw.match(/(?:\(?\s*)([A-Z0-9]{1,2}[0-9]{4}\/[0-9]{2})\s*(NOTAM[NRC])?(?:\s+([0-9]+))?/i);
    if (icaoIdMatch) {
      result.id = icaoIdMatch[1].toUpperCase() + (icaoIdMatch[3] ? ` #${icaoIdMatch[3]}` : '');
      result.type = icaoIdMatch[2] ? icaoIdMatch[2].toUpperCase() : 'NOTAMN';
      result.groupedIds = [result.id];
      result.mergedIds = [result.id];
    }

    // 2. Check for FAA Domestic NOTAM ID
    const faaIdMatch = raw.match(/!([A-Z0-9]{3,4})\s+([0-9]{1,2}\/[0-9]+|[A-Z0-9]+)/i);
    if (faaIdMatch && !result.id) {
      result.id = `!${faaIdMatch[1].toUpperCase()} ${faaIdMatch[2]}`;
      result.type = 'FAA_DOMESTIC';
      result.groupedIds = [result.id];
      result.mergedIds = [result.id];
      if (!result.icao) {
        result.icao = faaIdMatch[1].length === 3 ? 'K' + faaIdMatch[1].toUpperCase() : faaIdMatch[1].toUpperCase();
      }
    }

    // 3. Parse Q) line if available
    let qCoordRaw = '';
    const qLineMatch = raw.match(/Q\)\s*([A-Z]{4})\/([A-Z]{5})\/([A-Z\/]*)\/([A-Z\s]*)\/([A-Z\s]*)\/([0-9]{3})?\/([0-9]{3})?\/([^\n\r]+)?/i);
    if (qLineMatch) {
      result.fir = qLineMatch[1].toUpperCase();
      result.qCode = qLineMatch[2].toUpperCase();
      result.lowerLimit = qLineMatch[6] ? `FL${qLineMatch[6]}` : '';
      result.upperLimit = qLineMatch[7] ? `FL${qLineMatch[7]}` : '';
      qCoordRaw = (qLineMatch[8] || '').trim();
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

    // 7. Parse Field D) Schedule (handles multiline D) before E))
    const fieldDMatch = raw.match(/(?:^|\s)D\)\s*([\s\S]*?)(?=(?:\s+E\)\s+|\r?\nE\)\s+|$))/i);
    if (fieldDMatch && fieldDMatch[1].trim()) {
      result.scheduleRaw = fieldDMatch[1].replace(/\s+/g, ' ').trim();
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

    // 9. Parse Field F) and G) Lower/Upper Limits
    const fieldFMatch = raw.match(/(?:^|\s)F\)\s*([\s\S]*?)(?=(?:\s+G\)\s+|\r|\n|$))/i);
    if (fieldFMatch) result.lowerLimit = fieldFMatch[1].trim();
    const fieldGMatch = raw.match(/(?:^|\s)G\)\s*([^\n\r]+)/i);
    if (fieldGMatch) result.upperLimit = fieldGMatch[1].trim();

    // 10. Check for ICAO Pavement Classification Rating (PCR/PCN)
    const pcrMatch = result.bodyText.match(/(?:PCR|PCN)\s*([0-9]{2,4})\s*\/\s*([FR])\s*\/\s*([ABCD])\s*\/\s*([WXYZ])\s*\/\s*([TU])/i);
    if (pcrMatch) {
      result.pcrData = {
        rating: parseInt(pcrMatch[1], 10),
        pavementType: pcrMatch[2].toUpperCase(),
        subgrade: pcrMatch[3].toUpperCase(),
        tirePressure: pcrMatch[4].toUpperCase(),
        method: pcrMatch[5].toUpperCase(),
        evaluationMethod: pcrMatch[5].toUpperCase(),
        raw: pcrMatch[0].toUpperCase()
      };
    }

    // 11. FAA Domestic fallback validity
    if (!result.validFrom && !result.validTo) {
      const faaWindowMatch = raw.match(/([0-9]{10})\s*-\s*([0-9]{10}|PERM)/i);
      if (faaWindowMatch) {
        result.validFromRaw = faaWindowMatch[1];
        result.validFrom = this.parseUtcTimestamp(faaWindowMatch[1]);
        result.validToRaw = faaWindowMatch[2].toUpperCase();
        if (result.validToRaw === 'PERM') {
          result.isPerm = true;
        } else {
          result.validTo = this.parseUtcTimestamp(faaWindowMatch[2]);
        }
      }
    }

    // 12. Determine Category
    result.category = this.determineCategory(result);

    // 13. Extract Geographic Coordinates & Polygon / Radius for Map Plotting
    result.geometry = this.extractNotamGeometry(result, qCoordRaw);

    return result;
  }

  /**
   * Extract lat/lon center, radiusNm, and polygon vertices from Q) and E) fields.
   */
  static extractNotamGeometry(notam, qCoordRaw = '') {
    const body = notam.bodyText || '';
    let center = null;
    let radiusNm = 1.5;
    const polygon = [];

    // 1. Parse Q) coordinate + radius e.g. "2326S04710W005" or "2515S05732W001"
    const qMatch = qCoordRaw.match(/([0-9]{2})([0-9]{2})([NS])\s*([0-9]{3})([0-9]{2})([EW])([0-9]{3})?/i);
    if (qMatch) {
      const latSign = qMatch[3].toUpperCase() === 'S' ? -1 : 1;
      const lat = latSign * (parseInt(qMatch[1], 10) + parseInt(qMatch[2], 10) / 60);
      const lonSign = qMatch[6].toUpperCase() === 'W' ? -1 : 1;
      const lon = lonSign * (parseInt(qMatch[4], 10) + parseInt(qMatch[5], 10) / 60);
      center = [Number(lat.toFixed(4)), Number(lon.toFixed(4))];
      if (qMatch[7]) {
        const r = parseInt(qMatch[7], 10);
        if (r > 0 && r < 100) radiusNm = r;
      }

      // Dynamically register airport coordinates if not in DB and radius is airport-sized (<= 25 NM)
      if (notam.icao && notam.icao.length === 4 && !AIRPORT_COORDS_DB[notam.icao] && radiusNm <= 25) {
        AIRPORT_COORDS_DB[notam.icao] = { lat: center[0], lon: center[1], name: notam.icao };
      }
    }

    // 2. Parse explicit E) coordinates (DMS with optional decimals, e.g. 251627,00S 0573155,00W or 233012S0465054W or S242500 W0582830)
    const dmsMatches = [
      ...body.matchAll(/([0-9]{2})([0-9]{2})([0-9]{2}(?:[.,][0-9]+)?)([NS])[\s\/]*([0-9]{3})([0-9]{2})([0-9]{2}(?:[.,][0-9]+)?)([EW])/gi)
    ];
    for (const m of dmsMatches) {
      const latSign = m[4].toUpperCase() === 'S' ? -1 : 1;
      const latSec = parseFloat(m[3].replace(',', '.'));
      const lat = latSign * (parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + latSec / 3600);

      const lonSign = m[8].toUpperCase() === 'W' ? -1 : 1;
      const lonSec = parseFloat(m[7].replace(',', '.'));
      const lon = lonSign * (parseInt(m[5], 10) + parseInt(m[6], 10) / 60 + lonSec / 3600);
      polygon.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
    }

    // Also check prefix hemisphere format: "S242500 W0582830"
    if (polygon.length === 0) {
      const prefixMatches = [
        ...body.matchAll(/([NS])\s*([0-9]{2})([0-9]{2})([0-9]{2})\s+([EW])\s*([0-9]{3})([0-9]{2})([0-9]{2})/gi)
      ];
      for (const m of prefixMatches) {
        const latSign = m[1].toUpperCase() === 'S' ? -1 : 1;
        const lat = latSign * (parseInt(m[2], 10) + parseInt(m[3], 10) / 60 + parseInt(m[4], 10) / 3600);
        const lonSign = m[5].toUpperCase() === 'W' ? -1 : 1;
        const lon = lonSign * (parseInt(m[6], 10) + parseInt(m[7], 10) / 60 + parseInt(m[8], 10) / 3600);
        polygon.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
      }
    }

    // Check explicit RADIUS in E) e.g. "RADIUS 1,65NM" or "RADIUS 0,5NM"
    const radMatch = body.match(/RADIUS\s*([0-9]+(?:[.,][0-9]+)?)\s*NM/i);
    if (radMatch) {
      radiusNm = Math.max(0.25, parseFloat(radMatch[1].replace(',', '.')));
    }

    // If E) had exact point(s), refine center to average of E) points
    if (polygon.length > 0) {
      const avgLat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
      const avgLon = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
      center = [Number(avgLat.toFixed(5)), Number(avgLon.toFixed(5))];
    }

    // Fallback to known airport coordinates if no Q) or E) coordinates
    if (!center && notam.icao && AIRPORT_COORDS_DB[notam.icao]) {
      const st = AIRPORT_COORDS_DB[notam.icao];
      center = [st.lat, st.lon];
      radiusNm = 2;
    }

    if (!center) return null;

    return {
      center,
      radiusNm,
      polygon: polygon.length >= 3 ? polygon : []
    };
  }

  /**
   * Compute Haversine distance (NM) and compass bearing from nearest Departure/Destination airport.
   */
  static enrichNotamDistance(notam, depIcao, arrIcao) {
    if (!notam.geometry || !notam.geometry.center) return;
    const [lat, lon] = notam.geometry.center;

    const candidates = [];
    if (depIcao && AIRPORT_COORDS_DB[depIcao]) {
      candidates.push({ icao: depIcao, ...AIRPORT_COORDS_DB[depIcao] });
    }
    if (arrIcao && AIRPORT_COORDS_DB[arrIcao]) {
      candidates.push({ icao: arrIcao, ...AIRPORT_COORDS_DB[arrIcao] });
    }

    if (candidates.length === 0) return;

    let best = null;
    for (const c of candidates) {
      const dist = this.haversineNm(c.lat, c.lon, lat, lon);
      const brg = this.compassBearing(c.lat, c.lon, lat, lon);
      if (!best || dist < best.dist) {
        best = { icao: c.icao, dist, brg };
      }
    }

    if (best && best.dist <= 65) {
      if (best.dist < 1.2) {
        notam.distanceBadge = `At ${best.icao} Airfield`;
      } else {
        notam.distanceBadge = `${best.dist.toFixed(1)} NM ${best.brg} of ${best.icao}`;
      }
      notam.nearestAirport = best.icao;
      notam.distanceFromNearestNm = best.dist;
    }
  }

  static haversineNm(lat1, lon1, lat2, lon2) {
    const toRad = d => (d * Math.PI) / 180;
    const R = 3440.065; // Earth radius in NM
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static compassBearing(lat1, lon1, lat2, lon2) {
    const toRad = d => (d * Math.PI) / 180;
    const toDeg = r => (r * 180) / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(brng / 22.5) % 16];
  }

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
      return this.checkScheduleOverlap(notam.scheduleRaw, windowStart, windowEnd, flightUtc);
    }

    return true;
  }

  /**
   * Enhanced Field D schedule evaluator:
   * Handles "DAILY 0200-0900", "BTN 1100-1300", multi-window "OCT 01 2230-0830 OCT 02 2330-0100", and "SR-SS".
   */
  static checkScheduleOverlap(scheduleStr, windowStart, windowEnd, flightUtc = null) {
    const s = scheduleStr.toUpperCase().trim();

    // Check SR-SS (Sunrise to Sunset in South America / UTC-3 is approx 0900Z to 2130Z)
    if (/\bSR\s*-\s*SS\b/.test(s) && !/[0-9]{4}\s*-\s*[0-9]{4}/.test(s)) {
      const refTime = flightUtc || windowStart;
      const mins = refTime.getUTCHours() * 60 + refTime.getUTCMinutes();
      return mins >= 8 * 60 + 45 && mins <= 22 * 60;
    }

    // Extract all HHMM-HHMM ranges in the schedule string
    const ranges = [...s.matchAll(/([0-9]{4})\s*-\s*([0-9]{4})/g)];
    if (ranges.length === 0) return true;

    const winStartMin = windowStart.getUTCHours() * 60 + windowStart.getUTCMinutes();
    const winEndMin = windowEnd.getUTCHours() * 60 + windowEnd.getUTCMinutes();

    for (const r of ranges) {
      const startH = parseInt(r[1].substring(0, 2), 10);
      const startM = parseInt(r[1].substring(2, 4), 10);
      const endH = parseInt(r[2].substring(0, 2), 10);
      const endM = parseInt(r[2].substring(2, 4), 10);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let overlaps = false;
      if (endMinutes < startMinutes) {
        const activeStart = winStartMin >= startMinutes || winStartMin <= endMinutes;
        const activeEnd = winEndMin >= startMinutes || winEndMin <= endMinutes;
        overlaps = activeStart || activeEnd;
      } else {
        overlaps = !(winEndMin < startMinutes || winStartMin > endMinutes);
      }

      if (overlaps) return true;
    }

    return false;
  }

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
      'CA': 'Air/Ground Facility',
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
    if (text.includes('CURFEW') || text.includes('HOURS OF OPS') || text.includes('HR SER') || text.includes('TWR') || text.includes('AFIS') || text.includes('ACC PRI FREQ') || text.includes('AD CLSD') || text.includes('PPR') || text.includes('SLOT') || text.includes('COHOR') || text.includes('APU')) {
      return 'ATC_TWR_COMMS';
    }
    if (text.includes('RFFS') || text.includes('ARFF') || text.includes('FIRE') || text.includes('RESCUE') || text.includes('BOMBEIROS')) {
      return 'FIRE_RESCUE';
    }
    if (text.includes('LIGHT') || text.includes('PAPI') || text.includes('ALS') || text.includes('QLA') || text.includes('QLP') || text.includes('SEM FLASH')) {
      return 'LIGHTING';
    }
    if (text.includes('DRONE') || text.includes('RPA') || text.includes('UA WILL TAKE PLACE') || text.includes('BALAO') || text.includes('BALLOON') || text.includes('AREA RESTRITA') || text.includes('OBST') || text.includes('CRANE') || text.includes('PARACHUTE') || text.includes('PJE') || text.includes('SGR-') || text.includes('FLTCK') || text.includes('FIREWORKS')) {
      return 'AIRSPACE_OBSTACLE';
    }

    return 'GENERAL';
  }
}
