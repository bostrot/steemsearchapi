/************************************************
 *                                              * 
 *    steemsearchapi - optimized for dtube      * 
 *                                              * 
 *        © Bostrot https://bostrot.com         * 
 *                                              * 
 *  https://github.com/bostrot/steemsearchapi   *
 *                                              * 
 *            licensed under GPL-3.0            * 
 *                                              * 
 ************************************************/

// include sqlite, request
var Database = require('better-sqlite3');
var request = require('request');
// versioning info
var pjson = require('./package.json');
// for time calculations
var moment = require('moment');
// use sqlite db for indexing
var db = new Database('search.db');
// allow cors
var cors = require('cors');
var async = require("async");

// get usernames from posts and add their videos to the db
// this will add an awful lot of videos to the db. most of them
// are not playable anymore
function findVideos(posts) {
    for (var i in posts) {
        updatePosts("get_discussions_by_blog", function (s) {
            log("Added " + s + " entrie(s).");
        }, posts[i]["author"])
    }
}

// entries in db
var dbEntryNumber = parseInt(db.prepare('SELECT Count(*) FROM search').get()["Count(*)"]);
// db size
var pragma_count = parseInt(db.prepare('PRAGMA page_count;').get()["page_count"]);
var pragma_size = parseInt(db.prepare('PRAGMA page_size;').get()["page_size"]);
var dbSize = pragma_count * pragma_size;

// clean every day from now on
var minutes = 1440,
    interval = minutes * 60 * 1000;
setInterval(function () {
    startup();
}, interval);

var removed = 0;
var kept = 0;
var _allRows;

async function checkOnline() {
    log("Started DB Video online checker");
    var searchDB = db.prepare("Select * from search");
    var hashList = []
    _allRows = searchDB.all();

    log(_allRows.length)
    for (var i in _allRows) {
        // Try to grab the video480hash from json_metadata
        try {
            var video480hash = JSON.parse(_allRows[i]["json_metadata"])["video"]["content"]["video480hash"];
            // Check whether its not null
            if (video480hash !== undefined && video480hash != "") {
                // Push to list with DB ID
                hashList.push({
                    id: _allRows[i]["id"],
                    url: "https://ipfs.io/ipfs/" + video480hash
                });
            } else {
                // Remove videos without video480hash
                try {
                    db.prepare("DELETE from search where id = $id").run({
                        id: _allRows[i]["id"]
                    });

                } catch (e) {
                    log(e)
                }
                removed++;
            }
        } catch (e) {
            // Remove videos without video480hash
            try {
                db.prepare("DELETE from search where id = $id").run({
                    id: _allRows[i]["id"]
                });

            } catch (e) {
                log(e)
            }
            removed++;
        }
        // Now run the video online checker on remaining hashes
        if (i == _allRows.length - 1)
            runRequests(hashList);
    }
}

function runRequests(hashList) {
    // TODO: doesn't work that well, figure something out
    log(hashList.length)
    // Create async task with 100 concurrent tasks
    var q = async.queue(function (task, callback) {
        // Request http head and check whether succeed
        request.head(task.url, function (err, res, body) {
            if (res.statusCode != 200 && res.statusCode != 206) {
                // If not remove it from the DB
                db.prepare("DELETE from search where id = $id").run({
                    id: _allRows[i]["id"]
                });
                removed++;
                log("Removed dead Video.");
                callback("remove");
            } else {
                // Just keep it in the db
                log("Video alive. Skip.");
                kept++;
                callback("keep");
            };
        });
    }, 100);

    // Add url hashlist to queue
    q.push(hashList, function (err) {});


    // Vacuum DB and release space
    q.drain = function (res) {
        db.prepare("VACUUM;").run();
        log("Session results: " + kept + " DB entries kept " + removed + " DB entries removed");
    };
}

function startup() {
    // Remove dead video entries
    checkOnline();

    // trending and hot videos
    updatePosts("get_discussions_by_created", function (sum, posts) {
        findVideos(posts);
    });
    updatePosts("get_discussions_by_trending", function (sum, posts) {
        findVideos(posts);
    });
    updatePosts("get_discussions_by_hot", function (sum, posts) {
        findVideos(posts);
    });
}
startup();

// index posts every minute
// TODO: subscription
var minutes = 1,
    interval = minutes * 60 * 1000;
setInterval(function () {
    updatePosts("get_discussions_by_created", function (s) {
        log("Added " + s + " entrie(s).");
    });
}, interval);

// ssl cert stuff
var fs = require('fs');
var https = require('https');
var privateKey = fs.readFileSync('certs/server.key', 'utf8');
var certificate = fs.readFileSync('certs/server.crt', 'utf8');
var credentials = {
    key: privateKey,
    cert: certificate
};

