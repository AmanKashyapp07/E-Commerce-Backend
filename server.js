// 1. IMPORT DEPENDENCIES
const { ApolloServer } = require("apollo-server");
const typeDefs = require("./schema");
const pool = require("./db");

// 2. DEFINE RESOLVERS (Postgres instead of mock array)
const resolvers = {
  Query: {
    products: async () => {
      const result = await pool.query(
        "SELECT id, name, price, description, image FROM products"
      );
      return result.rows;
    },

    product: async (_, { id }) => {
      const result = await pool.query(
        "SELECT id, name, price, description, image FROM products WHERE id = $1",
        [id]
      );
      return result.rows[0] || null;
    }
  }
};
////
// 3. CREATE SERVER
const server = new ApolloServer({
  typeDefs,
  resolvers,
  cors: {
    origin: "*", // ALLOW ALL ORIGINS (Easiest for development)
    credentials: true
  }
});

// 4. START SERVER
server.listen().then(({ url }) => {
  console.log(`🚀 GraphQL Server running at ${url}`);
});