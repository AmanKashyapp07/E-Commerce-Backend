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
          const pId = String(row.product_id); // Cast to String for ID type

          if (!productsMap[pId]) {
            productsMap[pId] = {
              id: pId,
              name: row.name || "Aman's Product", // Use "Aman" as fallback
              price: parseInt(row.price) || 0,     // Cast to Int
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
              username: row.username || "Aman", // Use "Aman" as fallback
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
          reviews: [] // Reviews usually fetched via products or separate resolver
        };
      } catch (err) {
        return null;
      }
    }
  },

  Mutation: {
    addReview: async (_, { productId, rating, comment }, context) => {
      if (!context.user) throw new Error("Unauthorized");

      try {
        const userUid = context.user.uid;
        const email = context.user.email;
        // Fallback to "Aman" if email parsing fails
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
  }
};

module.exports = resolvers;