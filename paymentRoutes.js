const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const stripe = require("./stripe");
const pool = require("./db");

// -----------------------------------------------------
// 1. CREATE PAYMENT INTENT (USES FINAL PRICE)
// -----------------------------------------------------
router.post("/create-payment-intent", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = auth.split(" ")[1];
    const user = await admin.auth().verifyIdToken(token);

    const cartRes = await pool.query(
      "SELECT id FROM carts WHERE firebase_uid = $1",
      [user.uid]
    );

    if (!cartRes.rows.length) {
      return res.status(400).json({ message: "Cart not found" });
    }

    const cartId = cartRes.rows[0].id;

    const itemsRes = await pool.query(
      `
      SELECT
        ci.quantity,
        p.price * (100 - COALESCE(cd.discount_percent, 0)) / 100.0 AS final_price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN category_discounts cd
        ON cd.category_id = p.category_id
       AND cd.is_active = true
       AND (cd.starts_at IS NULL OR cd.starts_at <= NOW())
       AND (cd.ends_at IS NULL OR cd.ends_at >= NOW())
      WHERE ci.cart_id = $1
      `,
      [cartId]
    );

    if (!itemsRes.rows.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let totalAmount = 0;
    for (const item of itemsRes.rows) {
      totalAmount += Number(item.final_price) * item.quantity;
    }

    if (totalAmount < 50) {
      return res.status(400).json({ message: "Minimum order value is ₹50" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: "inr",
      metadata: {
        userId: user.uid,
        cartId
      }
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Payment Intent Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------
// 2. CHECKOUT SUCCESS (LOCKS FINAL PRICE)
// -----------------------------------------------------
router.post("/checkout-success", async (req, res) => {
  const client = await pool.connect();

  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = auth.split(" ")[1];
    const user = await admin.auth().verifyIdToken(token);
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ message: "Missing Payment ID" });
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    await client.query("BEGIN");

    const cartRes = await client.query(
      "SELECT id FROM carts WHERE firebase_uid = $1",
      [user.uid]
    );

    const cartId = cartRes.rows[0]?.id;
    if (!cartId) {
      await client.query("COMMIT");
      return res.json({ success: true });
    }

    const itemsRes = await client.query(
      `
      SELECT
        ci.product_id,
        ci.quantity,
        p.price * (100 - COALESCE(cd.discount_percent, 0)) / 100.0 AS final_price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN category_discounts cd
        ON cd.category_id = p.category_id
       AND cd.is_active = true
       AND (cd.starts_at IS NULL OR cd.starts_at <= NOW())
       AND (cd.ends_at IS NULL OR cd.ends_at >= NOW())
      WHERE ci.cart_id = $1
      `,
      [cartId]
    );

    if (!itemsRes.rows.length) {
      await client.query("COMMIT");
      return res.json({ success: true });
    }

    let totalAmount = 0;
    for (const item of itemsRes.rows) {
      totalAmount += Number(item.final_price) * item.quantity;
    }

    const orderRes = await client.query(
      `
      INSERT INTO orders (firebase_uid, total_amount, status, stripe_payment_intent_id)
      VALUES ($1, $2, 'paid', $3)
      RETURNING id
      `,
      [user.uid, totalAmount, paymentIntentId]
    );

    const orderId = orderRes.rows[0].id;

    for (const item of itemsRes.rows) {
      await client.query(
        `
        INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
        VALUES ($1, $2, $3, $4)
        `,
        [
          orderId,
          item.product_id,
          item.quantity,
          Number(item.final_price)
        ]
      );

      await client.query(
        "UPDATE products SET quantity = quantity - $1 WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      "DELETE FROM cart_items WHERE cart_id = $1",
      [cartId]
    );

    await client.query("COMMIT");

    res.json({ success: true, message: "Order placed successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Checkout Error:", err);

    if (err.code === "23505") {
      return res.json({ success: true });
    }

    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;