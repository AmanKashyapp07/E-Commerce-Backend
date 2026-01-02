const { gql } = require("apollo-server");

const typeDefs = gql`
  type Review {
    id: ID!
    rating: Int!
    comment: String
    userUid: String!
    username: String! 
    createdAt: String
  }
  type Cart {
    id: ID!
    items: [CartItem!]!
    totalItems: Int!
    totalPrice: Int!
  }

  type CartItem {
    id: ID!
    product: Product!
    quantity: Int!
    subtotal: Int!
  }
  type Product {
    id: ID!
    name: String!
    price: Int!
    description: String
    image: String
    reviews: [Review!]!
    quantity: Int
  }

  type Query {
    products: [Product!]!
    product(id: ID!): Product
    myCart: Cart!
  }

  type Mutation {
    addReview(productId: ID!, rating: Int!, comment: String): Review!
    addToCart(productId: ID!, quantity: Int!): Cart!

    updateCartItem(productId: ID!, quantity: Int!): Cart!

    removeFromCart(productId: ID!): Cart!

    clearCart: Cart!
  }
`;

module.exports = typeDefs;
