import type { Transaction, Category, MerchantRules } from './types';

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
