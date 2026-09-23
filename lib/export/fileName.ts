/** "Fazenda Boa Vista" -> "fazenda-boa-vista": no accents, lower case, dashes. */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "rebanho_fazenda-boa-vista_2026-09-22.xlsx" */
export function exportFileName(list: string, farmName: string, isoDate: string, ext: string): string {
  return [slug(list), slug(farmName), isoDate].filter(Boolean).join("_") + `.${ext}`;
}
