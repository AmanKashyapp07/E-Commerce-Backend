const { gql } = require("apollo-server")

const typeDefs = gql`
  type Review {
    id: ID!
    rating: Int!
    comment: String
    userUid: String!
    username: String!        # 👈 NEW (readable name)
    createdAt: String!
  }

  type Product {
    id: ID!
    name: String!
    price: Int!
    description: String
    image: String
    reviews: [Review!]!
  }

  type Query {
    products: [Product!]!
    product(id: ID!): Product
  }

  type Mutation {
    addReview(
      productId: ID!
      rating: Int!
      comment: String
    ): Review!
  }
`

module.exports = typeDefs