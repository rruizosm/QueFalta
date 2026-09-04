// Policy supplied after source inspection of every water-stratum observation.
// This is an offline annotation contract, never a production classifier.
export const WATER_REVIEW_VERSION = 'ce202-water-source-review-v1';
export const WATER_REVIEW_DATE = '2026-09-03';
export const WATER_REVIEW_AUTHOR = 'assistant_source_review_with_deterministic_pair_composition';

// Exact observations whose own source fields disagree. They stay unresolved;
// nearby SKUs, brands, prices and images must not silently repair them.
export const WATER_SOURCE_DISPUTES = {
  'carrefour:520661066': 'title_omits_carbonation_denomination_declares_added_carbon_dioxide',
  'carrefour:526627408': 'title_omits_carbonation_denomination_declares_added_carbon_dioxide',
  'carrefour:prod170182': 'suspect_literal_1_25_cl_not_autocorrected_to_litres',
  'carrefour:VC4AECOMM-387224': 'sugar_free_title_conflicts_with_sugar_and_fructose_syrup_ingredients',
  'plusfresc:007307': 'title_pack_6x150cl_conflicts_with_300ml_description',
  'plusfresc:014934': 'title_1l_conflicts_with_75cl_description',
  'plusfresc:029934': 'ribes_title_conflicts_with_font_agudes_description',
  'plusfresc:032380': 'sin_gas_category_conflicts_with_gas_description',
};

// One positive is explicitly nominated only after bilateral source inspection.
// Runtime validation still requires a valid global GTIN, exact numeric/container
// format and no contradictory source assertion. The exception cannot bypass a
// failed validator or create commercial eligibility.
export const REVIEWED_POSITIVE_PAIRS = new Set([
  'consum:2569879|mercadona:27232',
]);

export const WATER_ATTRIBUTES = [
  'water_class',
  'gas',
  'water_flavour',
  'water_additives',
  'mineralisation_claim',
  'closure_variant',
  'carbonation_intensity',
  'declarations_complete',
];

