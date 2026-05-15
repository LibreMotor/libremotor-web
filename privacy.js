const ANALYTICS_STORAGE_KEY = "libremotor.analyticsConsent";
const ANALYTICS_SCRIPT_URL = "https://umami.sabino.pro/script.js";
const ANALYTICS_WEBSITE_ID = "0196fb4c-dc95-4c85-9852-7ecd26c190a0";

const copy = document.documentElement.lang === "pt-BR"
  ? {
      title: "Privacidade",
      text:
        "Usamos Umami auto-hospedado para medir visitas e melhorar o site. A análise só é carregada se você aceitar.",
      accept: "Aceitar análise",
      decline: "Recusar",
      saved: "Preferência de privacidade atualizada.",
    }
  : {
      title: "Privacy",
      text:
        "We use self-hosted Umami analytics to measure visits and improve the site. Analytics only loads if you accept.",
      accept: "Accept analytics",
      decline: "Decline",
      saved: "Privacy preference updated.",
    };

function analyticsConsent() {
  return localStorage.getItem(ANALYTICS_STORAGE_KEY);
}

function setAnalyticsConsent(value) {
  localStorage.setItem(ANALYTICS_STORAGE_KEY, value);
  document.querySelector("[data-consent-banner]")?.remove();
  if (value === "granted") {
    loadAnalytics();
  }
}

function loadAnalytics() {
  if (document.querySelector(`script[src="${ANALYTICS_SCRIPT_URL}"]`)) {
    return;
  }
  const script = document.createElement("script");
  script.defer = true;
  script.src = ANALYTICS_SCRIPT_URL;
  script.dataset.websiteId = ANALYTICS_WEBSITE_ID;
  document.head.append(script);
}

function showConsentBanner(force = false) {
  if (!force && analyticsConsent()) {
    return;
  }
  document.querySelector("[data-consent-banner]")?.remove();
  const banner = document.createElement("section");
  banner.className = "consent-banner";
  banner.dataset.consentBanner = "true";
  banner.setAttribute("aria-label", copy.title);
  banner.innerHTML = `
    <h2>${copy.title}</h2>
    <p>${copy.text}</p>
    <div class="consent-actions">
      <button class="button primary" type="button" data-consent-accept>${copy.accept}</button>
      <button class="button subtle" type="button" data-consent-decline>${copy.decline}</button>
    </div>
  `;
  document.body.append(banner);
  banner.querySelector("[data-consent-accept]")?.addEventListener("click", () => setAnalyticsConsent("granted"));
  banner.querySelector("[data-consent-decline]")?.addEventListener("click", () => setAnalyticsConsent("denied"));
}

document.querySelectorAll("[data-privacy-settings]").forEach((button) => {
  button.addEventListener("click", () => showConsentBanner(true));
});

if (analyticsConsent() === "granted") {
  loadAnalytics();
} else if (!analyticsConsent()) {
  showConsentBanner();
}

window.LibremotorPrivacy = {
  showConsentBanner,
  analyticsConsent,
};
