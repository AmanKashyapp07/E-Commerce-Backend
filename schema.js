const { gql } = require("apollo-server");

const typeDefs = gql`
  type Product {
    id: ID!
    name: String!
    price: Int!
    description: String
    image: String
  }

  type Query {
    products: [Product!]!
    product(id: ID!): Product
  }
`;

module.exports = typeDefs;