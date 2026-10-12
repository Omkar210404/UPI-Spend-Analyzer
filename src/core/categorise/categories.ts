/** The fixed list of categories. Ids are stored in exported settings, so they never change. */
export const CATEGORY_IDS = [
  'food',
  'groceries',
  'transport',
  'bills',
  'shopping',
  'rent',
  'subscriptions',
  'health',
  'transfers',
  'cash',
  'other',
  'income',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  /** One line on what belongs here, shown in the rules editor. */
  hint: string;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'food', label: 'Food and dining', hint: 'Restaurants, cafes, delivery, tea and snacks' },
  { id: 'groceries', label: 'Groceries', hint: 'Supermarkets, kirana shops, milk and vegetables' },
  { id: 'transport', label: 'Transport', hint: 'Cabs, autos, metro, trains, buses, fuel, tolls' },
  {
    id: 'bills',
    label: 'Bills and recharge',
    hint: 'Electricity, mobile, broadband, gas, insurance',
  },
  { id: 'shopping', label: 'Shopping', hint: 'Clothes, electronics, books, online stores' },
  { id: 'rent', label: 'Rent', hint: 'House, flat, PG or hostel rent' },
  { id: 'subscriptions', label: 'Subscriptions', hint: 'Streaming, apps, memberships' },
  { id: 'health', label: 'Health', hint: 'Pharmacies, clinics, hospitals, lab tests' },
  { id: 'transfers', label: 'Transfers to people', hint: 'Money sent to friends and family' },
  { id: 'cash', label: 'Cash withdrawals', hint: 'ATM and branch cash withdrawals' },
  { id: 'other', label: 'Other', hint: 'Anything no rule or override has claimed' },
  {
    id: 'income',
    label: 'Income and credits',
    hint: 'Money coming in: salary, refunds, transfers',
  },
];

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

export function categoryLabel(id: CategoryId): string {
  return BY_ID.get(id)!.label;
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}

/** Categories a keyword rule may assign. Cash, other and income are decided structurally. */
export const RULE_CATEGORIES: readonly CategoryId[] = [
  'rent',
  'subscriptions',
  'groceries',
  'food',
  'transport',
  'bills',
  'health',
  'shopping',
  'transfers',
  'cash',
];
