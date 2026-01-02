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
// --- 2. NEW: CHECKOUT SUCCESS (Creates Order, Fixes Inventory, Clears Cart) ---
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

    // B. Verify Payment Status with Stripe
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
      // 2. Get items and current prices
      // We need the price to save it into 'order_items' history
      const itemsRes = await client.query(
        `SELECT ci.product_id, ci.quantity, p.price 
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.id
         WHERE ci.cart_id = $1`, 
        [cartId]
      );

      if (itemsRes.rows.length > 0) {
        // 3. Calculate Total Order Amount
        let totalAmount = 0;
        for (const item of itemsRes.rows) {
          totalAmount += item.price * item.quantity;
        }

        // 4. Create the Order Record
        const insertOrderQuery = `
          INSERT INTO orders (firebase_uid, total_amount, status, stripe_payment_intent_id)
          VALUES ($1, $2, 'paid', $3)
          RETURNING id
        `;
        const orderResult = await client.query(insertOrderQuery, [
          user.uid, 
          totalAmount, 
          paymentIntentId
        ]);
        const newOrderId = orderResult.rows[0].id;

        // 5. Loop items to: Save Order Items AND Decrement Stock
        for (const item of itemsRes.rows) {
          // a. Insert into order_items
          await client.query(
            `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
             VALUES ($1, $2, $3, $4)`,
            [newOrderId, item.product_id, item.quantity, item.price]
          );

          // b. Decrement Stock
          await client.query(
            "UPDATE products SET quantity = quantity - $1 WHERE id = $2",
            [item.quantity, item.product_id]
          );
        }

        // 6. Clear the Cart
        await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
      }
    }

    // D. Commit Transaction (Save Changes)
    await client.query('COMMIT');
    
    res.json({ success: true, message: "Order finalized and saved" });

  } catch (err) {
    await client.query('ROLLBACK'); // Undo changes if error occurs
    console.error("Checkout Error:", err);
    
    // Check for unique violation (if webhook ran first)
    if (err.code === '23505') { // Postgres unique_violation code
        return res.json({ success: true, message: "Order already processed" });
    }

    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;