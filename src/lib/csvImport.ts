import { isTransfer, cleanDescription } from './autoCategory';
import type { Transaction, Category, BankCategoryResult } from './types';

function stripBOM(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim().replace(/^"|"$/g, ''));
  return fields;
}

function parseDate(str: string): string | null {
  if (!str) return null;
  str = str.trim();
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

function parseAmount(str: string): number {
  if (!str) return NaN;
  return parseFloat(str.replace(/[$, ]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : '')));
}

const COLUMN_ALIASES: Record<string, string[]> = {
  date:        ['date', 'transaction date', 'transactiondate', 'posted date', 'posteddate',
                'settlement date', 'settlementdate', 'original date', 'originaldate'],
  description: ['description', 'original description', 'originaldescription', 'name',
                'merchant', 'payee', 'memo', 'narrative', 'details'],
  amount:      ['amount', 'transaction amount', 'transactionamount'],
  debit:       ['debit', 'debit amount', 'debitamount', 'withdrawal', 'withdrawals'],
  credit:      ['credit', 'credit amount', 'creditamount', 'deposit', 'deposits'],
  category:         ['category', 'transaction category', 'transactioncategory', 'type category'],
  type:             ['type', 'transaction type', 'transactiontype', 'debit/credit'],
  account:          ['account', 'account name', 'accountname', 'account #', 'account number'],
  primaryCategory:  ['primary category', 'primarycategory', 'category type'],
  detailedCategory: ['detailed category', 'detailedcategory', 'subcategory', 'sub category'],
};

function buildHeaderMap(rawHeaders: string[]): Record<string, number> {
  const normalized = rawHeaders.map((h) => h.toLowerCase().trim().replace(/\s+/g, ' '));
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) { map[field] = idx; break; }
    }
  }
  return map;
}

function getField(map: Record<string, number>, row: string[], field: string): string {
  const idx = map[field];
  if (idx === undefined || idx >= row.length) return '';
  return (row[idx] ?? '').trim().replace(/^"|"$/g, '');
}

function mapBankCategory(bankCat: string): { name: string; type: 'income' | 'expense' } | null {
  if (!bankCat) return null;
  const c = bankCat.toLowerCase();
  if (/payroll|salary|direct dep|income/.test(c))         return { name: 'Wages & Salary',      type: 'income' };
  if (/interest|dividend|refund|cashback|reward/.test(c)) return { name: 'Other Income',         type: 'income' };
  if (/grocery|grocer|supermarket/.test(c))               return { name: 'Groceries',            type: 'expense' };
  if (/restaurant|dining|food & drink|fast food/.test(c)) return { name: 'Dining & Restaurants', type: 'expense' };
  if (/coffee|cafe/.test(c))                              return { name: 'Coffee & Drinks',       type: 'expense' };
  if (/gas station|fuel|auto|transportation|parking|transit|rideshare/.test(c))
    return { name: 'Transportation & Gas', type: 'expense' };
  if (/health|medical|pharmacy|doctor|dental|fitness|gym/.test(c))
    return { name: 'Health & Fitness', type: 'expense' };
  if (/entertainment|streaming|subscription|movie|music|sport/.test(c))
    return { name: 'Entertainment', type: 'expense' };
  if (/shopping|merchandise|clothing|apparel|fashion|department/.test(c))
    return { name: 'Clothing & Apparel', type: 'expense' };
  if (/invest|brokerage|stock|etf|crypto/.test(c))        return { name: 'Investments',          type: 'expense' };
  if (/rent|mortgage|housing/.test(c))                    return { name: 'Rent / Mortgage',      type: 'expense' };
  return null;
}

