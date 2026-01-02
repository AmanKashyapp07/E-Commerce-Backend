module.exports = {
  Mutation: {
    createPaymentIntent: async (_, { amount }, { user, stripe }) => {
      if (!user) throw new Error("Unauthorized")

      const intent = await stripe.paymentIntents.create({
        amount,
        currency: "inr",
      })

      return intent.client_secret
    },
  },
}