"use strict";

const db = require("../db");
const { BadRequestError, NotFoundError } = require("../expressError");
const User = require("./userModel");
const ProductWon = require("./ProductWonModel");
const HighestBid = require("./HighestBidModel");
const Notification = require("./NotificationModel");


class Product {
  // Get all products
  static async getProducts(q) {
    let query = `SELECT products.id,
                        products.name,
                        products.category,
                        products.sub_category AS "subCategory",
                        products.description,
                        products.condition,
                        products.rating,
                        products.num_of_ratings AS "numOfRatings",
                        products.image_url AS "imageUrl",
                        products.market_price AS "marketPrice",
                        products.auction_end_dt AS "auctionEndDt",
                        products.bid_count AS "bidCount",
                        products.auction_ended AS "auctionEnded",
                        users.email AS "bidderEmail",
                        users.first_name AS "bidderFirstName",
                        users.last_name AS "bidderLastName",
                        users.username AS "bidderUsername",
                        highest_bids.bid_price AS "bidPrice"
                FROM products
                FULL OUTER JOIN highest_bids ON products.id = highest_bids.product_id
                FULL OUTER JOIN users ON highest_bids.user_email = users.email`;
    let whereExpressions = [];
    let queryValues = []; 
    let paginationQuery = " limit 24 OFFSET ";

    let { page, name, category, subCategory, description, condition, rating, numOfRatings, auctionEndDt, auctionEnded} = q;

    // Pagination
    let limit = 24
    let offset;
    // console.log("page from getProducts product model",page, "typeofpage", typeof(page))

    if (!page) {
      // console.log("PAGE IS UNDEFINED")
      offset = 0
    }
    else {
      let pageNum = parseInt(page)
      offset = (pageNum - 1) * limit
    }

    paginationQuery += offset


    // console.log("search categories to be used in SQL command","page", page,"name", name, 'category', category, 'subCategory', subCategory, 'description', description, 'condition', condition,'rating', rating, 'numOfRatings', numOfRatings, 'auctionEndDt', auctionEndDt)


    // For each possible search term, add to whereExpressions and queryValues so
    // we can generate the right SQL

    if (name !== undefined) {
      queryValues.push(`%${name}%`);
      whereExpressions.push(`name ILIKE $${queryValues.length}`);
    }

    if (category !== undefined) {
      queryValues.push(`%${category}%`);
      whereExpressions.push(`category ILIKE $${queryValues.length}`);
    }

    if (subCategory !== undefined) {
      queryValues.push(`%${subCategory}%`);
      whereExpressions.push(`sub_category ILIKE $${queryValues.length}`);
    }

    if (description !== undefined) {
      queryValues.push(description);
      whereExpressions.push(`description ILIKE $${queryValues.length}`);
    }

    if (condition !== undefined) {
      queryValues.push(condition);
      whereExpressions.push(`condition = $${queryValues.length}`);
    }

    if (rating !== undefined) {
      queryValues.push(rating);
      whereExpressions.push(`rating >= $${queryValues.length}`);
    }

    if (numOfRatings !== undefined) {
      queryValues.push(numOfRatings);
      whereExpressions.push(`num_of_ratings >= $${queryValues.length}`);
    }

    if (auctionEndDt !== undefined) {
      queryValues.push(auctionEndDt);
      whereExpressions.push(`auction_end_dt >= $${queryValues.length}`);
    }


    whereExpressions.push(`auction_ended = false`);

    query += " WHERE " + whereExpressions.join(" AND ");

    console.log("query", query)

    query += paginationQuery

    // console.log("query", query)
    // console.log("queryValues", queryValues)


    // Finalize query and return results

    const findAllRes = await db.query(query, queryValues);

    const currentDateTime = Date.parse(new Date());
    console.log("currentDateTime",currentDateTime)

    for ( const p of findAllRes.rows) {
      const endDt = new Date(p.auctionEndDt)
      console.log("Date.parse(endDt) - currentDateTime", (currentDateTime - Date.parse(endDt)))
      console.log("dateTime", endDt)
      if ((Date.parse(endDt) - currentDateTime) < 0){
          if(p.bidderEmail) {
            ProductWon.wonProduct(p.id, p.name, p.bidderEmail, p.bidPrice)
          } else {
            Product.auctionEnded(p.id)
          }
      } else {
        console.log("product still up for auction")
      }
    }



    console.log("endedAuctionProducts", endedAuctionProducts)
    
    // console.log("result from get products request", findAllRes.rows)
    return findAllRes.rows;
  }

