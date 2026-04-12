import type { Transaction, Category, MerchantRules } from './types';

// ── Merchant clean-name table ──────────────────────────────────────────────────
// Maps a lowercase keyword found in raw bank strings to a canonical display name.
// More specific (longer) entries should come before shorter overlapping ones.
const MERCHANT_CLEAN: Array<{ kw: string; name: string }> = [
  // Gas / convenience
  { kw: 'circle k',        name: 'Circle K' },
  { kw: 'kwik trip',       name: 'Kwik Trip' },
  { kw: 'casey general',   name: "Casey's General Store" },
  { kw: 'pilot flying j',  name: 'Pilot Flying J' },
  { kw: 'loves travel',    name: "Love's Travel Stop" },
  { kw: 'holiday station', name: 'Holiday Station' },
  { kw: 'phillips 66',     name: 'Phillips 66' },
  { kw: 'marathon petro',  name: 'Marathon' },
  { kw: 'speedway gas',    name: 'Speedway' },
  { kw: 'quiktrip',        name: 'QuikTrip' },
  { kw: 'racetrac',        name: 'RaceTrac' },
  { kw: 'thorntons',       name: 'Thorntons' },
  { kw: 'getgo gas',       name: 'GetGo' },
  { kw: 'maverik',         name: 'Maverik' },
  { kw: 'chevron',         name: 'Chevron' },
  { kw: 'conserv fuel',    name: 'Conserv Fuel' },
  { kw: 'conserv ',        name: 'Conserv' },
  { kw: 'valero',          name: 'Valero' },
  { kw: 'sunoco',          name: 'Sunoco' },
  { kw: 'sinclair',        name: 'Sinclair' },
  { kw: 'texaco',          name: 'Texaco' },
  { kw: 'exxon',           name: 'Exxon' },
  { kw: 'mobil ',          name: 'Mobil' },
  { kw: 'bp gas',          name: 'BP' },
  { kw: 'shell ',          name: 'Shell' },
  { kw: '76 gas',          name: '76' },
  { kw: 'arco',            name: 'ARCO' },
  { kw: 'wawa gas',        name: 'Wawa' },
  { kw: 'sheetz',          name: 'Sheetz' },
  { kw: 'flying j',        name: 'Flying J' },
  { kw: 'cenex',           name: 'Cenex' },
  // Coffee
  { kw: 'starbucks',       name: 'Starbucks' },
  { kw: 'dutch bros',      name: 'Dutch Bros' },
  { kw: "peet's coffee",   name: "Peet's Coffee" },
  { kw: 'peets coffee',    name: "Peet's Coffee" },
  { kw: 'caribou coffee',  name: 'Caribou Coffee' },
  { kw: 'blue bottle coffee', name: 'Blue Bottle Coffee' },
  { kw: 'tim hortons',     name: "Tim Horton's" },
  { kw: 'coffee bean',     name: 'Coffee Bean & Tea Leaf' },
  { kw: 'biggby coffee',   name: 'Biggby Coffee' },
  { kw: 'scooters coffee', name: "Scooter's Coffee" },
  { kw: 'philz coffee',    name: 'Philz Coffee' },
  { kw: 'la colombe',      name: 'La Colombe' },
  { kw: 'black rock coffee', name: 'Black Rock Coffee' },
  { kw: 'dunkin',          name: "Dunkin'" },
  // Fast food / restaurants
  { kw: 'chick-fil-a',     name: 'Chick-fil-A' },
  { kw: 'chickfila',       name: 'Chick-fil-A' },
  { kw: 'mcdonalds',       name: "McDonald's" },
  { kw: "mcdonald's",      name: "McDonald's" },
  { kw: 'burger king',     name: 'Burger King' },
  { kw: 'taco bell',       name: 'Taco Bell' },
  { kw: 'wendys',          name: "Wendy's" },
  { kw: "wendy's",         name: "Wendy's" },
  { kw: 'subway subs',     name: 'Subway' },
  { kw: 'dominos pizza',   name: "Domino's" },
  { kw: "domino's",        name: "Domino's" },
  { kw: 'pizza hut',       name: 'Pizza Hut' },
  { kw: 'five guys',       name: 'Five Guys' },
  { kw: 'panera',          name: 'Panera Bread' },
  { kw: 'olive garden',    name: 'Olive Garden' },
  { kw: "applebee's",      name: "Applebee's" },
  { kw: 'applebees',       name: "Applebee's" },
  { kw: 'sweetgreen',      name: 'Sweetgreen' },
  { kw: 'shake shack',     name: 'Shake Shack' },
  { kw: 'wingstop',        name: 'Wingstop' },
  { kw: 'popeyes',         name: 'Popeyes' },
  { kw: "raising cane's",  name: "Raising Cane's" },
  { kw: 'jersey mikes',    name: "Jersey Mike's" },
  { kw: 'jimmy johns',     name: "Jimmy John's" },
  { kw: 'firehouse subs',  name: 'Firehouse Subs' },
  { kw: 'culvers',         name: "Culver's" },
  { kw: 'sonic drive-in',  name: 'Sonic' },
  { kw: 'in-n-out',        name: 'In-N-Out' },
  { kw: 'whataburger',     name: 'Whataburger' },
  { kw: 'del taco',        name: 'Del Taco' },
  { kw: 'jack in the box', name: 'Jack in the Box' },
  { kw: 'qdoba',           name: 'Qdoba' },
  { kw: 'panda express',   name: 'Panda Express' },
  { kw: 'chipotle',        name: 'Chipotle' },
  { kw: 'doordash',        name: 'DoorDash' },
  { kw: 'grubhub',         name: 'Grubhub' },
  { kw: 'uber eats',       name: 'Uber Eats' },
  { kw: 'ubereats',        name: 'Uber Eats' },
  { kw: 'postmates',       name: 'Postmates' },
  { kw: 'first watch',     name: 'First Watch' },
  { kw: 'cracker barrel',  name: 'Cracker Barrel' },
  { kw: 'texas roadhouse', name: 'Texas Roadhouse' },
  { kw: 'cheesecake factory', name: 'Cheesecake Factory' },
  { kw: 'crumbl cookies',  name: 'Crumbl Cookies' },
  // Groceries
  { kw: 'whole foods',     name: 'Whole Foods' },
  { kw: 'trader joe',      name: "Trader Joe's" },
  { kw: 'harris teeter',   name: 'Harris Teeter' },
  { kw: 'stop & shop',     name: 'Stop & Shop' },
  { kw: 'stop and shop',   name: 'Stop & Shop' },
  { kw: 'giant food',      name: 'Giant Food' },
  { kw: 'food lion',       name: 'Food Lion' },
  { kw: 'heb store',       name: 'H-E-B' },
  { kw: 'h-e-b',           name: 'H-E-B' },
  { kw: 'winco foods',     name: 'WinCo Foods' },
  { kw: 'fresh market',    name: 'The Fresh Market' },
  { kw: 'market basket',   name: 'Market Basket' },
  { kw: 'price chopper',   name: 'Price Chopper' },
  { kw: 'winn-dixie',      name: 'Winn-Dixie' },
  { kw: 'grocery outlet',  name: 'Grocery Outlet' },
  { kw: 'giant eagle',     name: 'Giant Eagle' },
  { kw: 'stater bros',     name: "Stater Bros." },
  { kw: 'smart & final',   name: 'Smart & Final' },
  { kw: 'food 4 less',     name: 'Food 4 Less' },
  { kw: "fry's food",      name: "Fry's Food" },
  { kw: 'brookshire',      name: 'Brookshire' },
  { kw: 'ingles market',   name: 'Ingles' },
  { kw: 'weis markets',    name: 'Weis Markets' },
  { kw: 'jewel-osco',      name: 'Jewel-Osco' },
  { kw: 'shoprite',        name: 'ShopRite' },
  { kw: 'hannaford',       name: 'Hannaford' },
  { kw: 'safeway',         name: 'Safeway' },
  { kw: 'kroger',          name: 'Kroger' },
  { kw: 'publix',          name: 'Publix' },
  { kw: 'wegmans',         name: 'Wegmans' },
  { kw: 'sprouts',         name: 'Sprouts' },
  { kw: 'meijer',          name: 'Meijer' },
  { kw: 'hy-vee',          name: 'Hy-Vee' },
  { kw: 'albertson',       name: 'Albertsons' },
  { kw: 'vons',            name: 'Vons' },
  { kw: 'ralphs',          name: "Ralph's" },
  { kw: 'randalls',        name: 'Randalls' },
  { kw: 'tom thumb',       name: 'Tom Thumb' },
  { kw: 'fareway',         name: 'Fareway' },
  { kw: 'dillons',         name: 'Dillons' },
  { kw: 'save-a-lot',      name: 'Save-A-Lot' },
  { kw: ' aldi ',          name: 'Aldi' },
  { kw: 'lidl',            name: 'Lidl' },
  // Shopping
  { kw: 'costco whse',     name: 'Costco' },
  { kw: 'costco',          name: 'Costco' },
  { kw: 'amzn mktp',       name: 'Amazon' },
  { kw: 'amazon mktpl',    name: 'Amazon' },
  { kw: 'amazon.com',      name: 'Amazon' },
  { kw: 'home depot',      name: 'Home Depot' },
  { kw: 'best buy',        name: 'Best Buy' },
  { kw: 'target',          name: 'Target' },
  { kw: 'walmart',         name: 'Walmart' },
  { kw: 'dollar general',  name: 'Dollar General' },
  { kw: 'dollar tree',     name: 'Dollar Tree' },
  { kw: 'five below',      name: 'Five Below' },
  { kw: 'office depot',    name: 'Office Depot' },
  { kw: 'staples store',   name: 'Staples' },
  { kw: 'container store', name: 'The Container Store' },
  { kw: 'chewy.com',       name: 'Chewy' },
  { kw: 'petsmart',        name: 'PetSmart' },
  { kw: 'petco',           name: 'Petco' },
  { kw: "lowe's",          name: "Lowe's" },
  { kw: 'ikea',            name: 'IKEA' },
  { kw: 'wayfair',         name: 'Wayfair' },
  { kw: 'ebay',            name: 'eBay' },
  { kw: 'etsy',            name: 'Etsy' },
  { kw: 'overstock',       name: 'Overstock' },
  // Clothing
  { kw: 'old navy',        name: 'Old Navy' },
  { kw: 'gap store',       name: 'Gap' },
  { kw: 'banana republic', name: 'Banana Republic' },
  { kw: 'urban outfitters', name: 'Urban Outfitters' },
  { kw: 'free people',     name: 'Free People' },
  { kw: 'anthropologie',   name: 'Anthropologie' },
  { kw: 'abercrombie',     name: 'Abercrombie & Fitch' },
  { kw: 'american eagle',  name: 'American Eagle' },
  { kw: 'hollister',       name: 'Hollister' },
  { kw: 'lululemon',       name: 'Lululemon' },
  { kw: 'under armour',    name: 'Under Armour' },
  { kw: 'columbia sportswear', name: 'Columbia' },
  { kw: 'the north face',  name: 'The North Face' },
  { kw: 'rei store',       name: 'REI' },
  { kw: 'patagonia',       name: 'Patagonia' },
  { kw: 'burlington coat', name: 'Burlington' },
  { kw: 'nordstrom',       name: 'Nordstrom' },
  { kw: "macy's",          name: "Macy's" },
  { kw: 'macys',           name: "Macy's" },
  { kw: 'tj maxx',         name: 'TJ Maxx' },
  { kw: 'tjmaxx',          name: 'TJ Maxx' },
  { kw: 'ross stores',     name: 'Ross' },
  { kw: 'marshalls',       name: 'Marshalls' },
  { kw: 'h&m store',       name: 'H&M' },
  { kw: 'zara',            name: 'Zara' },
  { kw: 'forever 21',      name: 'Forever 21' },
  { kw: 'uniqlo',          name: 'Uniqlo' },
  { kw: 'j.crew',          name: 'J.Crew' },
  { kw: 'calvin klein',    name: 'Calvin Klein' },
  { kw: 'ralph lauren',    name: 'Ralph Lauren' },
  { kw: 'tommy hilfiger',  name: 'Tommy Hilfiger' },
  { kw: 'brooks brothers', name: 'Brooks Brothers' },
  // Entertainment / streaming
  { kw: 'netflix',         name: 'Netflix' },
  { kw: 'spotify',         name: 'Spotify' },
  { kw: 'disney plus',     name: 'Disney+' },
  { kw: 'disney+',         name: 'Disney+' },
  { kw: 'hbo max',         name: 'HBO Max' },
  { kw: 'max.com',         name: 'Max' },
  { kw: 'apple music',     name: 'Apple Music' },
  { kw: 'apple tv+',       name: 'Apple TV+' },
  { kw: 'apple tv plus',   name: 'Apple TV+' },
  { kw: 'youtube premium', name: 'YouTube Premium' },
  { kw: 'peacock tv',      name: 'Peacock' },
  { kw: 'paramount+',      name: 'Paramount+' },
  { kw: 'espn+',           name: 'ESPN+' },
  { kw: 'amazon prime',    name: 'Amazon Prime' },
  { kw: 'xbox game pass',  name: 'Xbox Game Pass' },
  { kw: 'playstation store', name: 'PlayStation Store' },
  { kw: 'nintendo eshop',  name: 'Nintendo eShop' },
  { kw: 'steam games',     name: 'Steam' },
  { kw: 'ticketmaster',    name: 'Ticketmaster' },
  { kw: 'eventbrite',      name: 'Eventbrite' },
  { kw: 'stubhub',         name: 'StubHub' },
  { kw: 'amc theatre',     name: 'AMC Theatres' },
  { kw: 'regal cinema',    name: 'Regal Cinemas' },
  { kw: 'cinemark',        name: 'Cinemark' },
  { kw: 'fandango',        name: 'Fandango' },
  { kw: 'twitch',          name: 'Twitch' },
  { kw: 'hulu',            name: 'Hulu' },
  { kw: 'topgolf',         name: 'Topgolf' },
  { kw: 'dave & busters',  name: 'Dave & Buster\'s' },
  { kw: 'bowlero',         name: 'Bowlero' },
  // Health / pharmacy
  { kw: 'cvs pharmacy',    name: 'CVS' },
  { kw: 'cvs',             name: 'CVS' },
  { kw: 'walgreens',       name: 'Walgreens' },
  { kw: 'rite aid',        name: 'Rite Aid' },
  { kw: 'planet fitness',  name: 'Planet Fitness' },
  { kw: 'anytime fitness', name: 'Anytime Fitness' },
  { kw: 'la fitness',      name: 'LA Fitness' },
  { kw: 'orangetheory',    name: 'Orangetheory' },
  { kw: 'equinox',         name: 'Equinox' },
  { kw: 'crunch fitness',  name: 'Crunch Fitness' },
  { kw: 'lifetime fitness', name: 'Life Time Fitness' },
  { kw: '24 hour fitness', name: '24 Hour Fitness' },
  { kw: 'peloton',         name: 'Peloton' },
  { kw: 'ymca',            name: 'YMCA' },
  // Subscriptions
  { kw: 'adobe creative',  name: 'Adobe Creative Cloud' },
  { kw: 'adobe acrobat',   name: 'Adobe Acrobat' },
  { kw: 'microsoft 365',   name: 'Microsoft 365' },
  { kw: 'microsoft office', name: 'Microsoft Office' },
  { kw: 'google one',      name: 'Google One' },
  { kw: 'icloud storage',  name: 'iCloud' },
  { kw: 'dropbox',         name: 'Dropbox' },
  { kw: 'chatgpt',         name: 'ChatGPT' },
  { kw: 'openai',          name: 'OpenAI' },
  { kw: 'claude.ai',       name: 'Claude' },
  { kw: 'anthropic',       name: 'Anthropic' },
  { kw: 'github.com',      name: 'GitHub' },
  { kw: 'sirius xm',       name: 'SiriusXM' },
  { kw: 'audible',         name: 'Audible' },
  { kw: 'nordvpn',         name: 'NordVPN' },
  { kw: 'expressvpn',      name: 'ExpressVPN' },
  { kw: 'turbotax',        name: 'TurboTax' },
  { kw: 'quickbooks',      name: 'QuickBooks' },
  // Transportation
  { kw: 'uber trip',       name: 'Uber' },
  { kw: 'lyft ride',       name: 'Lyft' },
  { kw: 'enterprise rent', name: 'Enterprise' },
  { kw: 'budget car rental', name: 'Budget Car Rental' },
  { kw: 'avis rent',       name: 'Avis' },
  { kw: 'hertz',           name: 'Hertz' },
  { kw: 'zipcar',          name: 'Zipcar' },
  { kw: 'turo',            name: 'Turo' },
  { kw: 'amtrak',          name: 'Amtrak' },
  { kw: 'greyhound bus',   name: 'Greyhound' },
  { kw: 'spothero',        name: 'SpotHero' },
  { kw: 'parkwhiz',        name: 'ParkWhiz' },
  { kw: 'ez pass',         name: 'E-ZPass' },
  { kw: 'ezpass',          name: 'E-ZPass' },
  { kw: 'fastrak',         name: 'FasTrak' },
  { kw: 'autozone',        name: 'AutoZone' },
  { kw: "o'reilly auto",   name: "O'Reilly Auto Parts" },
  { kw: 'advance auto parts', name: 'Advance Auto Parts' },
  { kw: 'jiffy lube',      name: 'Jiffy Lube' },
  { kw: 'valvoline',       name: 'Valvoline' },
  { kw: 'firestone',       name: 'Firestone' },
  // Investments
  { kw: 'fidelity investments', name: 'Fidelity' },
  { kw: 'charles schwab',  name: 'Charles Schwab' },
  { kw: 'td ameritrade',   name: 'TD Ameritrade' },
  { kw: 'robinhood',       name: 'Robinhood' },
  { kw: 'wealthfront',     name: 'Wealthfront' },
  { kw: 'betterment',      name: 'Betterment' },
  { kw: 'vanguard',        name: 'Vanguard' },
  { kw: 'coinbase',        name: 'Coinbase' },
  { kw: 'sofi invest',     name: 'SoFi' },
];

