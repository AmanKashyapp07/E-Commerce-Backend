// 1. IMPORT DEPENDENCIES
const { ApolloServer } = require("apollo-server");
const admin = require("firebase-admin"); // <--- CHANGED: Use Firebase Admin
const typeDefs = require("./schema");
const pool = require("./db");

// 2. INITIALIZE FIREBASE ADMIN
// Make sure you have 'serviceAccountKey.json' in your root folder
const serviceAccount = require("./firebase-admin.json");

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
      );

      return rows.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        userUid: r.user_uid,
        createdAt: r.created_at.toISOString()
      }));
    }
  },

  Mutation: {
    addReview: async (_, { productId, rating, comment }, context) => {
      // 1. Check if user exists in context
      if (!context.user) {
        throw new Error("Unauthorized");
      }

      // Firebase stores the user ID in the 'uid' field
      const userUid = context.user.uid;

      const { rows } = await pool.query(
        `
        INSERT INTO reviews (product_id, user_uid, rating, comment)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [productId, userUid, rating, comment]
      );

      const r = rows[0];

      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        userUid: r.user_uid,
        createdAt: r.created_at.toISOString()
      };
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