// api endpoint
var express = require('express');
const app = express();
app.use(cors());
app.get('/search', function (req, res) {
    // handle escaped spaces
    var searchQuery = "";
    try {
        searchQuery = req.originalUrl.split("/search?q=")[1].replace(/%20/g, " ");
    } catch (e) {}

    if (searchQuery !== "") {
        search(searchQuery, function (result) {
            log(searchQuery + " " + req.originalUrl + " " + result.length);
            res.json({
                result: result,
            });
        });
    } else {
        // entries in db
        dbEntryNumber = parseInt(db.prepare('SELECT Count(*) FROM search').get()["Count(*)"]);

        // db size
        pragma_count = parseInt(db.prepare('PRAGMA page_count;').get()["page_count"]);
        pragma_size = parseInt(db.prepare('PRAGMA page_size;').get()["page_size"]);
        dbSize = pragma_count * pragma_size;

        res.json({
            result: "",
            homepage: pjson.homepage,
            name: pjson.name,
            version: pjson.version,
            description: pjson.description,
            author: pjson.author,
            dbEntries: dbEntryNumber,
            dbSize: dbSize,
        })
    }
});

// starting api endpoint server on cloudflare's ssl port 2053
var httpsServer = https.createServer(credentials, app);
httpsServer.listen(2053, () => log("App listening on port " + httpsServer.address().port));

