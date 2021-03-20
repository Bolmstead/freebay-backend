"use strict";

const db = require("../db");
const bcrypt = require("bcrypt");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");
const Notification = require("./NotificationModel");
const { BCRYPT_WORK_FACTOR } = require("../config.js");

/** Related functions for users. */

class User {
  // authenticate user with username, password. Method is called when user logs in
  static async authenticate(email, password) {
    // find the user first
    const result = await db.query(
      `SELECT email,
              username,
              password,
              first_name AS "firstName",
              last_name AS "lastName",
              balance,
              last_login AS "lastLogin"
       FROM users
       WHERE email = $1`,
    [email],
    );
    const user = result.rows[0];
    
    if (user) {
      // compare hashed password to a new hash from password
      const isValid = await bcrypt.compare(password, user.password);
      if (isValid === true) {
        delete user.password;
        // Determine if user is eligible for the daily reward
        await User.dailyReward(user)
        return user;
      }
    }

    throw new UnauthorizedError("Invalid email/password");
  }

  // Register user with data.
  // Throws BadRequestError on duplicates.
  static async register({ email, username, password, firstName, lastName }) {
    const duplicateCheck = await db.query(
          `SELECT email
           FROM users
           WHERE email = $1`,
        [email],
    );

    if (duplicateCheck.rows[0]) {
      throw new BadRequestError(`Duplicate email: ${email}`);
    }

    // Let user start off with $100
    let balance = 100

    const hashedPassword = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);

    // Insert new user with hashed password
    const result = await db.query(
          `INSERT INTO users
           (email, username, password, first_name, last_name, balance)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING email, username, password, first_name AS firstName, last_name AS lastName, balance`,
        [
          email,
          username,
          hashedPassword,
          firstName,
          lastName,
          balance
        ],
    );

    if (!result) {
      throw new BadRequestError(`Unable to insert into users`);
    }
    const user = result.rows[0];

    // Add welcome notification
    Notification.addNotification(user.email, `Welcome to freeBay! As a gift, we've deposited $100 freeBay bucks into your account!`, "gift" )
    return user;
  }

  /** Given a username, return data about user.
   *
   * Throws NotFoundError if user not found.
   **/

  static async get(username) {
    const userRes = await db.query(
          `SELECT email,
                  username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  balance
           FROM users
           WHERE username = $1`,
        [username],
    );

    const user = userRes.rows[0];

    if (!user) throw new NotFoundError(`No user: ${username}`);
  
    // Grab all products a user has won ordered by most recent and add to user object
    const productsWonRes = await db.query(
          `SELECT products.id,
                  products.name,
                  products.category,
                  products.sub_category AS "subCategory",
                  products.description,
                  products.condition,
                  products.rating,
                  products.num_of_ratings AS "numOfRatings",
                  products.image_url AS "imageUrl",
                  products.starting_bid AS "startingBid",
                  products.auction_end_dt AS "auctionEndDt",
                  products.bid_count AS "bidCount",
                  products.auction_ended AS "auctionEnded",
                  products_won.bid_price AS "bidPrice",
                  products_won.datetime
          FROM products_won
          FULL OUTER JOIN products ON products_won.product_id = products.id
          WHERE products_won.user_email = $1
          ORDER BY products_won.datetime DESC`, [user.email]);

    user.products_won = productsWonRes.rows;

    // Grab all users highest bids ordered by most recent and add to user object
    const highestBidsRes = await db.query(
      `SELECT products.id,
              products.name,
              products.category,
              products.sub_category AS "subCategory",
              products.description,
              products.condition,
              products.rating,
              products.num_of_ratings AS "numOfRatings",
              products.image_url AS "imageUrl",
              products.starting_bid AS "startingBid",
              products.auction_end_dt AS "auctionEndDt",
              products.bid_count AS "bidCount",
              products.auction_ended AS "auctionEnded",
              highest_bids.bid_price AS "bidPrice",
              highest_bids.datetime
          FROM highest_bids
          FULL OUTER JOIN products ON highest_bids.product_id = products.id
          WHERE highest_bids.user_email = $1
          ORDER BY highest_bids.datetime DESC`, [user.email]);

    user.highest_bids = highestBidsRes.rows;

    // Grab all user's notifications ordered by most recent and add to user object
    const notificationsRes = await db.query(
      `SELECT notifications.id,
              notifications.text,
              notifications.related_product_id AS "relatedProductId",
              notifications.was_viewed AS "wasViewed",
              notifications.datetime,
              notifications.category AS "category"
        FROM notifications
        WHERE notifications.user_email = $1
        ORDER BY notifications.datetime DESC`, [user.email]);

    user.notifications = notificationsRes.rows;

    return user;
  }

  // Decrease a user's freeBay bucks balance with amount passed in
  static async decreaseBalance(amount, email) {
    const result = await db.query(`UPDATE users 
                      SET balance = balance - $1
                      WHERE email = $2`,[amount, email]);
    if (!result) throw new BadRequestError(`Balance not lowered by ${amount} for user:  ${email}`);
  }

  // Increase a user's freeBay bucks balance with amount passed in
  static async increaseBalance(amount, email) {
    const result = await db.query(`UPDATE users 
                      SET balance = balance + $1
                      WHERE email = $2`,[amount, email]);
    if (!result) throw new BadRequestError(`Balance not increased by ${amount} for user:  ${email}`);

    return result;
  }

  // Update a users last login with current datetime timestamp
  static async updateLastLogin(email) {
    const result = await db.query(`UPDATE users 
                      SET last_login = CURRENT_TIMESTAMP
                      WHERE email = $1
                      RETURNING last_login AS "lastLogin"`,[email]);
    if (!result) throw new BadRequestError(`Unable to update the last login for user: ${email}`);

    return result;
  }

  // Daily $100 freebay bucks award to give to user when they login on a new day.
  static async dailyReward(user) {
    // Grab the last login and current login datetime objects
    let lastLogin = user.lastLogin
    let updateLastLoginResult = await User.updateLastLogin(user.email)
    let currentLogin = updateLastLoginResult.rows[0].lastLogin

    console.log("lastLogin", lastLogin.getDate())
    console.log("currentLogin", currentLogin.getDate())

    console.log("lastLogin", lastLogin.getMonth())
    console.log("currentLogin", currentLogin.getMonth())

    console.log("lastLogin", lastLogin.getFullYear())
    console.log("currentLogin", currentLogin.getFullYear())

    // Function that returns a boolean to determine if the previous login datetime 
    // is on a different day than the new login datetime. If datetimes are 
    // on same day, return true. If not, return false
    function datesAreOnSameDay (oldLogin, newLogin) {
      if (oldLogin.getFullYear() === newLogin.getFullYear() && 
          oldLogin.getMonth() === newLogin.getMonth() &&
          oldLogin.getDate() === newLogin.getDate()) 
          { 
        return true
      } else {
       return false
      }
    }
 
    const loggedInOnSameDay = datesAreOnSameDay(lastLogin, currentLogin)
    if (!loggedInOnSameDay) {
      await User.increaseBalance(100,user.email);
      await Notification.addNotification(user.email,"Welcome back! Here's your daily $100 freeBay bucks","gift")
    }

  }
  


}


module.exports = User;
