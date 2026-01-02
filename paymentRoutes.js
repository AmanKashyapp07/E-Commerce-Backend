const express = require("express")
const router = express.Router()
const admin = require("firebase-admin")
const stripe = require("./stripe")
const pool = require("./db")

router.post("/create-payment-intent", async (req, res) => {
  try {
    const auth = req.headers.authorization

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const token = auth.split(" ")[1]
    const user = await admin.auth().verifyIdToken(token)

    // 1️⃣ Get user's cart
    const cartRes = await pool.query(
      "SELECT id FROM carts WHERE firebase_uid = $1",
      [user.uid]
    )

    if (cartRes.rows.length === 0) {
      return res.status(400).json({ message: "Cart not found" })
    }

    const cartId = cartRes.rows[0].id

    // 2️⃣ Get cart items + prices
    const itemsRes = await pool.query(
      `
      SELECT ci.quantity, p.price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = $1
      `,
      [cartId]
    )

    if (itemsRes.rows.length === 0) {
      return res.status(400).json({ message: "Cart is empty" })
    }

    // 3️⃣ Calculate total (IN RUPEES)
    let totalAmount = 0
    for (const item of itemsRes.rows) {
      totalAmount += item.price * item.quantity
    }

    console.log("CART TOTAL (rupees):", totalAmount)

    // 4️⃣ Enforce Stripe minimum
    if (totalAmount < 50) {
      return res.status(400).json({ message: "Minimum order value is ₹50" })
    }

    // 5️⃣ Create Stripe PaymentIntent (PAISE)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount * 100, // rupees → paise
      currency: "inr",
    })

    res.json({
      clientSecret: paymentIntent.client_secret,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

module.exports = router