// ── Description cleaner ────────────────────────────────────────────────────────
/**
 * Given a raw bank description string, returns a clean merchant display name,
 * or null if no meaningful improvement can be made.
 *
 * Strategy:
 * 1. Check the MERCHANT_CLEAN lookup for a canonical name.
 * 2. Strip common bank noise patterns and title-case the remainder.
 * 3. Return null if the result is not meaningfully different from the input.
 */
export function cleanDescription(raw: string): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Known merchant lookup — deterministic, highest confidence
  for (const { kw, name } of MERCHANT_CLEAN) {
    if (lower.includes(kw)) return name;
  }

  // 2. Safe rule-based noise stripping — only clearly mechanical patterns
  let s = raw
    // Leading card/transaction type prefixes
    .replace(/^(checkcard\s+\d{4}\s*|pos\s+debit\s+|pos\s+purchase\s+|ach\s+(debit|credit)\s+|debit\s+card\s+purchase\s+|purchase\s+authorized\s+on\s+\d{1,2}\/\d{1,2}\s*)/i, '')
    // POS terminal prefixes: TST*, SQ *, SP *, PP*
    .replace(/^(tst\*|sq\s*\*|sp\s*\*|pp\*)\s*/i, '')
    // Store / branch numbers: #0123, STORE 42, NO. 5
    .replace(/\s*(#|store\s+|no\.?\s*)\d+/gi, '')
    // Trailing zip code (5 digits, optionally +4)
    .replace(/\s+\d{5}(-\d{4})?\s*$/, '')
    // Trailing US state abbreviation (exactly 2 uppercase letters at end)
    .replace(/\s+[A-Z]{2}\s*$/, '')
    // Long standalone numeric IDs (6+ digits)
    .replace(/\b\d{6,}\b/g, '')
    // Alphanumeric reference codes: 1–3 letters followed by 4+ digits (e.g. REF123456, AUTH7890)
    .replace(/\b[A-Z]{1,3}\d{4,}\b/gi, '')
    // Short date fragments: 04/15 or 04/15/24
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!s) return null;

  const words = s.split(/\s+/);

  // 3. Bail if too many words remain — location noise likely still present
  if (words.length > 4) return null;

  // 4. Bail if any token looks like a garbled reference code
  //    (letter–digit–letter interleaving, e.g. X7B2Q, A1B3C) of 4+ chars
  if (words.some((w) => w.length >= 4 && /[A-Za-z]\d[A-Za-z]/.test(w))) return null;

  // 5. Proper-case
  const titled = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // Only return if the result is actually different from the raw input
  if (titled === raw.trim()) return null;

  return titled;
}