function guessFromDescription(desc: string): { name: string; type: 'income' | 'expense' } | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (/irs treas|tax refund|state refund|franchise tax|tax return|stimulus|benefit payment|social security|unemployment/.test(d))
    return { name: 'Wages & Salary', type: 'income' };
  if (/uber technologies|uber.*payment|lyft.*payment|doordash.*payout|instacart.*payout/.test(d))
    return { name: 'Wages & Salary', type: 'income' };
  if (/direct deposit|payroll|ach credit|ach deposit|deposit from|barrett business|adp |paychex|gusto|workday/.test(d))
    return { name: 'Wages & Salary', type: 'income' };
  if (/salary|wages paid|direct dep/.test(d))
    return { name: 'Wages & Salary', type: 'income' };
  if (/conserv fuel|conserv |arco|chevron|shell |76 gas|circle k|conoco|phillips 66|exxon|mobil |bp gas|texaco|sunoco|valero|sinclair|maverik|quiktrip|racetrac|speedway|kwik trip|casey general|pilot flying|loves travel|wawa gas|sheetz|thorntons|getgo gas|cenex|flying j|fuel |gasoline|gas station|petro stop/.test(d))
    return { name: 'Transportation & Gas', type: 'expense' };
  if (/uber|lyft|metro|transit|parking|spothero|parkwhiz|ez pass|ezpass|amtrak|greyhound|megabus/.test(d))
    return { name: 'Transportation & Gas', type: 'expense' };
  if (/africa renewal|charity|donation|donate|nonprofit|non-profit|tithe|church offering|gofundme|red cross|salvation army|goodwill|habitat for humanity|united way|relief fund/.test(d))
    return { name: 'Gifts & Donations', type: 'expense' };
  if (/grocery|safeway|kroger|whole foods|trader joe|albertson|publix|aldi|wegmans|sprouts|costco|h-e-b|meijer|winco|lidl/.test(d))
    return { name: 'Groceries', type: 'expense' };
  if (/chipotle|mcdonald|burger king|pizza|sushi|panera|subway|wendy|domino|taco bell|chick-fil|doordash|grubhub|ubereats|restaurant|grill|bistro|diner|cafe/.test(d))
    return { name: 'Dining & Restaurants', type: 'expense' };
  if (/starbucks|dunkin|peet|blue bottle|dutch bros|coffee/.test(d))
    return { name: 'Coffee & Drinks', type: 'expense' };
  if (/rent|apartment|lease|landlord/.test(d))
    return { name: 'Rent / Mortgage', type: 'expense' };
  if (/netflix|spotify|hulu|disney|hbo|youtube premium|apple music|amazon prime/.test(d))
    return { name: 'Entertainment', type: 'expense' };
  if (/amazon|target|walmart|zara|gap|old navy|nordstrom|macy|tj maxx|tjmaxx|ross stores|marshalls/.test(d))
    return { name: 'Clothing & Apparel', type: 'expense' };
  if (/cvs|walgreens|rite aid|pharmacy|urgent care|doctor|dental|gym|fitness/.test(d))
    return { name: 'Health & Fitness', type: 'expense' };
  if (/fidelity|vanguard|schwab|robinhood|etrade/.test(d))
    return { name: 'Investments', type: 'expense' };
  if (/wedding|bride|florist|venue|caterer/.test(d))
    return { name: 'Wedding', type: 'expense' };
  return null;
}

