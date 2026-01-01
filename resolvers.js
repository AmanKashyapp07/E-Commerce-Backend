const pool = require("./db");

const resolvers = {
  Query: {
    products: async () => {
      const { rows } = await pool.query(`
        SELECT
          p.id            AS product_id,
          p.name,
          p.price,
          p.image,
          p.description,
          r.id            AS review_id,
          r.rating,
          r.comment,
          r.user_uid,
          r.username,
          r.created_at
        FROM products p
        LEFT JOIN reviews r ON r.product_id = p.id
        ORDER BY p.id, r.created_at DESC
      `)

      // GROUPING LOGIC (flat → nested)
      const productsMap = {}

      for (const row of rows) {
        // Create product once
        if (!productsMap[row.product_id]) {
          productsMap[row.product_id] = {
            id: row.product_id,
            name: row.name,
            price: row.price,
            image: row.image,
            description: row.description,
            reviews: []
          }
        }

        // Push review if exists
        if (row.review_id) {
          productsMap[row.product_id].reviews.push({
            id: row.review_id,
            rating: row.rating,
            comment: row.comment,
            userUid: row.user_uid,
            username: row.username,
            createdAt: row.created_at.toISOString()
          })
        }
      }

      // Convert map → array
      return Object.values(productsMap)
    },

    product: async (_, { id }) => {
      const { rows } = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [id]
      )
      return rows[0] || null
    }
  },

  Mutation: {
    addReview: async (_, { productId, rating, comment }, context) => {
      if (!context.user) {
        throw new Error("Unauthorized")
      }

      const userUid = context.user.uid
      const email = context.user.email
      const username = email.split("@")[0].split(".")[0]

      const { rows } = await pool.query(
        `
        INSERT INTO reviews (product_id, user_uid, username, rating, comment)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [productId, userUid, username, rating, comment]
      )

      const r = rows[0]

      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        userUid: r.user_uid,
        username: r.username,
        createdAt: r.created_at.toISOString()
      }
    }
  }
}

module.exports = resolvers;