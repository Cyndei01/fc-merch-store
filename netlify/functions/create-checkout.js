const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const EMPLOYEE_COUPON_ID = 'FCTEAM50_EMPLOYEE';

async function getOrCreateEmployeeCoupon() {
  try {
    return await stripe.coupons.retrieve(EMPLOYEE_COUPON_ID);
  } catch {
    return await stripe.coupons.create({
      id: EMPLOYEE_COUPON_ID,
      name: 'Employee 50% Off',
      percent_off: 50,
      duration: 'forever',
    });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items, discountCode } = JSON.parse(event.body);

    if (!items || items.length === 0) {
      return respond(400, { error: 'Cart is empty' });
    }

    const line_items = items.map(item => {
      const nameParts = [item.name];
      if (item.color) nameParts.push(item.color);
      if (item.size)  nameParts.push(item.size);
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: nameParts.join(' · ') },
          unit_amount: Math.round(item.priceNum * 100),
        },
        quantity: item.qty,
      };
    });

    const siteUrl = (process.env.URL || 'https://merch.fcpackaginginc.com').replace(/\/$/, '');

    const sessionParams = {
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/`,
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
    };

    if (discountCode === 'FCTEAM50') {
      const coupon = await getOrCreateEmployeeCoupon();
      sessionParams.discounts = [{ coupon: coupon.id }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return respond(200, { url: session.url });
  } catch (err) {
    console.error('Stripe error:', JSON.stringify({ message: err.message, type: err.type, code: err.code }));
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