function mapFromBankCategories(primary: string, detailed: string): BankCategoryResult | null {
  const p = (primary  ?? '').toLowerCase().trim();
  const d = (detailed ?? '').toLowerCase().trim();

  if (p === 'transfers' || p === 'transfer' ||
      d.includes('savings transfer') || d.includes('account transfer') ||
      d.includes('internal transfer') || d.includes('credit card payment') ||
      p === 'debt payments' || p === 'debt payment')
    return { exclude: true };

  if (p === 'income' || d.includes('wages') || d.includes('payroll') ||
      d.includes('salary') || d.includes('direct deposit'))
    return { name: 'Wages & Salary', type: 'income' };
  if (d.includes('interest') || d.includes('dividend') || d.includes('refund') ||
      d.includes('cashback') || d.includes('reward'))
    return { name: 'Other Income', type: 'income' };

  if (d.includes('groceries') || d.includes('supermarket'))
    return { name: 'Groceries', type: 'expense' };
  if (d.includes('restaurant') || d.includes('bars') || d.includes('fast food') ||
      d.includes('other food') || d.includes('food & drink') || d.includes('cafe'))
    return { name: 'Dining & Restaurants', type: 'expense' };
  if (d.includes('coffee') || d.includes('tea'))
    return { name: 'Coffee & Drinks', type: 'expense' };
  if (d.includes('gas') || d.includes('ev charging') || d.includes('fuel') ||
      d.includes('parking') || d.includes('tolls') || d.includes('transit') ||
      d.includes('rideshare') || d.includes('taxi') || d.includes('auto'))
    return { name: 'Transportation & Gas', type: 'expense' };
  if (d.includes('clothing') || d.includes('apparel'))
    return { name: 'Clothing & Apparel', type: 'expense' };
  if (d.includes('electronics') || d.includes('department store') ||
      d.includes('online marketplace') || d.includes('sporting goods') ||
      d.includes('home improvement') || d.includes('furniture'))
    return { name: 'Shopping', type: 'expense' };
  if (d.includes('pharmacy') || d.includes('doctor') || d.includes('dental') ||
      d.includes('medical') || d.includes('hospital'))
    return { name: 'Medical', type: 'expense' };
  if (d.includes('fitness') || d.includes('gym') || d.includes('sport'))
    return { name: 'Health & Fitness', type: 'expense' };
  if (d.includes('utilities') || d.includes('electric') || d.includes('water') ||
      d.includes('gas bill') || d.includes('internet') || d.includes('cable'))
    return { name: 'Utilities', type: 'expense' };
  if (d.includes('insurance'))           return { name: 'Insurance',       type: 'expense' };
  if (d.includes('subscription') || d.includes('streaming'))
    return { name: 'Subscriptions', type: 'expense' };
  if (d.includes('phone') || d.includes('mobile') || d.includes('wireless'))
    return { name: 'Phone', type: 'expense' };
  if (d.includes('mortgage') || d.includes('rent'))
    return { name: 'Rent / Mortgage', type: 'expense' };
  if (d.includes('loan') || d.includes('student loan'))
    return { name: 'Loan Payment', type: 'expense' };
  if (d.includes('education') || d.includes('tuition'))
    return { name: 'Education', type: 'expense' };
  if (d.includes('charity') || d.includes('donation') || d.includes('nonprofit'))
    return { name: 'Gifts & Donations', type: 'expense' };
  if (d.includes('travel') || d.includes('hotel') || d.includes('airline') ||
      d.includes('vacation'))
    return { name: 'Travel', type: 'expense' };
  if (d.includes('personal care') || d.includes('salon') || d.includes('spa') ||
      d.includes('barber'))
    return { name: 'Personal Care', type: 'expense' };
  if (p === 'entertainment') return { name: 'Entertainment', type: 'expense' };
  if (p === 'services')      return { name: 'Other',         type: 'expense' };

  return null;
}

