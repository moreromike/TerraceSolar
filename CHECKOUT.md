# Turning on online payments (Stripe)

The site is built to take card payments through Stripe Checkout. It stays off until you do these steps.

## How it works
1. The customer picks a kit (and battery) and fills in the order form.
2. The order is saved in Netlify Forms and emailed to you, even if they never pay.
3. With online checkout on, they go straight to a secure Stripe payment page for that exact kit.
4. After paying, they land back on the site with a "Thank you for your order" message. Stripe emails them a receipt and emails you the sale.

Prices come only from `SITE_CONFIG` in `index.html`. The checkout function reads the live page, so there is one price list to maintain. It refuses to charge if:
- `pricesAreSamples` is still `true`, or
- the price shown to the customer doesn't match.

## Steps
1. Create a Stripe account at stripe.com and finish business verification (bank account for payouts).
2. In Stripe, go to Developers > API keys and copy the **Secret key**. Start with the test key (`sk_test_...`).
3. In Netlify, go to Project configuration > Environment variables > Add a variable:
   - Key: `STRIPE_SECRET_KEY`
   - Value: your secret key
4. In `index.html`, set `purchase.onlineCheckout: true` and `pricesAreSamples: false` (after the prices are final).
5. Publish, and place a test order with Stripe's test card `4242 4242 4242 4242`, any future date and any CVC.
6. When the test order works, swap the variable to your live key (`sk_live_...`) and redeploy.

## Sales tax
California sales tax applies to equipment sales. Two options:
- Turn on Stripe Tax in Stripe (Settings > Tax, add your California registration). Then add the Netlify variable `STRIPE_AUTOMATIC_TAX` = `true`. Tax is calculated from the shipping address.
- Or include tax in your listed prices and handle it yourself.

## Installation
Installation is not charged online. When a customer checks "installation," the Stripe payment shows `installation_requested: yes`, and you quote and bill it separately.
