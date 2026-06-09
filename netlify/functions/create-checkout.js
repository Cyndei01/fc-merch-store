const SITE_URL = 'https://merch.fcpackaginginc.com';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) {
    return respond(500, { error: 'Stripe key not configured.' });
  }

  let stripe;
  try {
    stripe = require('stripe')(key);
  } catch (e) {
    return respond(500, { error: 'Failed to load Stripe: ' + e.message });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const items = body.items || [];

    if (items.length === 0) {
      return respond(400, { error: 'Cart is empty' });
    }

    const line_items = items.map(item => {
      const parts = [String(item.name)];
      if (item.color) parts.push(String(item.color));
      if (item.size)  parts.push(String(item.size));
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: parts.join(', ') },
          unit_amount: Math.round(Number(item.priceNum) * 100),
        },
        quantity: Math.max(1, parseInt(item.qty, 10)),
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: SITE_URL + '/success.html',
      cancel_url:  SITE_URL + '/',
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'usd' },
          display_name: 'Free Shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 5 },
            maximum: { unit: 'business_day', value: 10 },
          },
        },
      }],
      allow_promotion_codes: true,
    });

    return respond(200, { url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message, err.type, err.code, err.param);
    return respond(500, { error: err.message });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
