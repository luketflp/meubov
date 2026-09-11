/**
 * Facts the homepage prints that are not code: the farms in the marquee, a
 * testimonial once there is a real one, and whether the legal pages exist.
 */
export interface Testimonial {
  quote: string;
  name: string;
  farm: string;
  city: string;
  heads: number;
}

/** Set to a real quote to show the section; null hides it. */
export const TESTIMONIAL: Testimonial | null = null;

/** Flip when /termos and /privacidade exist; until then the footer omits them. */
export const LEGAL_PAGES = false;

/** Farms shown in the social-proof marquee. */
export const FARMS: readonly { name: string; logo: string }[] = [
  { name: "Fazenda Maranata", logo: "/farms/maranata.png" },
];
