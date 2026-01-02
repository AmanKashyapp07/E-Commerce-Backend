const pool = require("./db");

const resolvers = {
  Query: {
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

            COALESCE(cd.discount_percent, 0) AS discount_percent,
            p.price * (100 - COALESCE(cd.discount_percent, 0)) / 100.0 AS final_price,

            r.id AS review_id,
            r.rating,
            r.comment,
            r.user_uid,
            r.username,
            r.created_at
          FROM products p
          LEFT JOIN category_discounts cd
            ON cd.category_id = p.category_id
           AND cd.is_active = true
           AND (cd.starts_at IS NULL OR cd.starts_at <= NOW())
           AND (cd.ends_at IS NULL OR cd.ends_at >= NOW())
          LEFT JOIN reviews r
            ON r.product_id = p.id
          WHERE p.quantity > 0
          ORDER BY p.id ASC, r.created_at DESC
        `);

        const productsMap = {};

        rows.forEach(row => {
          const pId = String(row.product_id);

          if (!productsMap[pId]) {
            productsMap[pId] = {
              id: pId,
              name: row.name,
              price: parseInt(row.price),
              finalPrice: Number(row.final_price),
              discountPercent: row.discount_percent,
              image: row.image,
              quantity: row.quantity,
              description: row.description,
              reviews: []
            };
          }

          if (row.review_id) {
            productsMap[pId].reviews.push({
              id: String(row.review_id),
              rating: row.rating,
              comment: row.comment,
              userUid: row.user_uid,
              username: row.username,
              createdAt: row.created_at.toISOString()
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
          `
          SELECT
            p.*,
            COALESCE(cd.discount_percent, 0) AS discount_percent,
            p.price * (100 - COALESCE(cd.discount_percent, 0)) / 100.0 AS final_price
          FROM products p
          LEFT JOIN category_discounts cd
            ON cd.category_id = p.category_id
           AND cd.is_active = true
           AND (cd.starts_at IS NULL OR cd.starts_at <= NOW())
           AND (cd.ends_at IS NULL OR cd.ends_at >= NOW())
          WHERE p.id = $1
          `,
          [id]
        );

        if (!rows[0]) return null;

        const p = rows[0];
        return {
          id: String(p.id),
          name: p.name,
          price: p.price,
          finalPrice: Number(p.final_price),
          discountPercent: p.discount_percent,
          image: p.image,
          quantity: p.quantity,
          description: p.description,
          reviews: []
        };
      } catch {
        return null;
      }
    },

    myOrders: async (_, __, { user }) => {
      if (!user) throw new Error("Unauthorized");

      const ordersRes = await pool.query(
        "SELECT * FROM orders WHERE firebase_uid = $1 ORDER BY created_at DESC",
        [user.uid]
      );

      if (ordersRes.rows.length === 0) return [];

      const orders = ordersRes.rows.map(row => ({
        id: String(row.id),
        totalAmount: row.total_amount,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        items: []
      }));

      const orderIds = orders.map(o => o.id);

      const itemsRes = await pool.query(
        "SELECT * FROM order_items WHERE order_id = ANY($1::int[])",
        [orderIds]
      );

      itemsRes.rows.forEach(row => {
        const order = orders.find(o => o.id === String(row.order_id));
        if (order) {
          order.items.push({
            id: String(row.id),
            quantity: row.quantity,
            priceAtPurchase: row.price_at_purchase,
            productId: row.product_id
          });
        }
      });

      return orders;
    }
  },

  Mutation: {
    addReview: async (_, { productId, rating, comment }, { user }) => {
      if (!user) throw new Error("Unauthorized");

      const username = user.email?.split("@")[0] || "Aman";

      const { rows } = await pool.query(
        `
        INSERT INTO reviews (product_id, user_uid, username, rating, comment)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [productId, user.uid, username, rating, comment]
      );

      const r = rows[0];
      return {
        id: String(r.id),
        rating: r.rating,
        comment: r.comment,
        userUid: r.user_uid,
        username: r.username,
        createdAt: r.created_at.toISOString()
      };
    }
  },

  OrderItem: {
    product: async parent => {
      const { rows } = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [parent.productId]
      );
      if (!rows[0]) return null;

      const p = rows[0];
      return {
        id: String(p.id),
        name: p.name,
        price: p.price,
        image: p.image,
        description: p.description
      };
    }
  }
};

module.exports = resolvers;