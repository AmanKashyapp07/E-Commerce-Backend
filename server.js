// 1. IMPORT DEPENDENCIES
const { ApolloServer } = require("apollo-server");
const admin = require("firebase-admin"); // <--- CHANGED: Use Firebase Admin
const typeDefs = require("./schema");
const pool = require("./db");

// 2. INITIALIZE FIREBASE ADMIN
// Make sure you have 'serviceAccountKey.json' in your root folder
const serviceAccount = require("./firebase-admin.json");
function getUsernameFromEmail(email) {
  return email.split("@")[0].split(".")[0]
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 3. DEFINE RESOLVERS
const resolvers = {
  Query: {
    products: async () => {
      const { rows } = await pool.query("SELECT * FROM products");
      return rows;
    },

    product: async (_, { id }) => {
      const { rows } = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [id]
      );
      return rows[0] || null;
    }
  },

  Product: {
  reviews: async (product) => {
    const { rows } = await pool.query(
      "SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC",
      [product.id]
    )

    return rows.map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      userUid: r.user_uid,
      username: r.username,               // 👈 NEW
      createdAt: r.created_at.toISOString()
    }))
  }
},

  Mutation: {
    addReview: async (_, { productId, rating, comment }, context) => {
  if (!context.user) {
    throw new Error("Unauthorized")
  }

  const userUid = context.user.uid
  const email = context.user.email
  const username = getUsernameFromEmail(email)

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
    username: r.username,                 // 👈 NEW
    createdAt: r.created_at.toISOString()
  }
}

  }
};

// 4. CREATE SERVER
const server = new ApolloServer({
  typeDefs,
  resolvers,
  
  // vvvvv FIREBASE CONTEXT LOGIC vvvvv
  context: async ({ req }) => {
    const authHeader = req.headers.authorization || "";
    
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        // Verify the ID token using Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Return the decoded user object (contains .uid, .email, etc.)
        return { user: decodedToken };
      } catch (err) {
        console.warn("Firebase Auth Error:", err.message);
      }
    }
    // Return empty context if auth fails
    return {};
  },
  // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  cors: {
    origin: "*", 
    credentials: true
  }
});

// 5. START SERVER
server.listen().then(({ url }) => {
  console.log(`🚀 GraphQL Server running at ${url}`);
});