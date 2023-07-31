const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server running...");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

const arrayToObj = (dbObj) => {
  return {
    likes: dbObj,
  };
};
const objToArray = (dbObj) => {
  return {
    replies: dbObj,
  };
};

const logger = (request, response, next) => {
  next();
};

const authenticateAPI = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

initializeDBAndServer();
//REGISTER API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = "${username}";`;
  const getUser = await db.get(getUserQuery);
  if (getUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO
            user (username, password, name, gender)
            VALUES('${username}', "${hashedPassword}", "${name}", "${gender}");`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});
// LOGIN API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isValidUserQuery = `SELECT * FROM user WHERE username = "${username}";`;
  const dbUser = await db.get(isValidUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isCorrectPassword = await bcrypt.compare(password, dbUser.password);
    if (isCorrectPassword) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateAPI, async (request, response) => {
  const { username } = request;
  const userQuery = `SELECT user_id from user where username = '${username}';`;
  const dbUser = await db.get(userQuery);
  const userId = dbUser.user_id;

  const Query = `SELECT 
    user.username, tweet.tweet, tweet.date_time AS dateTime
  FROM
    follower
  INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
  INNER JOIN user
    ON tweet.user_id = user.user_id
  WHERE 
    follower.follower_user_id = ${userId}
  ORDER BY 
    tweet.date_time DESC
  LIMIT 4;`;
  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API 4

app.get("/user/following/", authenticateAPI, async (request, response) => {
  const { username } = request;
  const Query = `SELECT name from user where user_id in (SELECT follower.following_user_id from follower INNER join user on user.user_id = follower.follower_user_id WHERE user.username = "${username}");`;
  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API 5

app.get("/user/followers/", authenticateAPI, async (request, response) => {
  const { username } = request;
  const Query = `SELECT name from user where user_id in (SELECT follower.follower_user_id from follower INNER join user on user.user_id = follower.following_user_id WHERE user.username = "${username}");`;
  const dbResponse = await db.all(Query);
  response.send(dbResponse);
});

//API 6

app.get("/tweets/:tweetId/", authenticateAPI, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const userQuery = `SELECT user_id from user where username = '${username}';`;
  const dbUser = await db.get(userQuery);
  const userId = dbUser.user_id;

  const tweetQuery = `SELECT tweet_id from tweet where user_id in (SELECT following_user_id from tweet join follower on tweet.user_id = follower.follower_user_id where follower.follower_user_id = ${userId});`;
  const userTweetId = await db.all(tweetQuery);
  const isUserFollowTweetUser = userTweetId.some(
    (each) => each.tweet_id == tweetId
  );
  if (isUserFollowTweetUser === true) {
    const returnTweetQuery = `select tweet.tweet,
        count(like.like_id)as likes,
        count(reply.reply_id)as replies,
        tweet.date_time as dateTime from tweet left join like
        on like.tweet_id = tweet.tweet_id left join reply
        on reply.tweet_id = like.tweet_id
        where tweet.tweet_id = ${tweetId} group by tweet.tweet_id;`;
    const dbResponse = await db.all(returnTweetQuery);
    response.send(dbResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateAPI,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userQuery = `SELECT user_id from user where username = '${username}';`;
    const dbUser = await db.get(userQuery);
    const userId = dbUser.user_id;

    const tweetQuery = `SELECT tweet_id from tweet where user_id in (SELECT following_user_id from tweet join follower on tweet.user_id = follower.follower_user_id where follower.follower_user_id = ${userId});`;
    const userTweetId = await db.all(tweetQuery);
    const isUserFollowTweetUser = userTweetId.some(
      (each) => each.tweet_id == tweetId
    );
    if (isUserFollowTweetUser === true) {
      const returnTweetQuery = `select user.name from user left join like on like.user_id = user.user_id WHERE like.tweet_id = ${tweetId};`;
      const dbResponse = await db.all(returnTweetQuery);
      response.send(arrayToObj(dbResponse.map((each) => each.name)));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateAPI,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userQuery = `SELECT user_id from user where username = '${username}';`;
    const dbUser = await db.get(userQuery);
    const userId = dbUser.user_id;

    const tweetQuery = `SELECT tweet_id from tweet where user_id in (SELECT following_user_id from tweet join follower on tweet.user_id = follower.follower_user_id where follower.follower_user_id = ${userId});`;
    const userTweetId = await db.all(tweetQuery);
    const isUserFollowTweetUser = userTweetId.some(
      (each) => each.tweet_id == tweetId
    );
    if (isUserFollowTweetUser === true) {
      const returnTweetQuery = `select user.name, reply.reply from user left join reply on reply.user_id = user.user_id WHERE reply.tweet_id = ${tweetId};`;
      const dbResponse = await db.all(returnTweetQuery);
      response.send(objToArray(dbResponse));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9
app.get("/user/tweets/", authenticateAPI, async (request, response) => {
  const { username } = request;
  const userQuery = `SELECT user_id from user where username = '${username}';`;
  const dbUser = await db.get(userQuery);
  const userId = dbUser.user_id;
  const tweetQuery = `SELECT 
   tweet,
   (
       SELECT COUNT(like_id)
       FROM like
       WHERE tweet_id=tweet.tweet_id
   ) AS likes,
   (
       SELECT COUNT(reply_id)
       FROM reply
       WHERE tweet_id=tweet.tweet_id  
   ) AS replies,
   date_time AS dateTime
   FROM tweet
   WHERE user_id= ${userId}
   `;
  const dbResponse = await db.all(tweetQuery);
  response.send(dbResponse);
});

//API 10

app.post("/user/tweets/", authenticateAPI, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  var date = new Date();
  var currentDateTime = `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  const userQuery = `SELECT user_id from user where username = '${username}';`;
  const dbUser = await db.get(userQuery);
  const userId = dbUser.user_id;
  const createTweetQuery = `INSERT INTO
        tweet (tweet, user_id, date_time)
        VALUES('${tweet}', ${userId}, '${currentDateTime}');`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", authenticateAPI, async (request, response) => {
  const { tweetId } = request.params;
  const tweetDetails = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const userDetails = await db.get(tweetDetails);
  if (userDetails === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
