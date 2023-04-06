const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const newDBPath = path.join(__dirname, "./twitterClone.db");
app.use(express.json());

let db;

const initilizationDBAndServer = async () => {
  try {
    db = await open({
      filename: newDBPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => console.log("server is running"));
  } catch (e) {
    console.log(e.message);
  }
};

initilizationDBAndServer();

const MiddleWare = async (request, response, next) => {
  if (request.headers["authorization"] === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const JwtToken = request.headers["authorization"].split(" ")[1];
    console.log(JwtToken);
    if (JwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(JwtToken, "MY_SECRET_TOKEN", async (error, playload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = playload.username;
          next();
        }
      });
    }
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `
        select * from user where username = '${username}'
    `;
  const dbResponse = await db.get(checkUserQuery);
  if (dbResponse === undefined) {
    if (password.length > 5) {
      const modifyPassword = await bcrypt.hash(password, 10);
      const sqlQuery = `
                insert into 
                    user(username , password , name , gender)
                values ('${username}' , '${modifyPassword}', '${name}' , '${gender}')
            `;
      await db.run(sqlQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `
        select * from user where username = '${username}'
    `;
  const dbCheckResponse = await db.get(checkUserQuery);
  console.log(dbCheckResponse);
  if (dbCheckResponse !== undefined) {
    const comparePassword = await bcrypt.compare(
      password,
      dbCheckResponse.password
    );
    if (comparePassword) {
      const playload = {
        username: username,
      };
      const jwtToken = await jwt.sign(playload, "MY_SECRET_TOKEN");
      response.status(200);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get("/user/tweets/feed/", MiddleWare, async (request, response) => {
  const { username } = request;
  const SqlQuery = `
        select username , tweet , date_time as dateTime
        from (user inner join tweet on user.user_id = tweet.user_id)
        where user.user_id in (
            select following_user_id from user inner join follower on user.user_id = follower.follower_user_id where username = '${username}'
        )
        order by dateTime desc , user.user_id asc
        limit 4
        
    `;
  const dbResponse = await db.all(SqlQuery);
  response.status(200);
  response.send(dbResponse);
});

app.get("/user/following/", MiddleWare, async (request, response) => {
  const { username } = request;
  const SqlQuery = `
        select distinct name from user inner join follower on user.user_id = follower.following_user_id
        where following_user_id in (
            select following_user_id from user inner join follower on user.user_id = follower.follower_user_id
            where username = '${username}'
        )
        order by user.user_id asc
    `;
  dbResponse = await db.all(SqlQuery);
  response.status(200);
  response.send(dbResponse);
});

app.get("/user/followers/", MiddleWare, async (request, response) => {
  const { username } = request;
  const SqlQuery = `
        select distinct name from user inner join follower on user.user_id = follower.follower_user_id
        where follower_user_id in (
            select follower_user_id from user inner join follower on user.user_id = follower.following_user_id
            where username = '${username}'
        )
        order by user.user_id
    `;
  dbResponse = await db.all(SqlQuery);
  response.status(200);
  response.send(dbResponse);
});

app.get("/tweets/:tweetId/", MiddleWare, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const SqlQuery = `
        select username from user inner join follower on user.user_id = follower.follower_user_id
        where follower_user_id in (
            select follower_user_id from follower inner join tweet on follower.following_user_id = tweet.user_id
            where tweet_id = '${tweetId}'
        )
        group by username
        having username = '${username}'
    `;
  dbResponse = await db.get(SqlQuery);
  //   response.send(dbResponse);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const personDetailQuery = `
          select tweet ,count(distinct like_id) as likes ,count(distinct reply_id) as replies , Tweet.date_time as dateTime
          from (tweet inner join reply on tweet.tweet_id = reply.tweet_id) as new inner join Like on new.tweet_id = Like.tweet_id
          where tweet.tweet_id = ${tweetId}
          group by tweet.tweet_id = ${tweetId}
        `;
    const dbTweetResponse = await db.get(personDetailQuery);
    response.status(200);
    response.send(dbTweetResponse);
  }
});

app.get("/tweets/:tweetId/likes/", MiddleWare, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const SqlQuery = `
        select username from user inner join follower on user.user_id = follower.follower_user_id
        where follower_user_id in (
            select follower_user_id from follower inner join tweet on follower.following_user_id = tweet.user_id
            where tweet_id = '${tweetId}'
        )
        group by username
        having username = '${username}'
    `;
  dbResponse = await db.get(SqlQuery);
  console.log(dbResponse);
  //   response.send(dbResponse);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const personDetailQuery = `
          select username
          from (user inner join like on user.user_id = like.user_id) 
          where tweet_id = ${tweetId}
          order by user.user_id asc
        `;
    const dbTweetResponse = await db.all(personDetailQuery);
    const object = {
      likes: dbTweetResponse.map((echValue) => echValue.username),
    };
    response.status(200);
    response.send(object);
  }
});

app.get("/tweets/:tweetId/replies/", MiddleWare, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const SqlQuery = `
        select username from user inner join follower on user.user_id = follower.follower_user_id
        where follower_user_id in (
            select follower_user_id from follower inner join tweet on follower.following_user_id = tweet.user_id
            where tweet_id = '${tweetId}'
        )
        group by username
        having username = '${username}'
    `;
  dbResponse = await db.get(SqlQuery);
  //   response.send(dbResponse);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const personDetailQuery = `
          select name , reply
          from (user inner join reply on user.user_id = reply.user_id) 
          where tweet_id = ${tweetId}
        `;
    const dbTweetResponse = await db.all(personDetailQuery);
    const object = {
      replies: dbTweetResponse.map((echValue) => echValue),
    };
    response.status(200);
    response.send(object);
  }
});

app.get("/user/tweets/", MiddleWare, async (request, response) => {
  const { username } = request;
  const personDetailQuery = `
          select tweet ,count(distinct like_id) as likes ,count(distinct reply_id) as replies , Tweet.date_time as dateTime
          from (tweet inner join reply on tweet.tweet_id = reply.tweet_id) as new inner join Like on new.tweet_id = Like.tweet_id
          where tweet.tweet_id in (
              select distinct tweet_id from user inner join tweet on user.user_id = tweet.user_id where username = '${username}'
          )
          group by tweet.tweet_id
          order by tweet.tweet_id asc
        `;
  const dbResponse = await db.all(personDetailQuery);
  response.send(dbResponse);
});

app.post("/user/tweets/", MiddleWare, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const newDate = new Date();
  const setDateAndTime =
    newDate.getFullYear() +
    "-" +
    newDate.getMonth() +
    "-" +
    newDate.getDate() +
    " " +
    newDate.getHours() +
    ":" +
    newDate.getMinutes() +
    ":" +
    newDate.getSeconds();
  const findUserId = `
        select distinct user_id from user where username = '${username}'
  `;
  const dbResponse = await db.get(findUserId);
  const setQuery = `
    insert into tweet(
        tweet , user_id , date_time
    )
    values (
        '${tweet}' , ${dbResponse.user_id} , '${setDateAndTime}'
    )
  `;
  await db.run(setQuery);
  response.status(200);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", MiddleWare, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectQuery = `
        select tweet_id from user inner join tweet on user.user_id = tweet.user_id where tweet_id = ${tweetId}
        group by tweet_id having  username='${username}'
    `;
  const dbResponse = await db.all(selectQuery);
  console.log(dbResponse);
  if (dbResponse.length === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const createQuery = `
        delete from tweet where tweet_id in (
            select tweet_id from user inner join tweet on user.user_id = tweet.user_id where tweet_id = ${tweetId}
            group by tweet_id having  username='${username}'
        )
      `;
    await db.run(createQuery);
    response.status(200);
    response.send("Tweet Removed");
  }
});

module.exports = app;
