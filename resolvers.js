const pool = require("./db");

const resolvers = {
  Query: {
    // ---------------------------------------------------------
    // EXISTING OPTIMIZED QUERY (Do not touch)
    // ---------------------------------------------------------
    products: async () => {
      try {
        const { rows } = await pool.query(`
          SELECT
            p.id AS product_id,
            p.name,
            p.price,
            p.image,
            p.quantity,
            p.description,
            r.id AS review_id,
            r.rating,
            r.comment,
            r.user_uid,
            r.username,
            r.created_at
          FROM products p
          LEFT JOIN reviews r ON r.product_id = p.id
          WHERE p.quantity > 0
          ORDER BY p.id ASC, r.created_at DESC
        `);

        const productsMap = {};

        rows.forEach((row) => {
          const pId = String(row.product_id);

          if (!productsMap[pId]) {
            productsMap[pId] = {
              id: pId,
              name: row.name || "Aman's Product", 
              price: parseInt(row.price) || 0,    
              image: row.image || "",
              quantity: row.quantity || 0,
              description: row.description || "",
              reviews: []
            };
          }

          if (row.review_id) {
            productsMap[pId].reviews.push({
              id: String(row.review_id),
              rating: parseInt(row.rating) || 0,
              comment: row.comment || "",
              userUid: row.user_uid || "aman_uid",
              username: row.username || "Aman", 
              createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString()
            });
          }
        });

        return Object.values(productsMap);
      } catch (err) {
        console.error("Error in products query:", err);
        return []; 
      }
    },

    product: async (_, { id }) => {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM products WHERE id = $1",
          [id]
        );
        if (!rows[0]) return null;

        const p = rows[0];
        return {
          id: String(p.id),
          name: p.name || "Aman's Product",
          price: parseInt(p.price) || 0,
          image: p.image || "",
          quantity: p.quantity || 0,
          description: p.description || "",
          reviews: [] 
        };
      } catch (err) {
        return null;
      }
    },
    ///

    // ---------------------------------------------------------
    // NEW: FETCH USER ORDERS (Fixed & Optimized)
    // ---------------------------------------------------------
    myOrders: async (_, __, { user }) => {
      if (!user) throw new Error("Unauthorized");
      
      try {
        // 1. Fetch Orders
        const ordersRes = await pool.query(
          "SELECT * FROM orders WHERE firebase_uid = $1 ORDER BY created_at DESC",
          [user.uid]
        );

        if (ordersRes.rows.length === 0) return [];

        const orders = ordersRes.rows.map(row => ({
          id: String(row.id),
          totalAmount: parseInt(row.total_amount),
          status: row.status,
          createdAt: row.created_at.toISOString(),
          items: [] // Initialize empty array
        }));

        // 2. Fetch ALL Items for these orders in one go (Optimization)
        const orderIds = orders.map(o => o.id);
        const itemsRes = await pool.query(
          `SELECT * FROM order_items WHERE order_id = ANY($1::int[])`,
          [orderIds]
        );

        // 3. Map items back to their specific order
        itemsRes.rows.forEach(row => {
          const order = orders.find(o => o.id === String(row.order_id));
          if (order) {
            order.items.push({
              id: String(row.id),
              quantity: row.quantity,
              priceAtPurchase: parseInt(row.price_at_purchase),
              productId: row.product_id, // For the Product resolver below
            });
          }
        });

        return orders;
      } catch (err) {
        console.error("Error fetching orders:", err);
        throw new Error("Failed to fetch orders");
      }
    }
  },

  Mutation: {
    addReview: async (_, { productId, rating, comment }, context) => {
      if (!context.user) throw new Error("Unauthorized");

      try {
        const userUid = context.user.uid;
        const email = context.user.email;
        const username = email ? email.split("@")[0] : "Aman";

        const { rows } = await pool.query(
          `INSERT INTO reviews (product_id, user_uid, username, rating, comment)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [productId, userUid, username, rating, comment]
        );

        const r = rows[0];
        return {
          id: String(r.id),
          rating: parseInt(r.rating) || 0,
          comment: r.comment || "",
          userUid: r.user_uid || userUid,
          username: r.username || "Aman",
          createdAt: r.created_at ? r.created_at.toISOString() : new Date().toISOString()
        };
      } catch (err) {
        throw new Error("Failed to add review: " + err.message);
      }
    }
  },

  // ---------------------------------------------------------
  // FIELD RESOLVERS
  // ---------------------------------------------------------
  // NOTE: Order resolver is removed because we fetch items in 'myOrders' now.
  // We still need OrderItem to fetch the product details.
  
  OrderItem: {
    product: async (parent) => {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM products WHERE id = $1",
          [parent.productId]
        );
        if (!rows[0]) return null;

        const p = rows[0];
        return {
          id: String(p.id),
          name: p.name,
          price: parseInt(p.price),
          image: p.image,
          description: p.description
        };
      } catch (err) {
        console.error("Error fetching product for order item:", err);
        return null;
      }
    }
  }
};

module.exports = resolvers;