const LIBREMOTOR_COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

for (const select of document.querySelectorAll("[data-country-select]")) {
  populateCountrySelect(select);
}

function populateCountrySelect(select) {
  const locale = select.dataset.countryLocale || document.documentElement.lang || navigator.language || "en";
  const displayNames =
    typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([locale, "en"], { type: "region" }) : null;
  const options = LIBREMOTOR_COUNTRY_CODES.map((code) => ({
    code,
    label: displayNames?.of(code) || code,
  })).sort((left, right) => left.label.localeCompare(right.label, locale, { sensitivity: "base" }));
  const selected = select.value || select.dataset.countryDefault || "";
  const placeholder = select.querySelector("option[value='']")?.cloneNode(true) || null;
  const fragment = document.createDocumentFragment();
  if (placeholder) fragment.append(placeholder);

  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.code;
    element.textContent = `${option.label} (${option.code})`;
    fragment.append(element);
  }

  select.replaceChildren(fragment);
  select.value = selected;
}
