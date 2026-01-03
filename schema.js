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
  type Order {
    id: ID!
    totalAmount: Float!
    status: String!
    createdAt: String!
    items: [OrderItem!]!
  }

  type OrderItem {
    id: ID!
    quantity: Int!
    priceAtPurchase: Float!
    product: Product!
  }
  type Cart {
    id: ID!
    items: [CartItem!]!
    totalItems: Int!
    totalPrice: Float!
  }

  type CartItem {
    id: ID!
    product: Product!
    quantity: Int!
    subtotal: Float!
  }
  type Product {
    id: ID!
    name: String!
    price: Float!
    description: String
    finalPrice: Float!
    discountPercent: Int
    image: String
    reviews: [Review!]!
    quantity: Int
  }

  type Query {
    products: [Product!]!
    product(id: ID!): Product
    myCart: Cart!
    myOrders: [Order!]!
  }

  type Mutation {
    addReview(productId: ID!, rating: Int!, comment: String): Review!
    addToCart(productId: ID!, quantity: Int!): Cart!

    updateCartItem(productId: ID!, quantity: Int!): Cart!

    removeFromCart(productId: ID!): Cart!

    clearCart: Cart!
    createPaymentIntent(amount: Int!): String!
  }
`;

module.exports = typeDefs;
