import type { CategoryId } from './categories';

/**
 * Keyword rules.
 *
 * A rule is a category and a list of keywords. Rules are tried top to bottom
 * and the first keyword that matches decides the category.
 *
 * Keywords match **whole words**, ignoring case and punctuation, so `OLA`
 * matches `OLA CABS` but not `COLABA` or `CHOLA`. A keyword of several words
 * matches that phrase. A trailing `*` matches the start of a word: `SWIGGY*`
 * matches `SWIGGYINSTAMART`.
 */
export interface Rule {
  id: string;
  category: CategoryId;
  keywords: string[];
}

/** Upper-cases and reduces text to words separated by single spaces. */
export function normaliseText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9*]+/g, ' ')
    .trim();
}

/** Cleans a keyword as typed by the user. Returns null when nothing usable is left. */
export function normaliseKeyword(keyword: string): string | null {
  const words = normaliseText(keyword)
    .split(' ')
    // A `*` is only meaningful at the end of a word.
    .map((word) => (word.endsWith('*') ? `${word.replace(/\*/g, '')}*` : word.replace(/\*/g, '')))
    .filter((word) => word !== '' && word !== '*');
  return words.length === 0 ? null : words.join(' ');
}

function wordMatches(pattern: string, word: string): boolean {
  return pattern.endsWith('*') ? word.startsWith(pattern.slice(0, -1)) : word === pattern;
}

/** True when the keyword's words appear, in order and side by side, in the text's words. */
export function keywordMatches(keyword: string, words: readonly string[]): boolean {
  const pattern = keyword.split(' ');
  for (let start = 0; start + pattern.length <= words.length; start += 1) {
    if (pattern.every((part, offset) => wordMatches(part, words[start + offset]!))) return true;
  }
  return false;
}

export interface RuleMatch {
  rule: Rule;
  keyword: string;
}

/** The first rule, and the keyword in it, that matches the text. */
export function matchRules(text: string, rules: readonly Rule[]): RuleMatch | null {
  const words = normaliseText(text).replace(/\*/g, ' ').split(' ').filter(Boolean);
  for (const rule of rules) {
    for (const raw of rule.keywords) {
      const keyword = normaliseKeyword(raw);
      if (keyword && keywordMatches(keyword, words)) return { rule, keyword: raw };
    }
  }
  return null;
}

/**
 * The rules the app starts with. They mix everyday words (`PHARMACY`,
 * `RECHARGE`) with well-known brand names, and they are only a starting
 * point: every one of them can be edited, reordered or removed in the app.
 *
 * Order matters. Rent and subscriptions come first because their keywords
 * are the most specific; groceries comes before food so a grocery arm of a
 * food brand lands in groceries.
 */
export const DEFAULT_RULES: readonly Rule[] = [
  {
    id: 'default-rent',
    category: 'rent',
    keywords: ['RENT', 'LANDLORD', 'HOSTEL', 'PG RENT', 'PAYING GUEST'],
  },
  {
    id: 'default-subscriptions',
    category: 'subscriptions',
    keywords: [
      'SUBSCRIPTION',
      'MEMBERSHIP',
      'MONTHLY PLAN',
      'STREAM*',
      'NETFLIX',
      'SPOTIFY',
      'HOTSTAR',
      'PRIME VIDEO',
      'YOUTUBE',
      'JIOCINEMA',
      'SONYLIV',
      'ZEE5',
      'AUDIBLE',
      'ICLOUD',
      'GOOGLE ONE',
      'GYM',
      'FITNESS',
    ],
  },
  {
    id: 'default-groceries',
    category: 'groceries',
    keywords: [
      'GROCER*',
      'KIRANA',
      'SUPERMARKET',
      'SUPERMART',
      'PROVISION*',
      'VEGETABLE*',
      'FRUITS',
      'DAIRY',
      'MILK',
      'BASKET',
      'FRESHBASKET',
      'BIGBASKET',
      'BLINKIT',
      'ZEPTO',
      'INSTAMART',
      'DMART',
      'JIOMART',
    ],
  },
  {
    id: 'default-food',
    category: 'food',
    keywords: [
      'RESTAURANT*',
      'CAFE',
      'DHABA',
      'BAKERY',
      'BIRYANI',
      'PIZZA',
      'CANTEEN',
      'SWEETS',
      'CHAI',
      'TEA',
      'KITCHEN',
      'EATS',
      'SWIGGY*',
      'ZOMATO*',
      'DOMINOS',
      'MCDONALDS',
      'KFC',
      'STARBUCKS',
    ],
  },
  {
    id: 'default-transport',
    category: 'transport',
    keywords: [
      'METRO',
      'CAB',
      'CABS',
      'TAXI',
      'RICKSHAW',
      'RIDE',
      'RIDES',
      'BUS',
      'RAILWAY*',
      'PETROL',
      'DIESEL',
      'FUEL',
      'PARKING',
      'TOLL',
      'FASTAG',
      'UBER',
      'OLA',
      'RAPIDO',
      'IRCTC',
      'REDBUS',
    ],
  },
  {
    id: 'default-bills',
    category: 'bills',
    keywords: [
      'ELECTRICITY',
      'RECHARGE',
      'BROADBAND',
      'FIBER',
      'POSTPAID',
      'PREPAID',
      'DTH',
      'GAS',
      'WATER BILL',
      'BILL',
      'BILLPAY',
      'BBPS',
      'INSURANCE',
      'AIRTEL',
      'JIO',
      'VODAFONE',
      'BSNL',
      'TATAPLAY',
      'LIC',
    ],
  },
  {
    id: 'default-health',
    category: 'health',
    keywords: [
      'PHARMACY',
      'PHARMA',
      'CHEMIST',
      'MEDICAL*',
      'MEDICINE*',
      'HOSPITAL*',
      'CLINIC',
      'DIAGNOSTIC*',
      'LAB',
      'LABS',
      'DENTAL',
      'DOCTOR',
      'APOLLO',
      'PHARMEASY',
      'NETMEDS',
      'PRACTO',
    ],
  },
  {
    id: 'default-shopping',
    category: 'shopping',
    keywords: [
      'SHOPPING',
      'STORE',
      'STORES',
      'FASHION',
      'CLOTHING',
      'ELECTRONICS',
      'FURNITURE',
      'BOOKS',
      'MALL',
      'RETAIL',
      'AMAZON',
      'FLIPKART',
      'MYNTRA',
      'AJIO',
      'MEESHO',
      'NYKAA',
      'CROMA',
      'DECATHLON',
    ],
  },
];
