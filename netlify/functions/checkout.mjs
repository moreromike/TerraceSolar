// Terrace Solar online checkout.
// Creates a Stripe Checkout page for the kit the customer picked on the site.
//
// Setup (one time, in Netlify: Project configuration > Environment variables):
//   STRIPE_SECRET_KEY       your Stripe secret key (sk_test_... to test, sk_live_... to take real payments)
//   STRIPE_AUTOMATIC_TAX    optional. "true" once Stripe Tax is set up, so California sales tax is added at checkout
//
// Prices are never taken from the browser. This function reads SITE_CONFIG from the
// live page itself, so the prices in index.html are the only prices to keep up to date.
import vm from "node:vm";

const ALLOWED_HOSTS = /(^|\.)terracesolar\.com$|(^|--)terracesolar\.netlify\.app$/;
const FALLBACK_ORIGIN = "https://terracesolar.com";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function loadConfig(origin) {
  const html = await (await fetch(origin + "/", { headers: { "Cache-Control": "no-cache" } })).text();
  const match = html.match(/<script>([\s\S]*?window\.SITE_CONFIG\s*=[\s\S]*?)<\/script>/);
  if (!match) throw new Error("SITE_CONFIG not found");
  const sandbox = { window: {} };
  vm.runInNewContext(match[1], sandbox, { timeout: 500 });
  return sandbox.window.SITE_CONFIG;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json(503, { error: "checkout-not-configured" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "bad-request" }); }

  const reqUrl = new URL(req.url);
  const origin = ALLOWED_HOSTS.test(reqUrl.hostname) ? reqUrl.origin : FALLBACK_ORIGIN;

  let C;
  try { C = await loadConfig(origin); } catch { return json(500, { error: "config" }); }
  if (!C.purchase || !C.purchase.onlineCheckout) return json(409, { error: "checkout-off" });
  if (C.pricesAreSamples) return json(409, { error: "prices-not-final" });

  // Find the kit size and battery the customer chose
  let line, size;
  for (const l of C.lines) {
    const s = l.sizes.find((x) => x.id === body.size);
    if (s) { line = l; size = s; break; }
  }
  if (!size) return json(400, { error: "unknown-kit" });
  const kwh = Number(body.battery) || 0;
  const batt = kwh && line.battery ? line.battery.options.find((o) => o.kwh === kwh) : null;
  if (kwh && !batt) return json(400, { error: "unknown-battery" });

  const total = size.price + (batt ? batt.price : 0);
  if (Number(body.expectedTotal) !== total) return json(409, { error: "price-changed" });

  // Build the Stripe Checkout Session
  const p = new URLSearchParams();
  const item = (i, name, desc, dollars) => {
    p.set(`line_items[${i}][quantity]`, "1");
    p.set(`line_items[${i}][price_data][currency]`, "usd");
    p.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(dollars * 100)));
    p.set(`line_items[${i}][price_data][product_data][name]`, name);
    if (desc) p.set(`line_items[${i}][price_data][product_data][description]`, desc.slice(0, 500));
  };
  item(0, `${line.name} ${size.label} plug-in solar kit`, `${line.maker}. Includes: ${size.contents.join(", ")}`, size.price);
  if (batt) item(1, `${line.battery.name}, ${batt.kwh} kWh`, line.battery.note, batt.price);

  p.set("mode", "payment");
  p.set("success_url", `${origin}/?order=success#check`);
  p.set("cancel_url", `${origin}/?order=canceled#check`);
  p.set("billing_address_collection", "required");
  p.set("shipping_address_collection[allowed_countries][0]", "US");
  p.set("phone_number_collection[enabled]", "true");
  if (process.env.STRIPE_AUTOMATIC_TAX === "true") p.set("automatic_tax[enabled]", "true");
  if (typeof body.email === "string" && /^\S+@\S+\.\S+$/.test(body.email)) p.set("customer_email", body.email.trim());
  p.set("client_reference_id", size.id + (batt ? `+${batt.kwh}kwh` : ""));
  const meta = {
    kit: `${line.name} ${size.label}${batt ? ` + ${batt.kwh} kWh battery` : ""}`,
    installation_requested: body.install ? "yes" : "no",
    name: String(body.name || "").slice(0, 200),
    phone: String(body.phone || "").slice(0, 40),
    zip: String(body.zip || "").slice(0, 10),
  };
  for (const [k, v] of Object.entries(meta)) {
    p.set(`metadata[${k}]`, v);
    p.set(`payment_intent_data[metadata][${k}]`, v);
  }
  if (body.install) p.set("custom_text[submit][message]", "You asked for professional installation. We'll confirm that price with you separately.");

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  const session = await r.json();
  if (!r.ok) {
    console.error("Stripe error", session && session.error && session.error.message);
    return json(502, { error: "stripe" });
  }
  return json(200, { url: session.url });
};