async function updatePosts(posts, callback, user) {
    // get last 100 dtube tag posts
    var requestBody = {
        "id": "1",
        "jsonrpc": "2.0",
        "method": "call",
        "params": [
            "database_api",
            posts, [{
                "tag": "dtube",
                "limit": 100,
                "truncate_body": 1
            }]
        ]
    };
    if (posts == "get_discussions_by_blog") {
        requestBody = {
            "id": "2",
            "jsonrpc": "2.0",
            "method": "call",
            "params": [
                "database_api",
                "get_discussions_by_blog", [{
                    "tag": user,
                    "limit": 100,
                    "truncate_body": 1
                }]
            ]
        };
    }
    request.post({
        url: 'https://api.steemit.com',
        body: requestBody,
        json: true
    }, function (error, response, body) {
        // check whether db table exists and create if not
        var dbTable = db.prepare(`CREATE TABLE IF NOT EXISTS search (id INTEGER PRIMARY KEY AUTOINCREMENT, 
            author TEXT, permlink TEXT, category TEXT, parent_author TEXT, parent_permlink TEXT, title TEXT, 
            json_metadata TEXT, created TEXT, depth TEXT, root_author TEXT, root_permlink TEXT, max_accepted_payout TEXT, 
            percent_steem_dollars TEXT, allow_replies TEXT, allow_votes TEXT, allow_curation_rewards TEXT, 
            url TEXT, root_title TEXT, promoted TEXT, body_length TEXT);`);

        /* db with all keys:
        var dbTable = db.prepare(`CREATE TABLE IF NOT EXISTS search (id INTEGER PRIMARY KEY AUTOINCREMENT, 
            author TEXT, permlink TEXT, category TEXT, parent_author TEXT, parent_permlink TEXT, title TEXT, 
            body TEXT, json_metadata TEXT, last_update TEXT, created TEXT, active TEXT, last_payout TEXT, 
            depth TEXT, children TEXT, net_rshares TEXT, abs_rshares TEXT, vote_rshares TEXT, children_abs_rshares TEXT, 
            cashout_time TEXT, max_cashout_time TEXT, total_vote_weight TEXT, reward_weight TEXT, total_payout_value TEXT, 
            curator_payout_value TEXT, author_rewards TEXT, net_votes TEXT, root_author TEXT, root_permlink TEXT, 
            max_accepted_payout TEXT, percent_steem_dollars TEXT, allow_replies TEXT, allow_votes TEXT, 
            allow_curation_rewards TEXT, beneficiaries TEXT, url TEXT, root_title TEXT, pending_payout_value TEXT, 
            total_pending_payout_value TEXT, active_votes TEXT, replies TEXT, author_reputation TEXT, promoted TEXT, 
            body_length TEXT, reblogged_by TEXT);`);*/

        // run the above command
        dbTable.run();

        // add to db with static object keys returned by Object.keys(body["result"][0])
        var stmt = db.prepare(`INSERT INTO search VALUES ($id, $author, $permlink, $category, $parent_author, 
            $parent_permlink, $title, $json_metadata, $created, $depth, $root_author, $root_permlink, $max_accepted_payout, 
            $percent_steem_dollars, $allow_replies, $allow_votes, $allow_curation_rewards, $url, $root_title, $promoted, 
            $body_length)`);

        /* insert all keys:
        var stmt = db.prepare(`INSERT INTO search VALUES ($id, $author, $permlink, $category, $parent_author,
            $parent_permlink, $title, $body, $json_metadata, $last_update, $created, $active, $last_payout, $depth, 
            $children, $net_rshares, $abs_rshares, $vote_rshares, $children_abs_rshares, $cashout_time, $max_cashout_time, 
            $total_vote_weight, $reward_weight, $total_payout_value, $curator_payout_value, $author_rewards, $net_votes, 
            $root_author, $root_permlink, $max_accepted_payout, $percent_steem_dollars, $allow_replies, $allow_votes, 
            $allow_curation_rewards, $beneficiaries, $url, $root_title, $pending_payout_value, $total_pending_payout_value, 
            $active_votes, $replies, $author_reputation, $promoted, $body_length, $reblogged_by)`);*/

        try {

            var posts = body["result"];

            /* Get below key list formatted for debugging and hardcoding
                for (var i = 0; i < objKeys.length; i++) {
                    console.log(objKeys[i]+": posts[i]['"+objKeys[i]+"'],")
                }
            */

            /* 
             * Hardcode object data to stringify some of it.
             * Then add those to sqlite db while checking whether
             * it already exists.
             */
            var summary = 0;
            if (posts != undefined) {
                for (var i = 0; i < posts.length; i++) {

                    try {
                        var video480hash = JSON.parse(posts[i]["json_metadata"])["video"]["content"]["video480hash"];
                        if (video480hash !== undefined && video480hash != "") {
                            // Videohash is real - add
                            try {
                                stmt.run({
                                    id: posts[i]['id'],
                                    author: posts[i]['author'],
                                    permlink: posts[i]['permlink'],
                                    category: posts[i]['category'],
                                    parent_author: posts[i]['parent_author'],
                                    parent_permlink: posts[i]['parent_permlink'],
                                    title: posts[i]['title'],
                                    //body: posts[i]['body'],
                                    json_metadata: posts[i]['json_metadata'],
                                    //last_update: posts[i]['last_update'],
                                    created: posts[i]['created'],
                                    //active: posts[i]['active'],
                                    //last_payout: posts[i]['last_payout'],
                                    depth: posts[i]['depth'],
                                    //children: posts[i]['children'],
                                    //net_rshares: posts[i]['net_rshares'],
                                    //abs_rshares: posts[i]['abs_rshares'],
                                    //vote_rshares: posts[i]['vote_rshares'],
                                    //children_abs_rshares: posts[i]['children_abs_rshares'],
                                    //cashout_time: posts[i]['cashout_time'],
                                    //max_cashout_time: posts[i]['max_cashout_time'],
                                    //total_vote_weight: posts[i]['total_vote_weight'],
                                    //reward_weight: posts[i]['reward_weight'],
                                    //total_payout_value: posts[i]['total_payout_value'],
                                    //curator_payout_value: posts[i]['curator_payout_value'],
                                    //author_rewards: posts[i]['author_rewards'],
                                    //net_votes: posts[i]['net_votes'],
                                    root_author: posts[i]['root_author'],
                                    root_permlink: posts[i]['root_permlink'],
                                    max_accepted_payout: posts[i]['max_accepted_payout'],
                                    percent_steem_dollars: posts[i]['percent_steem_dollars'],
                                    allow_replies: JSON.stringify(posts[i]['allow_replies']),
                                    allow_votes: JSON.stringify(posts[i]['allow_votes']),
                                    allow_curation_rewards: JSON.stringify(posts[i]['allow_curation_rewards']),
                                    //beneficiaries: JSON.stringify(posts[i]['beneficiaries']),
                                    url: posts[i]['url'],
                                    root_title: posts[i]['root_title'],
                                    //pending_payout_value: posts[i]['pending_payout_value'],
                                    //total_pending_payout_value: posts[i]['total_pending_payout_value'],
                                    //active_votes: JSON.stringify(posts[i]['active_votes']),
                                    //replies: JSON.stringify(posts[i]['replies']),
                                    //author_reputation: posts[i]['author_reputation'],
                                    promoted: posts[i]['promoted'],
                                    body_length: posts[i]['body_length'],
                                    //reblogged_by: JSON.stringify(posts[i]['reblogged_by']),
                                });
                                summary++;
                                //log("Added entry for ID:", posts[i]["id"]);
                            } catch (e) {
                                // entry already exists, ignore
                            }
                        } else {
                            // No video - Do not add
                        }
                    } catch (e) {
                        // No video - Do not add
                    }
                    if (i == posts.length - 1) {
                        callback(summary, posts);
                    }
                }
            }
        } catch (e) {
            log(e);
        }
    });
}

// basic search function that selects a string like in json_metadata
function search(s, callback) {
    // Case insensitive search in whole json_metadata
    var searchDB = db.prepare("Select * from search where json_metadata like '%" + s + "%'");
    var maxRows = 100;
    var currentRow = 0;
    var returnArr = [];
    for (var row of searchDB.iterate()) {
        if (currentRow < maxRows) {
            returnArr.push(row);
            currentRow++;
        }
    }
    callback(returnArr)
}

// Simple logging with timestamp
function log(str) {
    console.log(new Date() + ": " + str);
}