  /** Given a product handle, return data about product.
   *
   * Returns { handle, name, description, numEmployees, logoUrl, jobs }
   *   where jobs is [{ id, title, salary, equity }, ...]
   *
   * Throws NotFoundError if not found.
   **/

  static async getProductAndBid(id) {
    const productRes = await db.query( 
    `SELECT products.id,
            products.name,
            products.category,
            products.sub_category AS "subCategory",
            products.description,
            products.condition,
            products.rating,
            products.num_of_ratings AS "numOfRatings",
            products.image_url AS "imageUrl",
            products.market_price AS "marketPrice",
            products.auction_end_dt AS "auctionEndDt",
            products.bid_count AS "bidCount",
            products.auction_ended AS "auctionEnded",
            highest_bids.user_email AS "bidderEmail",
            highest_bids.bid_price AS "currentBid",
            users.username AS "currentBidderUsername"
    FROM products
    FULL OUTER JOIN highest_bids ON products.id = highest_bids.product_id
    FULL OUTER JOIN users ON highest_bids.user_email = users.email
    WHERE id = $1`,
        [id]);

    // console.log("productRes from get() method", productRes.rows[0])
    if (!productRes) throw new NotFoundError(`No product found: ${id}`);
    
    const product = productRes.rows[0]

    const currentDateTime = Date.parse(new Date());
    const endDt = new Date(product.auctionEndDt)
    console.log("endDt", endDt)

    if ((Date.parse(endDt) - currentDateTime) < 0){
      // console.log("auction ended")
      // console.log("p",p)
      // console.log("p.email",p.email)

        if(product.bidderEmail) {
          Product.addProductWon(product.id, product.Name, product.bidderEmail, product.currentBid)
        } else {
          Product.auctionEnded(product.id)
        }
    } else {
      console.log("product still up for auction")
    }

    // const product = productRes.rows[0];
    return product;
  }

  // increase a users bid count2
  static async addToBidCount(productId) {
    const result = await db.query(`UPDATE products 
                      SET bid_count = bid_count + 1
                      WHERE id = $1`,[productId]);
    if (!result) throw new NotFoundError(
          `Bid not added to count: ${productId}`);
    // console.log("result from addtobidcount", result)
    return result;
  }

  static async addAuctionTime(productId, newDateTime) {
    const result = await db.query(`UPDATE products 
                      SET auction_end_dt = $1
                      WHERE id = $2`,[newDateTime, productId]);
    if (!result) throw new NotFoundError(
          `30 seconds not added to auction time: ${productId}`);
    // console.log("result from addAuctionTime", result)
    return result;
  }

// Update rating of product

  static async addRating(productId, newRating) {
    // Grab product's rating and number of ratings from database
    const product = await Product.get(productId)
    const rating = parseFloat(product["rating"])
    const numOfRatings = product["numOfRatings"]
    // Calculate the new total rating with the provided user's rating
    const newTotalRating = ((newRating + (rating * numOfRatings))/(numOfRatings+1));

    // Make SQL query to update rating
    const result = await db.query(
      `UPDATE products 
       SET num_of_ratings = num_of_ratings + 1, rating = ${newTotalRating}
       WHERE id = $1`,[productId]);
    if (!result) throw new NotFoundError(`No product: ${productId}`);
    // console.log("New Product Rating", result)
    return result;
  }

  // Change auction_ended column of a product to true

  static async auctionEnded(productId) {
    const auctionEndedResult = await db.query(
      `UPDATE products 
        SET auction_ended = true
        WHERE id = $1`,[productId]);

    if (!auctionEndedResult) throw new NotFoundError(`productauctionEnded boolean value unchanged ${auctionEndedResult}`);
    // console.log("productSold result", result)
    console.log("auctionEndedResult from addProductWon()", auctionEndedResult)
  }


}





module.exports = Product;