export function importCSV(rawText: string, categories: Category[] = []): Transaction[] {
  const text = stripBOM(rawText);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('//'));
  if (lines.length < 2) throw new Error('CSV appears to be empty or has no data rows.');

  const headers = parseCSVLine(lines[0]);
  const map = buildHeaderMap(headers);

  if (map['date'] === undefined) {
    throw new Error(`Could not find a date column. Headers found: ${headers.slice(0, 8).join(', ')}`);
  }
  const hasAmount      = map['amount'] !== undefined;
  const hasDebitCredit = map['debit'] !== undefined || map['credit'] !== undefined;
  if (!hasAmount && !hasDebitCredit) {
    throw new Error(`Could not find an amount column. Headers found: ${headers.slice(0, 8).join(', ')}`);
  }

  const knownNames = new Set(categories.map((c) => c.name));
  const fallbackExpense = knownNames.has('Other')
    ? 'Other'
    : (categories.find((c) => c.type === 'expense')?.name ?? 'Other');
  const fallbackIncome = knownNames.has('Other Income')
    ? 'Other Income'
    : (categories.find((c) => c.type === 'income')?.name ?? 'Other Income');

  const transactions: Transaction[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2 || row.every((f) => !f)) continue;

    const date = parseDate(getField(map, row, 'date'));
    if (!date) { skipped++; continue; }

    const description = getField(map, row, 'description') || 'Imported transaction';

    const creditStr = map['credit'] !== undefined ? getField(map, row, 'credit') : '';
    const debitStr  = map['debit']  !== undefined ? getField(map, row, 'debit')  : '';
    const creditVal = parseAmount(creditStr);
    const debitVal  = parseAmount(debitStr);
    const creditHasValue = creditStr.trim() !== '' && !isNaN(creditVal) && creditVal > 0;
    const debitHasValue  = debitStr.trim()  !== '' && !isNaN(debitVal)  && debitVal  > 0;
    const typeField = getField(map, row, 'type').toLowerCase();

    let amount: number;
    if (creditHasValue && !debitHasValue) {
      amount = -Math.abs(creditVal);
    } else if (debitHasValue && !creditHasValue) {
      amount = Math.abs(debitVal);
    } else if (debitHasValue && creditHasValue) {
      amount = debitVal - creditVal;
    } else if (hasAmount) {
      const raw = parseAmount(getField(map, row, 'amount'));
      if (isNaN(raw)) { skipped++; continue; }
      amount = -raw;
    } else {
      skipped++; continue;
    }

    if (typeField && !(creditHasValue !== debitHasValue)) {
      const isIncomeType  = /credit|deposit|payment received|direct deposit/.test(typeField);
      const isExpenseType = /debit|purchase|withdrawal/.test(typeField);
      if (isIncomeType  && amount > 0) amount = -amount;
      if (isExpenseType && amount < 0) amount = -amount;
    }

    const primaryCat  = getField(map, row, 'primaryCategory');
    const detailedCat = getField(map, row, 'detailedCategory');
    const bankResolved = mapFromBankCategories(primaryCat, detailedCat);

    if (bankResolved?.exclude) {
      const account = getField(map, row, 'account') || undefined;
      const dn = cleanDescription(description);
      transactions.push({
        id: `import_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        date, description,
        ...(dn && { displayName: dn }),
        amount: Math.round(amount * 100) / 100,
        category: fallbackExpense,
        ...(account && { account }),
        excluded: true,
        categorizedBy: 'bank',
      });
      continue;
    }

    let catName: string;
    let categorizedBy: Transaction['categorizedBy'];

    if (bankResolved && bankResolved.name) {
      catName = knownNames.has(bankResolved.name)
        ? bankResolved.name
        : (bankResolved.type === 'income' ? fallbackIncome : fallbackExpense);
      categorizedBy = 'bank';
      if (bankResolved.type === 'income'  && amount > 0) amount = -amount;
      if (bankResolved.type === 'expense' && amount < 0) amount = -amount;
    } else {
      const legacyCat  = getField(map, row, 'category');
      const legacyHint = mapBankCategory(legacyCat);
      const descGuess  = guessFromDescription(description);
      const guess      = legacyHint ?? descGuess;

      if (descGuess?.type === 'income' && amount > 0) amount = -amount;

      if (guess && knownNames.has(guess.name)) {
        catName = guess.name;
        categorizedBy = 'keyword';
      } else {
        catName = amount > 0 ? fallbackExpense : fallbackIncome;
        categorizedBy = undefined;
      }
    }

    const excluded = isTransfer(description);
    const account  = getField(map, row, 'account') || undefined;
    const dn       = cleanDescription(description);
    transactions.push({
      id: `import_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      date, description,
      ...(dn            && { displayName: dn }),
      amount: Math.round(amount * 100) / 100,
      category: catName,
      ...(account       && { account }),
      ...(excluded      && { excluded: true }),
      ...(categorizedBy && { categorizedBy }),
    });
  }

  if (transactions.length === 0) {
    const hint = skipped > 0 ? ` (${skipped} rows skipped — check date/amount format)` : '';
    throw new Error(`No valid transactions found.${hint}`);
  }
  return transactions;
}
