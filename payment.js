const express = require("express")
const stripe = require("./stripe")
const pool = require("./db")
const router = express.Router()

// helper: build cart (reuse your existing logic)
async function getCartForUser(firebaseUid) {
  const cartRes = await pool.query(
    "SELECT id FROM carts WHERE firebase_uid = $1",
    [firebaseUid]
  )

  if (cartRes.rows.length === 0) {
    throw new Error("Cart not found")
  }

  const cartId = cartRes.rows[0].id

  const { rows } = await pool.query(
    `
    SELECT
      ci.product_id,
      ci.quantity,
      p.price
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = $1
    `,
    [cartId]
  )

  return rows
}

router.post("/create-payment-intent", async (req, res) => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    // 1️⃣ Fetch cart
    const cartItems = await getCartForUser(user.uid)

    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" })
    }

    // 2️⃣ Calculate total (authoritative)
    let totalAmount = 0
    cartItems.forEach(item => {
      totalAmount += item.price * item.quantity
    })

    if (totalAmount < 50) {
      return res.status(400).json({ error: "Minimum order value is ₹50" })
    }

    // 3️⃣ Create pending order
    const orderRes = await pool.query(
      `
      INSERT INTO orders (firebase_uid, total_amount, status)
      VALUES ($1, $2, 'pending')
      RETURNING id
      `,
      [user.uid, totalAmount]
    )

    const orderId = orderRes.rows[0].id

    // 4️⃣ Save order items
    for (const item of cartItems) {
      await pool.query(
        `
        INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
        VALUES ($1, $2, $3, $4)
        `,
        [orderId, item.product_id, item.quantity, item.price]
      )
    }

    // 5️⃣ Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount * 100, // rupees → paise
      currency: "inr",
      metadata: {
        orderId: orderId.toString()
      }
    })

    // 6️⃣ Store payment intent ID
    await pool.query(
      `
      UPDATE orders
      SET stripe_payment_intent_id = $1
      WHERE id = $2
      `,
      [paymentIntent.id, orderId]
    )

    // 7️⃣ Send client secret
    res.json({
      clientSecret: paymentIntent.client_secret
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Payment initialization failed" })
  }
})

module.exports = router