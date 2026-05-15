const API_URL = "https://api.libremotor.com/v1/beta-interest";

for (const form of document.querySelectorAll("[data-interest-form]")) {
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      email: data.get("email"),
      vehicle_type: data.get("vehicle_type"),
      country: data.get("country"),
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
      status.textContent = form.dataset.success || "Interest recorded. We will contact you when your beta slot is ready.";
      status.dataset.state = "success";
    } catch {
      status.textContent = form.dataset.error || "Could not submit right now. Please try again in a moment.";
      status.dataset.state = "error";
    } finally {
      submit.disabled = false;
    }
  });
}