const TRANSFER_PATTERNS = [
  'zelle transfer', 'venmo transfer', 'cashapp transfer', 'cash app transfer',
  'paypal transfer', 'wire transfer', 'ach transfer',
  'account transfer', 'online transfer', 'mobile transfer',
  'internal transfer', 'relay transfer', 'funds transfer',
  'peer transfer', 'p2p payment',
];

const MERCHANT_MAP: Array<{ cat: string; kw: string[] }> = [
  { cat: 'Wages & Salary', kw: [
    'uber technologies', 'uber eats payment', 'uber driver', 'lyft payment',
    'irs treas', 'tax refund', 'state refund', 'franchise tax', 'tax return',
    'stimulus', 'benefit payment', 'social security', 'unemployment',
    'barrett business', 'adp ', 'paychex', 'gusto', 'workday',
    'direct deposit', 'payroll', 'salary', 'wages paid', 'salary dep',
    'ach deposit', 'deposit from', 'payment from',
  ]},
  { cat: 'Other Income', kw: [
    'interest earned', 'interest payment', 'dividend',
    'cash back reward', 'cashback reward', 'rewards redemption', 'sign-up bonus',
  ]},
  { cat: 'Gifts & Donations', kw: [
    'africa renewal', 'renewal africa', 'charity', 'donation', 'donate',
    'nonprofit', 'non-profit', 'foundation', 'relief fund', 'humanitarian',
    'red cross', 'salvation army', 'goodwill', 'habitat for humanity',
    'united way', 'ymca donation', 'church offering', 'tithe', 'offering',
    'give.org', 'gofundme', 'crowdrise', 'causes.com',
  ]},
  { cat: 'Transportation & Gas', kw: [
    'conserv fuel', 'conserv ', 'arco', 'chevron', 'shell ', '76 gas',
    'circle k', 'conoco', 'phillips 66', 'exxon', 'mobil ', 'bp gas',
    'texaco', 'sunoco', 'marathon petro', 'speedway gas', 'kwik trip',
    'casey general', 'pilot flying j', 'loves travel', 'wawa gas', 'sheetz',
    'valero', 'sinclair', 'holiday station', 'maverik', 'racetrac',
    'quiktrip', 'thorntons', 'getgo gas', 'cenex', 'flying j',
    'fuel ', 'gasoline', 'gas station', 'petro stop',
    'spothero', 'parkwhiz', 'bestparking', 'parking meter', 'park app',
    'lyft', 'bird scooter', 'lime scooter',
    'ez pass', 'ezpass', 'e-z pass', 'i-pass', 'sunpass', 'fastrak',
    'amtrak', 'greyhound bus', 'megabus', 'flixbus',
    'enterprise rent', 'hertz', 'avis rent', 'budget car rental', 'zipcar', 'turo',
    'mta metro', 'wmata', 'bart ticket', 'cta transit', 'septa', 'mbta',
    'presto card', 'clipper card', 'metro card', 'orca card',
    'autozone', "o'reilly auto", 'advance auto parts', 'napa auto',
    'jiffy lube', 'valvoline', 'firestone', 'midas', 'pep boys',
    'uber trip', 'lyft ride',
  ]},
  { cat: 'Coffee & Drinks', kw: [
    'starbucks', 'dunkin', 'dutch bros', "peet's coffee", 'peets coffee',
    'caribou coffee', 'blue bottle coffee', 'tim hortons', 'coffee bean',
    'biggby coffee', 'scooters coffee', 'philz coffee', 'intelligentsia',
    'la colombe', 'verve coffee', 'cuvee coffee', 'black rock coffee',
  ]},
  { cat: 'Dining & Restaurants', kw: [
    'doordash', 'grubhub', 'ubereats', 'uber eats', 'postmates', 'seamless',
    'chipotle', "mcdonald's", 'mcdonalds', 'chick-fil-a', 'chickfila',
    'burger king', 'taco bell', "wendy's", 'wendys', 'subway subs',
    'dominos pizza', "domino's", 'pizza hut', 'five guys', 'panera',
    'olive garden', "applebee's", 'applebees', 'sweetgreen', 'shake shack',
    'wingstop', 'popeyes', "raising cane's", 'jersey mikes', 'jimmy johns',
    'firehouse subs', 'culvers', 'sonic drive-in', 'in-n-out', 'habit burger',
    'whataburger', 'del taco', 'jack in the box', 'qdoba', 'moes sw grill',
    'noodles and co', 'panda express', 'the cheesecake factory',
    'crumbl cookies', 'insomnia cookies', 'nothing bundt', 'jamba juice',
    'smoothie king', 'tropical smoothie', 'first watch', 'ihop', 'dennys',
    'waffle house', 'perkins restaurant', 'bob evans', 'cracker barrel',
    'longhorn steakhouse', 'texas roadhouse', 'outback steakhouse',
    'red lobster', 'red robin', "chili's", "bj's restaurant", 'yard house',
    'restaurant', 'grill', 'bistro', 'brasserie', 'eatery', 'diner',
    'sushi', 'ramen', 'pho ', 'boba', 'bubble tea', 'dim sum',
    'tapas', 'steakhouse', 'bbq', 'smokehouse', 'cantina', 'taqueria',
    'pizzeria', 'trattoria', 'osteria', 'noodle', 'dumpling',
  ]},
  { cat: 'Groceries', kw: [
    'whole foods', 'trader joe', 'safeway', 'kroger', 'publix', 'wegmans',
    ' aldi ', 'sprouts', 'harris teeter', 'stop & shop', 'stop and shop',
    'giant food', 'food lion', 'h-e-b', 'heb store', 'meijer', 'winco foods',
    'fresh market', 'market basket', 'hy-vee', 'weis markets', 'price chopper',
    'brookshire', 'ingles market', 'stater bros', 'vons', 'ralphs', 'jewel-osco',
    'randalls', 'tom thumb', 'winn-dixie', 'hannaford', 'acme markets',
    'food 4 less', 'smart & final', 'grocery outlet', 'lucky supermarkets',
    'save-a-lot', 'lidl', 'fareway', 'dillons', 'smiths food', "fry's food",
    'kings food', 'shoprite', 'pathmark', 'giant eagle',
  ]},
  { cat: 'Subscriptions', kw: [
    'adobe creative', 'adobe acrobat', 'microsoft 365', 'microsoft office',
    'google one', 'google storage', 'icloud storage', 'dropbox',
    'notion.so', 'canva.com', 'figma', 'github.com', 'gitlab',
    'chatgpt', 'openai', 'claude.ai', 'anthropic',
    'duolingo', 'masterclass', 'skillshare', 'coursera', 'udemy',
    'nytimes', 'new york times', 'wsj.com', 'washington post', 'the atlantic',
    'sirius xm', 'pandora', 'audible', 'kindle unlimited',
    'nordvpn', 'expressvpn', 'proton mail', 'protonvpn',
    'turbotax', 'quickbooks', 'mint.com',
  ]},
  { cat: 'Entertainment', kw: [
    'netflix', 'hulu', 'disney+', 'disney plus', 'hbo max', 'max.com',
    'spotify', 'apple music', 'amazon prime', 'youtube premium',
    'peacock tv', 'paramount+', 'espn+', 'apple tv+', 'apple tv plus',
    'twitch', 'steam games', 'playstation store', 'xbox game pass',
    'nintendo eshop', 'ticketmaster', 'eventbrite', 'stubhub',
    'amc theatre', 'regal cinema', 'cinemark', 'fandango',
    'bowlero', 'topgolf', 'dave & busters', 'main event',
    'escape room', 'axe throwing', 'paintball', 'go kart',
  ]},
  { cat: 'Health & Fitness', kw: [
    'cvs pharmacy', 'walgreens', 'rite aid',
    'planet fitness', 'equinox', 'anytime fitness', 'la fitness', 'ymca',
    'crunch fitness', 'orangetheory', 'lifetime fitness', 'peloton', '24 hour fitness',
    'optumrx', 'express scripts', 'labcorp', 'quest diagnostics',
    'urgent care', 'minute clinic', 'kaiser permanente',
    'one medical', 'teladoc', 'mdlive', 'noom', 'weight watchers',
    'dental care', 'smile direct', 'delta dental', 'vsp vision',
    'cigna health', 'united health', 'aetna', 'blue cross',
    'allina health', 'mayo clinic', 'cleveland clinic',
  ]},
  { cat: 'Clothing & Apparel', kw: [
    'old navy', 'gap store', 'h&m store', 'zara', 'forever 21',
    'nordstrom', "macy's", 'macys', 'tj maxx', 'tjmaxx', 'ross stores', 'marshalls',
    'banana republic', 'j.crew', 'american eagle', 'hollister',
    'lululemon', 'nike.com', 'adidas.com', 'under armour store', 'patagonia',
    'burlington coat', 'aerie', 'abercrombie', 'uniqlo', 'urban outfitters',
    'shein', 'revolve', 'anthropologie', 'free people', 'express store',
    'calvin klein', 'tommy hilfiger', 'ralph lauren', 'brooks brothers',
    'columbia sportswear', 'the north face', 'rei store',
  ]},
  { cat: 'Investments', kw: [
    'fidelity investments', 'vanguard', 'charles schwab', 'robinhood',
    'e*trade', 'td ameritrade', 'wealthfront', 'betterment',
    'sofi invest', 'coinbase', 'binance', 'public.com',
  ]},
  { cat: 'Rent / Mortgage', kw: [
    'rent payment', 'apartment payment', 'lease payment', 'property management rent',
  ]},
  { cat: 'Wedding', kw: [
    'wedding', 'bridal', 'florist', 'the knot', 'weddingwire', 'zola registry',
    'wedding venue', 'wedding photo', 'wedding cake', 'wedding caterer',
    'wedding dj', 'wedding band', 'wedding planner', 'honeymoon',
  ]},
  { cat: 'Shopping', kw: [
    'amazon.com', 'amazon mktpl', 'amzn mktp', 'target store', 'walmart', 'costco whse',
    'best buy', 'home depot', "lowe's", 'ikea', 'wayfair', 'ebay', 'etsy',
    'chewy.com', 'petco', 'petsmart',
    'dollar general', 'dollar tree', 'five below',
    'office depot', 'staples store', 'container store',
    'bed bath', 'williams sonoma', 'pottery barn', 'crate and barrel',
    'overstock', 'wish.com', 'shein', 'temu',
  ]},
];

