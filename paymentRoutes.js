const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const stripe = require("./stripe"); // Your stripe initialization file
const pool = require("./db"); // Your database connection

// --- 1. CREATE PAYMENT INTENT (Existing) ---
router.post("/create-payment-intent", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const token = auth.split(" ")[1];
    const user = await admin.auth().verifyIdToken(token);

    // Get user's cart
    const cartRes = await pool.query(
      "SELECT id FROM carts WHERE firebase_uid = $1",
      [user.uid]
    );

    if (cartRes.rows.length === 0) {
      return res.status(400).json({ message: "Cart not found" });
    }
    const cartId = cartRes.rows[0].id;

    // Get Items
    const itemsRes = await pool.query(
      `SELECT ci.quantity, p.price
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = $1`,
      [cartId]
    );

    if (itemsRes.rows.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Calculate Total
    let totalAmount = 0;
    for (const item of itemsRes.rows) {
      totalAmount += item.price * item.quantity;
    }

    if (totalAmount < 50) {
      return res.status(400).json({ message: "Minimum order value is ₹50" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Rupees -> Paise
      currency: "inr",
      metadata: { userId: user.uid, cartId: cartId } // Store useful info
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// --- 2. NEW: CHECKOUT SUCCESS (Fixes Cart & Inventory) ---
router.post("/checkout-success", async (req, res) => {
  const client = await pool.connect(); // Use a client for transactions
  try {
    // A. Verify User
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const token = auth.split(" ")[1];
    const user = await admin.auth().verifyIdToken(token);
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ message: "Missing Payment ID" });
    }

    // B. Verify Payment Status with Stripe (Security Check)
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    // C. Start Database Transaction
    await client.query('BEGIN');

    // 1. Get Cart ID
    const cartRes = await client.query(
      "SELECT id FROM carts WHERE firebase_uid = $1", 
      [user.uid]
    );
    const cartId = cartRes.rows[0]?.id;

    if (cartId) {
      // 2. Get items to reduce inventory
      const itemsRes = await client.query(
        "SELECT product_id, quantity FROM cart_items WHERE cart_id = $1", 
        [cartId]
      );

      // 3. Loop through items and decrement stock
      for (const item of itemsRes.rows) {
        await client.query(
          "UPDATE products SET quantity = quantity - $1 WHERE id = $2",
          [item.quantity, item.product_id]
        );
      }

      // 4. Clear the Cart
      await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
    }

    // D. Commit Transaction (Save Changes)
    await client.query('COMMIT');
    
    res.json({ success: true, message: "Order finalized" });

  } catch (err) {
    await client.query('ROLLBACK'); // Undo changes if error occurs
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;