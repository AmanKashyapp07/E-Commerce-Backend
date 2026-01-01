// 1. IMPORT DEPENDENCIES
const { ApolloServer } = require("apollo-server");
const admin = require("firebase-admin"); // <--- CHANGED: Use Firebase Admin
const typeDefs = require("./schema");
const pool = require("./db");
const resolvers = require('./resolvers.js')
const cartResolvers = require('./cartResolvers.js')
// 2. INITIALIZE FIREBASE ADMIN
// Make sure you have 'serviceAccountKey.json' in your root folder
const serviceAccount = require("./firebase-admin.json");
function getUsernameFromEmail(email) {
  return email.split("@")[0].split(".")[0]
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



// 4. CREATE SERVER
const server = new ApolloServer({
  typeDefs,
  resolvers: { ...resolvers, ...cartResolvers },
  
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