export function applyLearnedRules(description: string, merchantRules: MerchantRules): string | null {
  if (!description || !merchantRules) return null;
  const lower = description.toLowerCase().trim();
  if (merchantRules[lower]) return merchantRules[lower];
  for (const [key, cat] of Object.entries(merchantRules)) {
    if (lower.includes(key) || key.includes(lower)) return cat;
  }
  return null;
}

export function isTransfer(description: string): boolean {
  if (!description) return false;
  const lower = description.toLowerCase();
  return TRANSFER_PATTERNS.some((p) => lower.includes(p));
}

export function autoAssignCategory(description: string, categories: Category[]): string | null {
  if (!description) return null;
  const lower = description.toLowerCase();
  for (const { cat, kw } of MERCHANT_MAP) {
    for (const k of kw) {
      if (lower.includes(k)) {
        const match = categories.find((c) => c.name === cat);
        if (match) return match.name;
        break;
      }
    }
  }
  return null;
}

export interface CategoryChange {
  id: string;
  updates: Partial<Transaction>;
}

export function autoCategorizeAll(
  transactions: Transaction[],
  categories: Category[],
  merchantRules: MerchantRules = {}
): CategoryChange[] {
  const changes: CategoryChange[] = [];
  for (const t of transactions) {
    if (t.excluded) continue;
    const updates: Partial<Transaction> = {};
    if (isTransfer(t.description)) {
      updates.excluded = true;
    } else {
      const learned = applyLearnedRules(t.description, merchantRules);
      const cat = learned ?? autoAssignCategory(t.description, categories);
      if (cat && cat !== t.category) updates.category = cat;
    }
    if (Object.keys(updates).length > 0) changes.push({ id: t.id, updates });
  }
  return changes;
}

export async function aiCategorizeUnknown(
  descriptions: string[],
  categories: Category[]
): Promise<Record<string, string>> {
  if (!descriptions.length) return {};
  try {
    const res = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptions, categories: categories.map((c) => c.name) }),
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, string>;
  } catch {
    return {};
  }
}
