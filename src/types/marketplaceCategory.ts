/**
 * V1.7A — Category Governance Data Models & Interfaces
 * Phase 6: Marketplace Governance
 *
 * Principles:
 * 1. Marketplace categories are platform-governed data.
 * 2. Categories do NOT belong to sellers.
 * 3. Seller free-text, AI, and images/videos must NOT create categories.
 * 4. Only authorized admin/governance workflows can create, update, or deactivate categories.
 * 5. Category IDs are the stable, authoritative identifiers (not category names).
 */

export type CategoryType = 'ROOT' | 'CATEGORY' | 'SUBCATEGORY';

export type CategoryStatus = 'ACTIVE' | 'INACTIVE';

export interface GovernedCategory {
  categoryId: string; // Stable unique identifier, e.g. 'cat_chakula_cha_mifugo', 'cat_kuku_starter'
  name: string; // Swahili/localized name, e.g. 'Chakula cha Mifugo'
  slug: string; // Unique URL/Search-friendly slug, e.g. 'chakula-cha-mifugo'
  description: string;
  parentCategoryId: string | null; // null for ROOT or top-level CATEGORY
  categoryType: CategoryType;
  status: CategoryStatus;
  sortOrder: number;
  iconName?: string;
  livestockTypesAllowed?: string[]; // Preserves category vs livestockType distinction
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface CategoryHierarchyNode extends GovernedCategory {
  children: GovernedCategory[];
}

export interface CategoryValidationResult {
  isValid: boolean;
  categoryId?: string;
  category?: GovernedCategory;
  subcategoryId?: string;
  subcategory?: GovernedCategory;
  error?: string;
  errorCode?:
    | 'CATEGORY_NOT_FOUND'
    | 'CATEGORY_INACTIVE'
    | 'SUBCATEGORY_NOT_FOUND'
    | 'SUBCATEGORY_INACTIVE'
    | 'INVALID_HIERARCHY_RELATION'
    | 'CIRCULAR_HIERARCHY_DETECTED'
    | 'UNAUTHORIZED_MUTATION'
    | 'MALFORMED_CATEGORY_ID'
    | 'DUPLICATE_SLUG'
    | 'SELF_PARENTING_FORBIDDEN';
}

export type ProductCategoryResolutionState =
  | 'GOVERNED_VALID'
  | 'GOVERNED_INACTIVE'
  | 'LEGACY_RESOLVED'
  | 'CATEGORY_NOT_PROVIDED'
  | 'INVALID';

export interface ProductCategoryTrustResolution {
  state: ProductCategoryResolutionState;
  isGoverned: boolean;
  categoryId: string | null;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  categoryType?: CategoryType;
  categoryStatus?: CategoryStatus;
  displayCategory: string;
  isLegacyProduct: boolean;
  isSelectableForNewListing: boolean;
  notice?: string;
}

export interface CreateCategoryInput {
  categoryId: string;
  name: string;
  slug?: string;
  description: string;
  parentCategoryId?: string | null;
  categoryType: CategoryType;
  status?: CategoryStatus;
  sortOrder?: number;
  iconName?: string;
  livestockTypesAllowed?: string[];
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string;
  parentCategoryId?: string | null;
  status?: CategoryStatus;
  sortOrder?: number;
  iconName?: string;
  livestockTypesAllowed?: string[];
}
