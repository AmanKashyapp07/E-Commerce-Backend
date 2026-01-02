require("dotenv").config()
const express = require("express")
const { ApolloServer } = require("apollo-server-express")
const cors = require("cors")
const admin = require("firebase-admin")

const typeDefs = require("./schema")
const resolvers = require("./resolvers")
const cartResolvers = require("./cartResolvers")
const paymentResolvers = require("./paymentResolvers")
const paymentRoutes = require("./paymentRoutes")

const pool = require("./db")
const stripe = require("./stripe")

const serviceAccount = require("./firebase-admin.json")

// --------------------
// Firebase Init
// --------------------
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

// --------------------
// Express App
// --------------------
const app = express()

app.use(cors())
app.use(express.json())

// --------------------
// Firebase Auth Middleware
// --------------------
app.use(async (req, _, next) => {
  const auth = req.headers.authorization

  if (auth?.startsWith("Bearer ")) {
    try {
      const token = auth.split(" ")[1]
      req.user = await admin.auth().verifyIdToken(token)
    } catch {
      req.user = null
    }
  }
  next()
})

// --------------------
// REST PAYMENT ROUTES
// --------------------
app.use("/payments", paymentRoutes)

// --------------------
// Apollo Server
// --------------------
const server = new ApolloServer({
  typeDefs,
  resolvers: {
    // 1. Spread the main resolvers first. 
    // This ensures 'OrderItem' and any other Type resolvers (like Product) are included.
    ...resolvers,

    // 2. Then merge the Queries
    Query: {
      ...resolvers.Query,
      ...cartResolvers.Query,
    },

    // 3. Then merge the Mutations
    Mutation: {
      ...resolvers.Mutation,
      ...cartResolvers.Mutation,
      ...paymentResolvers.Mutation,
    },
  },
  context: ({ req }) => ({
    user: req.user,
    pool,
    stripe,
  }),
})
async function startServer() {
  await server.start()
  server.applyMiddleware({ app, path: "/graphql" })

  app.listen(4000, () => {
    console.log("🚀 Server running at http://localhost:4000")
    console.log("📦 GraphQL → http://localhost:4000/graphql")
    console.log("💳 Payments → http://localhost:4000/payments/create-payment-intent")
  })
}
//this is aman kashyap
startServer()