const API_URL = "https://api.libremotor.com/v1/beta-interest";
const TURNSTILE_SITE_KEY = document.querySelector("meta[name='turnstile-site-key']")?.content.trim() || "";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onLibremotorTurnstileLoad";
const turnstileForms = [];

for (const form of document.querySelectorAll("[data-interest-form]")) {
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector("button[type='submit']");
  const turnstileContainer = form.querySelector("[data-turnstile]");
  const turnstileState = {
    container: turnstileContainer,
    widgetId: null,
    token: "",
  };

  form.libremotorTurnstile = turnstileState;
  if (TURNSTILE_SITE_KEY && turnstileContainer) {
    turnstileForms.push(form);
  } else if (turnstileContainer) {
    turnstileContainer.hidden = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      email: data.get("email"),
      vehicle_type: data.get("vehicle_type"),
      country: data.get("country"),
      region: data.get("region"),
      ownership_duration: data.get("ownership_duration"),
      app_interests: data.getAll("app_interests"),
      other_app_interest: data.get("other_app_interest"),
      notes: data.get("notes"),
      website: data.get("website"),
      turnstile_token: turnstileToken(form, data),
      locale: form.dataset.locale || document.documentElement.lang || navigator.language || "en",
      source: "website",
    };

    status.textContent = form.dataset.loading || "Sending...";
    status.dataset.state = "loading";
    submit.disabled = true;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Request failed");
      }
      form.reset();
      resetTurnstile(form);
      status.textContent = form.dataset.success || "Interest recorded. We will contact you when your beta slot is ready.";
      status.dataset.state = "success";
    } catch (error) {
      resetTurnstile(form);
      status.textContent = error.message || form.dataset.error || "Could not submit right now. Please try again in a moment.";
      status.dataset.state = "error";
    } finally {
      submit.disabled = false;
    }
  });
}

window.onLibremotorTurnstileLoad = () => {
  if (!window.turnstile) return;
  for (const form of turnstileForms) {
    const state = form.libremotorTurnstile;
    if (!state?.container || state.widgetId !== null) continue;
    state.container.hidden = false;
    state.widgetId = window.turnstile.render(state.container, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      size: "flexible",
      callback: (token) => {
        state.token = token;
      },
      "expired-callback": () => {
        state.token = "";
      },
      "error-callback": () => {
        state.token = "";
      },
    });
  }
};

if (TURNSTILE_SITE_KEY && turnstileForms.length) {
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT_URL;
  script.async = true;
  script.defer = true;
  document.head.append(script);
}

function turnstileToken(form, data) {
  const state = form.libremotorTurnstile;
  if (state?.widgetId !== null && window.turnstile) {
    return window.turnstile.getResponse(state.widgetId) || state.token || "";
  }
  return data.get("cf-turnstile-response") || "";
}

function resetTurnstile(form) {
  const state = form.libremotorTurnstile;
  state.token = "";
  if (state?.widgetId !== null && window.turnstile) {
    window.turnstile.reset(state.widgetId);
  }
}
