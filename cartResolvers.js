const pool = require("./db");

async function getOrCreateCart(firebaseUid) {
  const { rows } = await pool.query(
    "SELECT * FROM carts WHERE firebase_uid = $1",
    [firebaseUid]
  );
  if (rows.length) return rows[0];

  const { rows: newRows } = await pool.query(
    "INSERT INTO carts (firebase_uid) VALUES ($1) RETURNING *",
    [firebaseUid]
  );
  return newRows[0];
}
async function getProductStock(productId) {
  const { rows } = await pool.query(
    "SELECT quantity FROM products WHERE id = $1",
    [productId]
  );
  if (!rows[0]) throw new Error("Product not found");
  return parseInt(rows[0].quantity) || 0;
}
async function buildCartResponse(cartId) {
  const { rows } = await pool.query(
    `SELECT ci.id AS cart_item_id, ci.quantity, p.id AS product_id, p.name, p.price, p.image
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = $1`,
    [cartId]
  );

  let totalItems = 0;
  let totalPrice = 0;

  const items = rows.map((row) => {
    const qty = parseInt(row.quantity) || 0;
    const prc = parseInt(row.price) || 0;
    const sub = qty * prc;

    totalItems += qty;
    totalPrice += sub;

    return {
      id: String(row.cart_item_id),
      quantity: qty,
      subtotal: sub,
      product: {
        id: String(row.product_id),
        name: row.name || "Aman's Product",
        price: prc,
        image: row.image || "",
      },
    };
  });

  return {
    id: String(cartId),
    items,
    totalItems,
    totalPrice,
  };
}

const cartResolvers = {
  Query: {
    myCart: async (_, __, { user }) => {
      if (!user) throw new Error("Unauthorized");
      const cart = await getOrCreateCart(user.uid);
      return buildCartResponse(cart.id);
    },
  },

  Mutation: {
    addToCart: async (_, { productId, quantity }, { user }) => {
      if (!user) throw new Error("Unauthorized");
      const cart = await getOrCreateCart(user.uid);
      await pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id)
         DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
        [cart.id, productId, quantity]
      );
      return buildCartResponse(cart.id);
    },

    updateCartItem: async (_, { productId, quantity }, { user }) => {
      if (!user) throw new Error("Unauthorized");

      const cart = await getOrCreateCart(user.uid);
      const stock = await getProductStock(productId);

      if (quantity > stock) {
        throw new Error(`Only ${stock} items available`);
      }

      if (quantity <= 0) {
        await pool.query(
          "DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2",
          [cart.id, productId]
        );
      } else {
        await pool.query(
          "UPDATE cart_items SET quantity = $3 WHERE cart_id = $1 AND product_id = $2",
          [cart.id, productId, quantity]
        );
      }

      return buildCartResponse(cart.id);
    },

    removeFromCart: async (_, { productId }, { user }) => {
      if (!user) throw new Error("Unauthorized");
      const cart = await getOrCreateCart(user.uid);
      await pool.query(
        "DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2",
        [cart.id, productId]
      );
      return buildCartResponse(cart.id);
    },

    clearCart: async (_, __, { user }) => {
      if (!user) throw new Error("Unauthorized");
      const cart = await getOrCreateCart(user.uid);
      await pool.query("DELETE FROM cart_items WHERE cart_id = $1", [cart.id]);
      return buildCartResponse(cart.id);
    },
  },
};

module.exports = cartResolvers;
