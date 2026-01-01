const { Pool } = require("pg")

const pool = new Pool({
  user: "amankashyap",
  host: "localhost",
  database: "ecommerce_db",
  password: "",
  port: 5432
})

async function testDbConnection() {
  try {
    await pool.query("SELECT 1")
    console.log("PostgreSQL connected successfully")
  } catch (err) {
    console.error("PostgreSQL connection failed")
    console.error(err)
  }
}

testDbConnection()

module.exports = pool